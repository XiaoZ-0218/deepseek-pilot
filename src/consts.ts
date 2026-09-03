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
    nativeVision: false,
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
    nativeVision: false,
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
    nativeVision: false,
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
    nativeVision: false,
  },
  // DeepSeek's first multimodal model (released 2026-08-21). Billed at Flash
  // rates; images cost at most VISION_IMAGE_TOKEN_CAP tokens each. Explicitly
  // labeled experimental by DeepSeek — surfaced in the description so users
  // know it may change or disappear.
  {
    id: 'deepseek-v4-flash-vision-exp::thinking',
    name: 'DeepSeek V4 Flash Vision (thinking)',
    description: 'DeepSeek V4 Flash Vision — native image input, extended thinking (experimental)',
    detailPrefix: 'Flash Vision · thinking',
    vendor: 'deepseek-pilot',
    family: 'deepseek-v4-flash-vision-exp',
    version: 'thinking',
    maxInputTokens: 655360,
    maxOutputTokens: 393216,
    thinking: true,
    nativeVision: true,
  },
  {
    id: 'deepseek-v4-flash-vision-exp',
    name: 'DeepSeek V4 Flash Vision',
    description:
      'DeepSeek V4 Flash Vision — native image input, no extended thinking (experimental)',
    detailPrefix: 'Flash Vision · fast',
    vendor: 'deepseek-pilot',
    family: 'deepseek-v4-flash-vision-exp',
    version: 'default',
    maxInputTokens: 983040,
    maxOutputTokens: 65536,
    thinking: false,
    nativeVision: true,
  },
] as const;

/** The API model id of DeepSeek's native vision model (also a `MODELS` family). */
export const NATIVE_VISION_MODEL_ID = 'deepseek-v4-flash-vision-exp';

/**
 * DeepSeek converts an image to at most this many tokens (dimension-based,
 * capped; larger images are resized to ~800x800 server-side). Used for
 * token estimation on native-vision variants and for the cost of an image
 * in the converted-request character count.
 */
export const VISION_IMAGE_TOKEN_CAP = 384;

/**
 * Per-image raw-byte guard for native vision. DeepSeek caps base64 images at
 * 32 MiB *encoded* and the whole request body at 48 MiB; base64 inflates by
 * 4/3, so 24 MiB of raw bytes is the largest image that can't trip the
 * per-image cap. Oversized images are dropped with a warning instead of
 * letting the API 400 the whole request.
 */
export const VISION_IMAGE_MAX_RAW_BYTES = 24 * 1024 * 1024;

/** Settings (Copilot Chat 1.121) for routing utility flows through a chosen model. */
export const COPILOT_UTILITY_MODEL_SETTING = 'chat.utilityModel';
export const COPILOT_UTILITY_SMALL_MODEL_SETTING = 'chat.utilitySmallModel';
