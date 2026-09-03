import vscode from 'vscode';
import type { OpenAIChatMessage, OpenAIContentPart, OpenAIToolCall } from '../types';
import { VISION_IMAGE_MAX_RAW_BYTES } from '../consts';
import { safeJsonStringify } from '../json';
import { logger } from '../logger';
import { fingerprintAssistantTurn, type ReasoningCache } from './cache';
import { sanitizeFunctionName } from './sanitize';

/**
 * Convert VS Code chat messages to OpenAI/DeepSeek-compatible format.
 *
 * Strict invariants the DeepSeek API enforces (and that we must preserve):
 *
 *   1. Every `tool` message MUST be preceded — somewhere up the chain — by
 *      an `assistant` message containing a `tool_calls` entry with the same
 *      `tool_call_id`. A tool message without its matching tool_call yields:
 *
 *         400  "Messages with role 'tool' must be a response to a
 *               preceding message with 'tool_calls'"
 *
 *   2. In thinking-mode requests, every prior `assistant` turn must carry
 *      `reasoning_content` once tool_calls have been emitted at any point
 *      in the conversation. Missing it also yields a 400. We attach `""`
 *      as a safe fallback when the cache has no entry — the chain is lost
 *      but the conversation survives.
 *
 *   3. Tool result messages must follow the assistant message that
 *      produced their tool_calls (i.e. before the next user-typed text in
 *      the same VS Code "turn", since VS Code can bundle tool_result parts
 *      and follow-up user text inside one User message).
 *
 *   4. (Native vision only) image parts are accepted ONLY in `user`
 *      messages — anywhere else is a 400 — so images in other roles are
 *      dropped with a warning rather than forwarded.
 */
