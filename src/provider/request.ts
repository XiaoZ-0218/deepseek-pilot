import vscode from 'vscode';
import type { OpenAIChatMessage, OpenAIFunctionToolDef } from '../types';
import type { AuthManager } from '../auth';
import type { ReasoningCache } from './cache';
import { convertMessages } from './convert';
import { resolveImageMessages, type VisionDescriptionCacheStats } from './vision/index';
import { logger } from '../logger';
import { safeJsonStringify } from '../json';
import { MODELS } from '../consts';
import {
  getApiModelId,
  getApiUrl,
  getMaxTokens,
  getOptimizeUtilityRequests,
  isOfficialBaseUrl,
} from '../config';
import { getConfiguredThinkingEffort, type ModelConfigurationOptions } from './models';
import { sanitizeFunctionName, sanitizeSchema } from './sanitize';
import { isUtilityRequest } from './request-kind';
import { validateRequest } from './validate';
import { logCacheTraceSnapshot, snapshotCacheTrace } from './diagnostics';

export interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  model: string;
  thinking: boolean;
  stream: boolean;
  inputCharCount: number;
  cacheDiagnostics: VisionDescriptionCacheStats;
  /**
   * Maps sanitized tool function names back to the original names VS Code gave
   * us. DeepSeek requires names matching `^[a-zA-Z][a-zA-Z0-9_-]*$`, so we
   * sanitize before sending; the streamed tool call echoes the sanitized name,
   * but the host routes tool calls by the ORIGINAL name — stream.ts uses this
   * to translate back. Empty when no name needed sanitizing (the common case).
   */
  toolNameMap: ReadonlyMap<string, string>;
}

const MAX_TOOLS_PER_REQUEST = 128;

