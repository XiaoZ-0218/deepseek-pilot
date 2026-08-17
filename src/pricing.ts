/**
 * DeepSeek V4 per-million-token pricing — the single source of truth for both
 * the model-picker hints and the status-bar cost estimate.
 *
 * Sources: https://api-docs.deepseek.com/quick_start/pricing (USD) and its
 * zh-cn counterpart (CNY), both read 2026-08-17.
 *
 * Effective **2026-08-16 16:00 UTC** DeepSeek bills on a peak/off-peak
 * schedule rather than one flat rate. Peak is 01:00-04:00 and 06:00-10:00 UTC;
 * the zh-cn page states the same window as 09:00-12:00 and 14:00-18:00 Beijing
 * time, which is UTC+8, so the two agree. Every other hour is off-peak at
 * exactly half the peak rate.
 *
 * This is a price INCREASE, not a relabelled discount: the off-peak column
 * sits above every rate the extension shipped through v0.4.3 (which encoded
 * the flat post-promo card — Pro at $0.435 cache-miss / $0.87 output). Those
 * figures understated real spend by roughly 1.5x off-peak and up to 4.7x at
 * peak, so they are replaced outright rather than kept as a fallback.
 */

export type ModelFamily = 'deepseek-v4-pro' | 'deepseek-v4-flash';
export type PricingCurrency = 'USD' | 'CNY';
export type RateTier = 'peak' | 'off-peak';

export interface Rates {
  readonly cacheHit: number;
  readonly cacheMiss: number;
  readonly output: number;
}

/**
 * Peak-hour rates per 1M tokens, quoted cell-for-cell from the pricing page.
 * Off-peak is derived rather than listed a second time: the published off-peak
 * column is an exact half of every cell here, and halving a double only
 * decrements the exponent, so the derived values equal the printed ones.
 */
const PEAK_RATES: Record<PricingCurrency, Record<ModelFamily, Rates>> = {
  USD: {
    'deepseek-v4-pro': { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
    'deepseek-v4-flash': { cacheHit: 0.014, cacheMiss: 0.44, output: 1.32 },
  },
  CNY: {
    'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 },
    'deepseek-v4-flash': { cacheHit: 0.1, cacheMiss: 3, output: 9 },
  },
};

/** "Off-peak rates are half of the peak rates" — the pricing page. */
const OFF_PEAK_FACTOR = 0.5;

/** Peak windows as UTC hour ranges, `[startInclusive, endExclusive)`. */
const PEAK_WINDOWS_UTC: readonly (readonly [number, number])[] = [
  [1, 4],
  [6, 10],
];

/** Peak schedule in prose, for tooltips and settings copy. */
export const PEAK_WINDOW_DESCRIPTION = '01:00-04:00 and 06:00-10:00 UTC';

export function getRateTier(at: Date = new Date()): RateTier {
  const hour = at.getUTCHours();
  // Note 04:00-06:00 UTC falls BETWEEN the two peak windows and is off-peak.
  return PEAK_WINDOWS_UTC.some(([from, to]) => hour >= from && hour < to) ? 'peak' : 'off-peak';
}

export function getRates(
  family: ModelFamily,
  currency: PricingCurrency = 'USD',
  at: Date = new Date(),
): Rates {
  const peak = PEAK_RATES[currency][family];
  if (getRateTier(at) === 'peak') return peak;
  return {
    cacheHit: peak.cacheHit * OFF_PEAK_FACTOR,
    cacheMiss: peak.cacheMiss * OFF_PEAK_FACTOR,
    output: peak.output * OFF_PEAK_FACTOR,
  };
}

/**
 * An unrecognised model id prices as Pro — the dearer tier — so a request we
 * failed to tag over-reports rather than under-reports spend.
 */
export function resolveFamily(model: string): ModelFamily {
  return model === 'deepseek-v4-flash' ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
}

/** Trims to the pricing page's precision and drops trailing zeros: `0.007`, `1.32`, `27`. */
function formatRate(n: number): string {
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * The model-picker `detail` hint. Quotes the rate in force *right now* plus its
 * tier: peak and off-peak differ by 2x, so a single static number would be
 * wrong for much of the day. `toChatInfo` runs per picker query, so passing the
 * call time through re-evaluates this naturally.
 */
export function priceHint(family: ModelFamily, at: Date = new Date()): string {
  const rates = getRates(family, 'USD', at);
  return `$${formatRate(rates.cacheMiss)}/$${formatRate(rates.output)} per Mtok in/out · ${getRateTier(at)}`;
}

/**
 * Per-Mtok cost strings for the (non-public) native cost fields Copilot Chat
 * renders in the model picker. Best-effort: hosts that don't recognise the
 * fields ignore them, and `priceHint` carries the same numbers in the visible
 * `detail` string. `cacheCost` is the cache-hit input rate.
 */
export function priceFields(
  family: ModelFamily,
  at: Date = new Date(),
): { inputCost: string; outputCost: string; cacheCost: string } {
  const rates = getRates(family, 'USD', at);
  return {
    inputCost: `$${formatRate(rates.cacheMiss)}`,
    outputCost: `$${formatRate(rates.output)}`,
    cacheCost: `$${formatRate(rates.cacheHit)}`,
  };
}
