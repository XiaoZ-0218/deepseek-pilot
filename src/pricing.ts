import vscode from 'vscode';

/**
 * DeepSeek per-million-token pricing — the single source of truth for both
 * the model-picker hints and the status-bar cost estimate.
 *
 * Sources: https://api-docs.deepseek.com/quick_start/pricing (USD) and its
 * zh-cn counterpart (CNY), both read 2026-09-10 (the V4.1 Flash card).
 *
 * DeepSeek bills on a peak/off-peak schedule. Peak is 01:00-04:00 and
 * 06:00-10:00 UTC **Monday-Friday**; the zh-cn page states the same window as
 * 周一至周五 09:00-12:00 / 14:00-18:00 Beijing time (UTC+8), so the two agree.
 * Weekends and every other weekday hour are off-peak at exactly half the peak
 * rate. Both peak windows sit inside 01:00-10:00 UTC, where the UTC and
 * Beijing calendar days coincide, so a plain UTC day-of-week test is exact.
 *
 * V4.1 Flash (2026-09) cut Flash rates below the V4 card (peak cache-miss
 * $0.44 -> $0.30, output $1.32 -> $1.20). V4 Pro keeps its own rates only
 * until 2026-09-14 04:00 UTC (12:00 Beijing); from then DeepSeek routes
 * `deepseek-v4-pro` requests to V4.1 Flash and bills them at the Flash price,
 * pending a V4.1 Pro release.
 */

export type ModelFamily = 'deepseek-v4-pro' | 'deepseek-flash';

/** Any model identifier accepted by the rate lookups; resolved via `resolveFamily`. */
export type PriceableModel = ModelFamily | (string & {});
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
    'deepseek-flash': { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
  },
  CNY: {
    'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 },
    'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  },
};

/** "Off-peak rates are half of the peak rates" — the pricing page. */
const OFF_PEAK_FACTOR = 0.5;

/** Peak windows as UTC hour ranges, `[startInclusive, endExclusive)`. */
const PEAK_WINDOWS_UTC: readonly (readonly [number, number])[] = [
  [1, 4],
  [6, 10],
];

/**
 * From 12:00 Beijing (04:00 UTC) on 2026-09-14, `deepseek-v4-pro` requests are
 * routed to V4.1 Flash and billed at the Flash price (pricing-page deprecation
 * note), so Pro's own rate row only applies before this instant.
 */
const PRO_BILLS_AS_FLASH_FROM_MS = Date.UTC(2026, 8, 14, 4);

/** Peak schedule in prose, for tooltips and settings copy. */
export const PEAK_WINDOW_DESCRIPTION = vscode.l10n.t('01:00-04:00 and 06:00-10:00 UTC Mon-Fri');

/** Display name for a rate tier in tooltips and picker hints. */
export function rateTierLabel(tier: RateTier): string {
  return tier === 'peak' ? vscode.l10n.t('peak') : vscode.l10n.t('off-peak');
}

export function getRateTier(at: Date = new Date()): RateTier {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return 'off-peak'; // weekends are entirely off-peak
  const hour = at.getUTCHours();
  // Note 04:00-06:00 UTC falls BETWEEN the two peak windows and is off-peak.
  return PEAK_WINDOWS_UTC.some(([from, to]) => hour >= from && hour < to) ? 'peak' : 'off-peak';
}

export function getRates(
  model: PriceableModel,
  currency: PricingCurrency = 'USD',
  at: Date = new Date(),
): Rates {
  let family = resolveFamily(model);
  if (family === 'deepseek-v4-pro' && at.getTime() >= PRO_BILLS_AS_FLASH_FROM_MS) {
    family = 'deepseek-flash';
  }
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
 * failed to tag over-reports rather than under-reports spend. The substring
 * match covers the live `deepseek-flash` id plus the retired-but-still-routed
 * `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` legacy ids, all of
 * which DeepSeek bills at the Flash price.
 */
export function resolveFamily(model: string): ModelFamily {
  return model.includes('flash') ? 'deepseek-flash' : 'deepseek-v4-pro';
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
export function priceHint(model: PriceableModel, at: Date = new Date()): string {
  const rates = getRates(model, 'USD', at);
  return vscode.l10n.t(
    '{0}/{1} per Mtok in/out · {2}',
    `$${formatRate(rates.cacheMiss)}`,
    `$${formatRate(rates.output)}`,
    rateTierLabel(getRateTier(at)),
  );
}

/**
 * Per-Mtok cost strings for the (non-public) native cost fields Copilot Chat
 * renders in the model picker. Best-effort: hosts that don't recognise the
 * fields ignore them, and `priceHint` carries the same numbers in the visible
 * `detail` string. `cacheCost` is the cache-hit input rate.
 */
export function priceFields(
  model: PriceableModel,
  at: Date = new Date(),
): { inputCost: string; outputCost: string; cacheCost: string } {
  const rates = getRates(model, 'USD', at);
  return {
    inputCost: `$${formatRate(rates.cacheMiss)}`,
    outputCost: `$${formatRate(rates.output)}`,
    cacheCost: `$${formatRate(rates.cacheHit)}`,
  };
}
