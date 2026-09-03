import { describe, expect, it } from 'vitest';
import { MODELS } from '../src/consts';

describe('MODELS', () => {
  it('exposes the six DeepSeek V4 variants at the documented 1M / 384K sizes', () => {
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
    expect(byId['deepseek-v4-flash-vision-exp::thinking']).toMatchObject({
      maxInputTokens: 655360,
      maxOutputTokens: 393216,
      thinking: true,
      nativeVision: true,
    });
    expect(byId['deepseek-v4-flash-vision-exp']).toMatchObject({
      maxInputTokens: 983040,
      maxOutputTokens: 65536,
      thinking: false,
      nativeVision: true,
    });
  });

  it('marks exactly the Flash Vision pair as native-vision', () => {
    const native = MODELS.filter((m) => m.nativeVision).map((m) => m.id);
    expect(native.sort()).toEqual([
      'deepseek-v4-flash-vision-exp',
      'deepseek-v4-flash-vision-exp::thinking',
    ]);
  });

  it('keeps input + output within the 1,048,576-token shared window', () => {
    for (const m of MODELS) {
      expect(m.maxInputTokens + m.maxOutputTokens).toBeLessThanOrEqual(1_048_576);
    }
  });

  it('carries a static detail prefix, leaving the rate to be appended live', () => {
    for (const m of MODELS) {
      expect(m.detailPrefix).not.toContain('$');
      expect(m.detailPrefix).toMatch(/^(Pro|Flash|Flash Vision) · (thinking|fast)$/);
    }
  });
});