export async function prepareChatRequest(params: {
  authManager: AuthManager;
  modelInfo: vscode.LanguageModelChatInformation;
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  options: vscode.ProvideLanguageModelChatResponseOptions;
  token: vscode.CancellationToken;
  reasoningCache: ReasoningCache;
  getVisionModel: () => Promise<vscode.LanguageModelChat | null>;
}): Promise<PreparedRequest> {
  const { authManager, modelInfo, messages, options, token, reasoningCache, getVisionModel } =
    params;

  const apiKey = await authManager.getApiKey();
  if (!apiKey) throw new Error('DeepSeek API key not configured');

  if (token.isCancellationRequested) throw new vscode.CancellationError();

  // Sanity check the host-provided history. We do NOT throw on validation
  // failure — convertMessages drops orphans defensively — but a warning
  // surfaces the underlying issue when the user reports a 400.
  const validation = validateRequest(messages);
  if (validation) {
    logger.warn(`Request validation: ${validation}`);
  }

  // Resolve images via vision proxy (drops images if no vision model).
  const { resolvedMessages, stats: cacheDiagnostics } = await resolveImageMessages(
    messages,
    getVisionModel,
  );

  if (token.isCancellationRequested) throw new vscode.CancellationError();

  const variant = MODELS.find((m) => m.id === modelInfo.id);
  if (!variant) throw new Error(`Unknown model: ${modelInfo.id}`);

  // A thinking variant normally enables reasoning, but Copilot's lightweight
  // auxiliary flows (chat titles, commit messages, etc.) get no benefit from
  // it. When we detect one — and only against the official endpoint, since a
  // proxy may map models differently — force thinking off to save reasoning
  // tokens and latency. See request-kind.ts.
  const variantThinking = variant.version === 'thinking';
  const hasTools = !!(options.tools && options.tools.length > 0);
  const thinking =
    variantThinking &&
    !(getOptimizeUtilityRequests() && isOfficialBaseUrl() && isUtilityRequest(messages, hasTools));
  if (variantThinking && !thinking) {
    logger.info('[req] utility flow detected — forcing thinking off to save reasoning tokens');
  }

  // Convert to OpenAI format. The convert step:
  //   - enforces tool_call → tool_result ordering
  //   - drops orphan tool_result parts (no matching open tool_call)
  //   - attaches reasoning_content from cache (or "" fallback) on thinking-mode
  const openaiMessages = convertMessages(resolvedMessages, thinking, reasoningCache);

  if (openaiMessages.length === 0) {
    throw new Error('No messages to send after conversion');
  }

  // Convert tool definitions through the sanitization pipeline.
  const toolNameMap = new Map<string, string>();
  let tools: OpenAIFunctionToolDef[] | undefined;
  let toolChoice:
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } }
    | undefined;
  if (options.tools && options.tools.length > 0) {
    if (options.tools.length > MAX_TOOLS_PER_REQUEST) {
      throw new Error(`Cannot have more than ${MAX_TOOLS_PER_REQUEST} tools per request.`);
    }
    tools = options.tools
      .filter((t) => t && typeof t === 'object')
      .map((t) => {
        const name = sanitizeFunctionName(t.name);
        // Record the reverse mapping so stream.ts can emit the tool call under
        // the original name the host knows (it routes by that, not the
        // sanitized name). Only stored when sanitizing actually changed it.
        if (name !== t.name) toolNameMap.set(name, t.name);
        const description = typeof t.description === 'string' ? t.description : '';
        const parameters = sanitizeSchema(t.inputSchema ?? { type: 'object', properties: {} });
        return {
          type: 'function' as const,
          function: { name, description, parameters },
        };
      });

    toolChoice = 'auto';
    if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
      // DeepSeek supports the OpenAI-standard tool_choice. Force a specific tool
      // when there's exactly one; otherwise use the generic "required" literal
      // (the model must call some tool) — previously we threw for >1 tool.
      toolChoice =
        tools.length === 1
          ? { type: 'function', function: { name: tools[0]!.function.name } }
          : 'required';
    }
  }

  const body: Record<string, unknown> = {
    model: getApiModelId(variant.family),
    messages: openaiMessages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
  }

  if (thinking) {
    const reasoningEffort = getConfiguredThinkingEffort(options as ModelConfigurationOptions);
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = reasoningEffort;
    logger.info(`[req] reasoning_effort=${reasoningEffort} (variant=${variant.id})`);
    // Per DeepSeek docs: temperature/top_p/penalty params are silently ignored
    // in thinking mode. We omit them so the request body matches what the API
    // actually consumes.
  } else {
    // CRITICAL: thinking.type defaults to "enabled" on the API side. For our
    // non-thinking variants we MUST explicitly disable it, otherwise the
    // non-thinking and thinking variants behave identically over the wire.
    body.thinking = { type: 'disabled' };

    // DeepSeek accepts temperature in [0, 2]; clamp a host value so it can't
    // 422 the request. Default 0.7 favors more deterministic coding output.
    const requestedTemp = options.modelOptions?.temperature;
    body.temperature = typeof requestedTemp === 'number' ? clamp(requestedTemp, 0, 2) : 0.7;

    // Allow-list non-thinking tuning options from the host.
    const mo = options.modelOptions as Record<string, unknown> | undefined;
    if (mo) {
      // `stop`: DeepSeek caps at 16 sequences — trim longer arrays.
      if (typeof mo.stop === 'string') {
        body.stop = mo.stop;
      } else if (Array.isArray(mo.stop)) {
        body.stop = mo.stop.slice(0, 16);
      }
      if (typeof mo.top_p === 'number') body.top_p = clamp(mo.top_p, 0, 1);
      if (typeof mo.logprobs === 'boolean') body.logprobs = mo.logprobs;
      if (typeof mo.top_logprobs === 'number') {
        body.top_logprobs = Math.min(20, Math.max(0, mo.top_logprobs));
      }
      // frequency_penalty / presence_penalty are no longer supported by the
      // DeepSeek V4 API (api-docs.deepseek.com/api/create-chat-completion) —
      // intentionally not forwarded.
    }
  }

  // Cross-mode passthroughs (apply equally to thinking & non-thinking).
  const mo = options.modelOptions as Record<string, unknown> | undefined;
  if (mo) {
    // response_format — `{"type": "json_object"}` enables JSON-mode output.
    // Stable: thinking + JSON mode is supported; the model must be prompted
    // to actually emit JSON (the API doesn't enforce schema beyond well-formed
    // JSON output).
    if (
      mo.response_format &&
      typeof mo.response_format === 'object' &&
      (mo.response_format as { type?: unknown }).type === 'json_object'
    ) {
      body.response_format = { type: 'json_object' };
    }

    // user_id — DeepSeek's tracking identifier (max 512 chars, [a-zA-Z0-9_-]).
    // Accept either OpenAI-style `user` or native `user_id`; sanitize to the
    // documented charset before forwarding.
    const rawUserId = mo.user_id ?? mo.user;
    if (typeof rawUserId === 'string' && rawUserId.length > 0) {
      const sanitized = rawUserId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 512);
      if (sanitized) body.user_id = sanitized;
    }
  }

  const requestedMaxTokens =
    typeof options.modelOptions?.max_tokens === 'number' && options.modelOptions.max_tokens > 0
      ? Math.min(options.modelOptions.max_tokens, variant.maxOutputTokens)
      : undefined;
  const configuredMaxTokens = getMaxTokens();
  const maxTokens =
    requestedMaxTokens ??
    (configuredMaxTokens > 0
      ? Math.min(configuredMaxTokens, variant.maxOutputTokens)
      : variant.maxOutputTokens);
  if (maxTokens) body.max_tokens = maxTokens;

  const inputCharCount = countRequestChars(openaiMessages, tools);

  // Debug-only: snapshot the converted message sequence so 400 errors are
  // easy to diagnose from the output channel. No raw content is logged.
  logCacheTraceSnapshot(snapshotCacheTrace(openaiMessages, tools?.length ?? 0));

  return {
    url: getApiUrl('chat/completions'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: safeJsonStringify(body),
    model: variant.family,
    thinking,
    stream: true,
    inputCharCount,
    cacheDiagnostics,
    toolNameMap,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function countRequestChars(
  messages: readonly OpenAIChatMessage[],
  tools: readonly OpenAIFunctionToolDef[] | undefined,
): number {
  let totalChars = 0;

  for (const message of messages) {
    totalChars += message.content?.length ?? 0;
    totalChars += message.reasoning_content?.length ?? 0;

    for (const toolCall of message.tool_calls ?? []) {
      totalChars += toolCall.function.name.length;
      totalChars += toolCall.function.arguments.length;
    }
  }

  if (tools && tools.length > 0) {
    totalChars += safeJsonStringify(tools).length;
  }

  return totalChars;
}
