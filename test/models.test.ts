import { describe, expect, it } from 'vitest';
import { MODELS, priceFields } from '../src/consts';

describe('MODELS', () => {
  it('exposes the four DeepSeek V4 variants at the documented 1M / 384K sizes', () => {
    const byId = Object.fromEntries(MODELS.map((m) => [m.id, m]));
    expect(byId['deepseek-v4-pro::thinking']).toMatchObject({
      maxInputTokens: 655360,
      maxOutputTokens: 393216,
      thinking: true,
    });
    expect(byId['deepseek-v4-pro']).toMatchObject({
      maxInputTokens: 983040,
      maxOutputTokens: 65536,
      thinking: false,
    });
    expect(byId['deepseek-v4-flash::thinking']).toMatchObject({
      maxInputTokens: 655360,
      maxOutputTokens: 393216,
      thinking: true,
    });
    expect(byId['deepseek-v4-flash']).toMatchObject({
      maxInputTokens: 983040,
      maxOutputTokens: 65536,
      thinking: false,
    });
  });

  it('keeps input + output within the 1,048,576-token shared window', () => {
    for (const m of MODELS) {
      expect(m.maxInputTokens + m.maxOutputTokens).toBeLessThanOrEqual(1_048_576);
    }
  });
});

describe('priceFields', () => {
  it('reports the current Pro price, not the stale pre-discount 4x figure', () => {
    expect(priceFields('deepseek-v4-pro')).toEqual({
      inputCost: '$0.435',
      outputCost: '$0.87',
      cacheCost: '$0.003625',
    });
  });

  it('reports Flash pricing', () => {
    expect(priceFields('deepseek-v4-flash')).toEqual({
      inputCost: '$0.14',
      outputCost: '$0.28',
      cacheCost: '$0.0028',
    });
  });
});