export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  isThinkingModel: boolean,
  reasoningCache: ReasoningCache,
  nativeVision = false,
): OpenAIChatMessage[] {
  const result: OpenAIChatMessage[] = [];

  // Set of tool_call_ids that have been emitted by some prior assistant
  // message and are still waiting for a matching tool result. We use this
  // to drop orphan tool_result parts (no matching open tool_call) so the
  // API doesn't 400 us with the "tool must follow tool_calls" error.
  const openToolCallIds = new Set<string>();

  let droppedOrphanToolResults = 0;
  let droppedImageParts = 0;

  for (const msg of messages) {
    const role = mapRole(msg.role);
    let content = '';
    // On the native-vision path, user-message parts are ALSO collected in
    // encounter order so text/image interleaving survives; used only when at
    // least one image made it through (`content` stays authoritative otherwise).
    const orderedParts: OpenAIContentPart[] = [];
    let imageCount = 0;
    const toolCalls: OpenAIToolCall[] = [];
    const toolResults: Array<{ callId: string; content: string }> = [];

    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          content = content ? `${content}\n${part.value}` : part.value;
          orderedParts.push({ type: 'text', text: part.value });
          continue;
        }

        if (
          nativeVision &&
          part instanceof vscode.LanguageModelDataPart &&
          part.mimeType.startsWith('image/')
        ) {
          if (role !== 'user' || part.data.byteLength > VISION_IMAGE_MAX_RAW_BYTES) {
            droppedImageParts += 1;
            continue;
          }
          const base64 = Buffer.from(part.data).toString('base64');
          orderedParts.push({
            type: 'image_url',
            image_url: { url: `data:${part.mimeType};base64,${base64}` },
          });
          imageCount += 1;
          continue;
        }

        if (part instanceof vscode.LanguageModelToolCallPart) {
          const id = part.callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          toolCalls.push({
            id,
            type: 'function',
            function: {
              // Sanitize to match the tool definitions request.ts sends (the
              // API rejects names outside its charset). A no-op for the common
              // case of already-valid names; keeps the wire name consistent
              // with the reasoning-cache fingerprint computed in stream.ts.
              name: sanitizeFunctionName(part.name),
              arguments: safeJsonStringify(part.input ?? {}),
            },
          });
          continue;
        }

        if (part instanceof vscode.LanguageModelToolResultPart) {
          const toolContent = part.content
            .filter(
              (item): item is vscode.LanguageModelTextPart =>
                item instanceof vscode.LanguageModelTextPart,
            )
            .map((item) => item.value)
            .join('\n');

          toolResults.push({
            callId: part.callId,
            content: toolContent || stringifyToolResultContent(part.content),
          });
        }
      }
    } else if (typeof msg.content === 'string') {
      content = msg.content;
    }

    // 1. Assistant messages: emit the assistant turn first so any
    //    tool_calls register `openToolCallIds`.
    if (role === 'assistant') {
      if (content || toolCalls.length > 0) {
        const assistantMessage: OpenAIChatMessage = {
          role: 'assistant',
          content: content || '',
        };

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
          for (const tc of toolCalls) {
            openToolCallIds.add(tc.id);
          }
        }

        if (isThinkingModel) {
          const fingerprint = fingerprintAssistantTurn({
            text: content,
            toolCalls: toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name })),
          });

          if (fingerprint) {
            // Cache hit → reuse the original chain. Cache miss → empty string
            // fallback prevents the 400 the API throws when reasoning_content
            // is missing on a prior assistant turn in thinking mode.
            assistantMessage.reasoning_content = reasoningCache.get(fingerprint) ?? '';
          } else {
            assistantMessage.reasoning_content = '';
          }
        }

        result.push(assistantMessage);
      }
    } else if (toolCalls.length > 0) {
      // Defensive: VS Code shouldn't put tool_call parts in a non-assistant
      // message, but if it ever does, emit them as an assistant turn so the
      // upcoming tool results don't get rejected as orphans.
      const assistantMessage: OpenAIChatMessage = {
        role: 'assistant',
        content: content || '',
        tool_calls: toolCalls,
      };
      for (const tc of toolCalls) {
        openToolCallIds.add(tc.id);
      }
      if (isThinkingModel) {
        assistantMessage.reasoning_content = '';
      }
      result.push(assistantMessage);
      content = ''; // already emitted with the assistant turn
      // Keep only image parts: their text siblings just went out above.
      orderedParts.splice(
        0,
        orderedParts.length,
        ...orderedParts.filter((p) => p.type === 'image_url'),
      );
    }

    // 2. Tool result messages — only emit if there is a matching open
    //    tool_call_id. Orphans are dropped (and counted) instead of
    //    being passed to the API where they would 400 the request.
    for (const toolResult of toolResults) {
      if (!openToolCallIds.has(toolResult.callId)) {
        droppedOrphanToolResults += 1;
        continue;
      }

      result.push({
        role: 'tool',
        tool_call_id: toolResult.callId,
        content: toolResult.content,
      });
      openToolCallIds.delete(toolResult.callId);
    }

    // 3. Non-assistant text (system / user) follows tool results in this
    //    same VS Code message turn. With native images present the content
    //    goes out as an ordered parts array; plain string otherwise.
    if (role !== 'assistant') {
      if (imageCount > 0) {
        result.push({ role, content: orderedParts });
      } else if (content) {
        result.push({ role, content });
      }
    }
  }

  // Cleanup: if there are still open tool_calls when we exit (i.e. the
  // last assistant emitted tool_calls but the host hasn't fed back tool
  // results yet), that's expected — the model will respond to that
  // assistant turn next. Nothing to do.
  if (droppedOrphanToolResults > 0) {
    logger.warn(
      `convertMessages: dropped ${droppedOrphanToolResults} orphan tool_result part(s) — no matching open tool_call in history`,
    );
  }

  if (droppedImageParts > 0) {
    logger.warn(
      `convertMessages: dropped ${droppedImageParts} image part(s) — DeepSeek vision only accepts images in user messages, under 32 MiB encoded`,
    );
  }

  return result;
}

function mapRole(role: vscode.LanguageModelChatMessageRole): 'system' | 'user' | 'assistant' {
  const USER = vscode.LanguageModelChatMessageRole.User as unknown as number;
  const ASSISTANT = vscode.LanguageModelChatMessageRole.Assistant as unknown as number;
  const r = role as unknown as number;
  if (r === USER) return 'user';
  if (r === ASSISTANT) return 'assistant';
  return 'system';
}

function stringifyToolResultContent(parts: ReadonlyArray<unknown>): string {
  // VS Code 1.118+ may append an internal LanguageModelDataPart sentinel
  // (mimeType "cache_control", data "ephemeral") at the end of tool-result
  // turns. Drop it silently; warn on truly unknown shapes.
  const acc: string[] = [];
  for (const item of parts) {
    if (item instanceof vscode.LanguageModelTextPart) {
      acc.push(item.value);
    } else if (typeof item === 'string') {
      acc.push(item);
    } else {
      const isObj = !!item && typeof item === 'object';
      const mimeType = isObj ? (item as { mimeType?: unknown }).mimeType : undefined;
      if (mimeType !== 'cache_control') {
        try {
          acc.push(safeJsonStringify(item));
        } catch {
          /* ignore */
        }
      }
    }
  }
  return acc.join('\n');
}
