import { describe, expect, it } from 'vitest';
import { MODELS } from '../src/consts';

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

  it('carries a static detail prefix, leaving the rate to be appended live', () => {
    for (const m of MODELS) {
      expect(m.detailPrefix).not.toContain('$');
      expect(m.detailPrefix).toMatch(/^(Pro|Flash) · (thinking|fast)$/);
    }
  });
});
