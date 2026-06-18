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
 * Per-million-token pricing (USD) for the model-picker `detail` hint and the
 * native cost fields only — `input` is the cache-miss rate, `output` the
 * completion rate. These mirror the cache-miss/output columns of the PRICING
 * table in balance.ts (the source of truth for cost computation). Current as
 * of DeepSeek V4 (https://api-docs.deepseek.com/quick_start/pricing): Pro
 * $0.435/$0.87, Flash $0.14/$0.28 per Mtok. Pro's permanent 75%-off rate is
 * already baked in here — the earlier $1.74/$3.48 figure was the pre-discount
 * price and made the picker overstate Pro's cost 4x.
 */
const PRICE_USD = {
  pro: { input: 0.435, output: 0.87, cacheHit: 0.003625 },
  flash: { input: 0.14, output: 0.28, cacheHit: 0.0028 },
} as const;

function priceHint(family: 'pro' | 'flash'): string {
  const p = PRICE_USD[family];
  return `$${p.input}/$${p.output} per Mtok in/out`;
}

/**
 * Per-Mtok cost strings for the (non-public) native cost fields Copilot Chat
 * renders in the model picker. Best-effort: hosts that don't recognise the
 * fields ignore them, and the `detail` string carries the same numbers as a
 * fallback. `cacheCost` is the cache-hit input rate.
 */
export function priceFields(family: 'deepseek-v4-pro' | 'deepseek-v4-flash'): {
  inputCost: string;
  outputCost: string;
  cacheCost: string;
} {
  const p = PRICE_USD[family === 'deepseek-v4-flash' ? 'flash' : 'pro'];
  return {
    inputCost: `$${p.input}`,
    outputCost: `$${p.output}`,
    cacheCost: `$${p.cacheHit}`,
  };
}

export const MODELS = [
  {
    id: 'deepseek-v4-pro::thinking',
    name: 'DeepSeek V4 Pro (thinking)',
    description: 'DeepSeek V4 Pro — strongest, extended thinking, 1M context',
    detail: `Pro · thinking · ${priceHint('pro')}`,
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
    detail: `Pro · fast · ${priceHint('pro')}`,
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
    detail: `Flash · thinking · ${priceHint('flash')}`,
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
    detail: `Flash · fast · ${priceHint('flash')}`,
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
