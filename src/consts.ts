export const WALKTHROUGH_ID = 'konstantyn-ganenkov.deepseek-pilot#deepseekPilotGettingStarted';
export const WELCOME_SHOWN_KEY = 'deepseek-pilot.welcomeShown';

/** Prefix/suffix wrapping image descriptions so the model knows they are proxy text. */
export const IMAGE_DESCRIPTION_PREFIX = '[Image Description: ';
export const IMAGE_DESCRIPTION_SUFFIX = ']';
export const IMAGE_DESCRIPTION_UNAVAILABLE = '[Image Description unavailable]';

/**
 * MIME type for reporting actual API usage via LanguageModelDataPart.
 * Copilot Chat's BYOK consumer (bundled with VS Code 1.120+) checks
 * `mimeType === "usage"` literally, then parses the JSON and requires
 * `prompt_tokens`, `completion_tokens`, and `total_tokens` to be numbers
 * (OpenAI shape — DeepSeek matches). Older hosts that don't recognise this
 * MIME simply ignore the data part.
 */
export const USAGE_MIME_TYPE = 'usage';

/** Max tools per request DeepSeek will accept (used as the toolCalling cap). */
export const MAX_TOOLS_PER_REQUEST = 128;

/**
 * `detailPrefix` is the static half of the picker's `detail` line; the live
 * per-Mtok rate is appended at display time (see `toChatInfo`), because
 * DeepSeek's peak and off-peak rates differ by 2x and a string baked in at
 * module load would go stale in a long-running window. Pricing itself lives in
 * [pricing.ts](src/pricing.ts).
 */
export const MODELS = [
  {
    id: 'deepseek-v4-pro::thinking',
    name: 'DeepSeek V4 Pro (thinking)',
    description: 'DeepSeek V4 Pro — strongest, extended thinking, 1M context',
    detailPrefix: 'Pro · thinking',
    vendor: 'deepseek-pilot',
    family: 'deepseek-v4-pro',
    version: 'thinking',
    maxInputTokens: 655360,
    maxOutputTokens: 393216,
    thinking: true,
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: 'DeepSeek V4 Pro — strong, no extended thinking, lower latency',
    detailPrefix: 'Pro · fast',
    vendor: 'deepseek-pilot',
    family: 'deepseek-v4-pro',
    version: 'default',
    maxInputTokens: 983040,
    maxOutputTokens: 65536,
    thinking: false,
  },
  {
    id: 'deepseek-v4-flash::thinking',
    name: 'DeepSeek V4 Flash (thinking)',
    description: 'DeepSeek V4 Flash — cheapest with extended thinking',
    detailPrefix: 'Flash · thinking',
    vendor: 'deepseek-pilot',
    family: 'deepseek-v4-flash',
    version: 'thinking',
    maxInputTokens: 655360,
    maxOutputTokens: 393216,
    thinking: true,
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'DeepSeek V4 Flash — cheapest, no extended thinking',
    detailPrefix: 'Flash · fast',
    vendor: 'deepseek-pilot',
    family: 'deepseek-v4-flash',
    version: 'default',
    maxInputTokens: 983040,
    maxOutputTokens: 65536,
    thinking: false,
  },
] as const;

/** Settings (Copilot Chat 1.121) for routing utility flows through a chosen model. */
export const COPILOT_UTILITY_MODEL_SETTING = 'chat.utilityModel';
export const COPILOT_UTILITY_SMALL_MODEL_SETTING = 'chat.utilitySmallModel';
