import vscode from 'vscode';

/**
 * Copilot Chat fires many small auxiliary requests against the active model —
 * generating chat titles, commit messages, branch names, rename suggestions,
 * categorizing prompts, summarizing history, etc. None of these benefit from
 * extended reasoning, so when a `(thinking)` variant happens to be the active
 * model we force thinking OFF for them to avoid burning reasoning tokens (and
 * seconds of latency) on trivial work. Both deepseek-v4-for-copilot and
 * deepseek-v4-vscode-chat ship the same optimization.
 *
 * Detection is by the distinctive system-prompt fragments Copilot uses for
 * these flows, AND requires that the request carries no tools (the real
 * agentic loop always passes tools). It is deliberately conservative:
 *
 *   - A missed match just means a trivial request keeps thinking on — a little
 *     wasted cost, no correctness impact.
 *   - A false positive would only ever drop reasoning on a genuine Copilot
 *     helper flow (which doesn't need it anyway). Because these prompts are
 *     authored by Copilot — not the user — matching the SYSTEM message is safe:
 *     users don't write system prompts in chat, so a normal "ask" turn (whose
 *     system prompt is the main coding-assistant prompt) never matches.
 *
 * The markers are necessarily heuristic — Copilot's internal prompts are not a
 * public contract and may change between releases. If they drift, the only
 * effect is that the optimization stops firing.
 */
const UTILITY_SYSTEM_PROMPT_MARKERS = [
  'pithy', // chat title generation ("expert in crafting pithy ... titles")
  'short, descriptive title',
  'one-line summary',
  'summarize the conversation',
  'commit message', // git commit message generation
  'suggest a branch name', // git branch name
  'branch name for', //
  'suggest names for', // rename suggestions
  'rename suggestion',
  'categorize the', // prompt categorizer / intent detection
  'classify the user',
];

// The public LanguageModelChatMessageRole enum only declares User(1)/Assistant(2),
// but the host can deliver a numeric System role (3) the typedef omits — so we
// compare numerically rather than against a named member that doesn't exist.
const ROLE_USER = vscode.LanguageModelChatMessageRole.User as unknown as number;
const ROLE_ASSISTANT = vscode.LanguageModelChatMessageRole.Assistant as unknown as number;

function extractInstructionText(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): string {
  const chunks: string[] = [];
  messages.forEach((msg, i) => {
    const role = msg.role as unknown as number;
    if (role === ROLE_ASSISTANT) return; // assistant turns never carry the flow signature
    // The signature lives in the instruction prompt: a system-role message, or —
    // when the host has no system role — the leading message. Skip later user
    // turns so a long conversation's content can't trip a false match.
    if (role === ROLE_USER && i !== 0) return;
    if (typeof msg.content === 'string') {
      chunks.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part instanceof vscode.LanguageModelTextPart) chunks.push(part.value);
      }
    }
  });
  // Only the leading section of the prompt carries the flow signature; cap the
  // scan so a huge main-agent system prompt stays cheap to test.
  return chunks.join('\n').slice(0, 4000).toLowerCase();
}

/**
 * True when the request looks like one of Copilot's lightweight auxiliary
 * flows. `hasTools` must reflect whether the request carries tool definitions.
 */
export function isUtilityRequest(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  hasTools: boolean,
): boolean {
  if (hasTools) return false; // the real agentic loop always passes tools
  const instructionText = extractInstructionText(messages);
  if (!instructionText) return false;
  return UTILITY_SYSTEM_PROMPT_MARKERS.some((m) => instructionText.includes(m));
}
