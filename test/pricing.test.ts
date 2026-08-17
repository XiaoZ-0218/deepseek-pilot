import { describe, expect, it } from 'vitest';
import {
  getRateTier,
  getRates,
  priceFields,
  priceHint,
  resolveFamily,
} from '../src/pricing';

/** Fixed instants either side of the peak windows, so nothing depends on "now". */
const OFF_PEAK = new Date('2026-08-17T12:00:00Z');
const PEAK = new Date('2026-08-17T02:00:00Z');

describe('getRateTier', () => {
  it('treats 01:00-04:00 and 06:00-10:00 UTC as peak', () => {
    for (const hour of [1, 2, 3, 6, 7, 8, 9]) {
      expect(getRateTier(new Date(Date.UTC(2026, 7, 17, hour)))).toBe('peak');
    }
  });

  it('treats the 04:00-06:00 UTC gap between the two windows as off-peak', () => {
    expect(getRateTier(new Date(Date.UTC(2026, 7, 17, 4)))).toBe('off-peak');
    expect(getRateTier(new Date(Date.UTC(2026, 7, 17, 5)))).toBe('off-peak');
  });

  it('treats every hour outside both windows as off-peak', () => {
    for (const hour of [0, 10, 11, 15, 20, 23]) {
      expect(getRateTier(new Date(Date.UTC(2026, 7, 17, hour)))).toBe('off-peak');
    }
  });

  it('switches exactly on the hour boundaries', () => {
    expect(getRateTier(new Date('2026-08-17T00:59:59Z'))).toBe('off-peak');
    expect(getRateTier(new Date('2026-08-17T01:00:00Z'))).toBe('peak');
    expect(getRateTier(new Date('2026-08-17T03:59:59Z'))).toBe('peak');
    expect(getRateTier(new Date('2026-08-17T04:00:00Z'))).toBe('off-peak');
    expect(getRateTier(new Date('2026-08-17T09:59:59Z'))).toBe('peak');
    expect(getRateTier(new Date('2026-08-17T10:00:00Z'))).toBe('off-peak');
  });
});

describe('getRates', () => {
  // Cell-for-cell against https://api-docs.deepseek.com/quick_start/pricing.
  it('matches the published USD peak column', () => {
    expect(getRates('deepseek-v4-pro', 'USD', PEAK)).toEqual({
      cacheHit: 0.044,
      cacheMiss: 1.32,
      output: 3.96,
    });
    expect(getRates('deepseek-v4-flash', 'USD', PEAK)).toEqual({
      cacheHit: 0.014,
      cacheMiss: 0.44,
      output: 1.32,
    });
  });

  it('matches the published USD off-peak column', () => {
    expect(getRates('deepseek-v4-pro', 'USD', OFF_PEAK)).toEqual({
      cacheHit: 0.022,
      cacheMiss: 0.66,
      output: 1.98,
    });
    expect(getRates('deepseek-v4-flash', 'USD', OFF_PEAK)).toEqual({
      cacheHit: 0.007,
      cacheMiss: 0.22,
      output: 0.66,
    });
  });

  // The zh-cn pricing page; peak stated as 09:00-12:00 / 14:00-18:00 Beijing
  // time, which is the same window as the UTC one used above.
  it('matches the published CNY peak column', () => {
    expect(getRates('deepseek-v4-pro', 'CNY', PEAK)).toEqual({
      cacheHit: 0.3,
      cacheMiss: 9,
      output: 27,
    });
    expect(getRates('deepseek-v4-flash', 'CNY', PEAK)).toEqual({
      cacheHit: 0.1,
      cacheMiss: 3,
      output: 9,
    });
  });

  it('matches the published CNY off-peak column', () => {
    expect(getRates('deepseek-v4-pro', 'CNY', OFF_PEAK)).toEqual({
      cacheHit: 0.15,
      cacheMiss: 4.5,
      output: 13.5,
    });
    expect(getRates('deepseek-v4-flash', 'CNY', OFF_PEAK)).toEqual({
      cacheHit: 0.05,
      cacheMiss: 1.5,
      output: 4.5,
    });
  });

  it('prices Pro above Flash in every column', () => {
    for (const at of [PEAK, OFF_PEAK]) {
      const pro = getRates('deepseek-v4-pro', 'USD', at);
      const flash = getRates('deepseek-v4-flash', 'USD', at);
      expect(pro.cacheHit).toBeGreaterThan(flash.cacheHit);
      expect(pro.cacheMiss).toBeGreaterThan(flash.cacheMiss);
      expect(pro.output).toBeGreaterThan(flash.output);
    }
  });
});

describe('resolveFamily', () => {
  it('resolves the two known families', () => {
    expect(resolveFamily('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    expect(resolveFamily('deepseek-v4-pro')).toBe('deepseek-v4-pro');
  });

  it('falls back to the dearer tier so an untagged request cannot under-report', () => {
    expect(resolveFamily('some-proxy-model')).toBe('deepseek-v4-pro');
  });
});

describe('priceHint', () => {
  it('quotes the cache-miss and output rate for the tier in force, and names it', () => {
    expect(priceHint('deepseek-v4-pro', OFF_PEAK)).toBe(
      '$0.66/$1.98 per Mtok in/out · off-peak',
    );
    expect(priceHint('deepseek-v4-pro', PEAK)).toBe(
      '$1.32/$3.96 per Mtok in/out · peak',
    );
    expect(priceHint('deepseek-v4-flash', OFF_PEAK)).toBe(
      '$0.22/$0.66 per Mtok in/out · off-peak',
    );
  });
});

describe('priceFields', () => {
  it('reports the current V4 rates, not the retired flat card', () => {
    expect(priceFields('deepseek-v4-pro', OFF_PEAK)).toEqual({
      inputCost: '$0.66',
      outputCost: '$1.98',
      cacheCost: '$0.022',
    });
    expect(priceFields('deepseek-v4-pro', PEAK)).toEqual({
      inputCost: '$1.32',
      outputCost: '$3.96',
      cacheCost: '$0.044',
    });
  });

  it('reports Flash pricing, including the three-decimal cache-hit rate', () => {
    expect(priceFields('deepseek-v4-flash', OFF_PEAK)).toEqual({
      inputCost: '$0.22',
      outputCost: '$0.66',
      cacheCost: '$0.007',
    });
    expect(priceFields('deepseek-v4-flash', PEAK)).toEqual({
      inputCost: '$0.44',
      outputCost: '$1.32',
      cacheCost: '$0.014',
    });
  });

  it('formats without floating-point dust', () => {
    for (const at of [PEAK, OFF_PEAK]) {
      for (const family of ['deepseek-v4-pro', 'deepseek-v4-flash'] as const) {
        for (const value of Object.values(priceFields(family, at))) {
          expect(value).toMatch(/^\$\d+(\.\d{1,4})?$/);
        }
      }
    }
  });
});
