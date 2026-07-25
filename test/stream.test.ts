import { describe, expect, it } from 'vitest';
import { toHostUsage } from '../src/provider/stream';

describe('toHostUsage', () => {
  it('maps prompt_cache_hit_tokens onto the cached_tokens the host reads', () => {
    // Copilot Chat 0.58.0 normalizes the `usage` data part with
    // `cached_tokens: prompt_tokens_details?.cached_tokens ?? 0`, so without
    // this mapping a full cache hit still displays as zero cached tokens.
    const out = toHostUsage({
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 960,
      prompt_cache_miss_tokens: 40,
      completion_tokens: 120,
      total_tokens: 1120,
    });

    expect(out.prompt_tokens_details).toEqual({ cached_tokens: 960 });
  });

  it('preserves the DeepSeek-native fields the balance tracker reads', () => {
    const out = toHostUsage({
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 960,
      prompt_cache_miss_tokens: 40,
      completion_tokens: 120,
      total_tokens: 1120,
      completion_tokens_details: { reasoning_tokens: 64 },
    });

    expect(out.prompt_tokens).toBe(1000);
    expect(out.prompt_cache_hit_tokens).toBe(960);
    expect(out.prompt_cache_miss_tokens).toBe(40);
    expect(out.completion_tokens).toBe(120);
    expect(out.total_tokens).toBe(1120);
    expect(out.completion_tokens_details).toEqual({ reasoning_tokens: 64 });
  });

  it('maps a zero cache hit rather than dropping the field', () => {
    // A cold prompt reports 0 hits; emitting an explicit 0 is what the host
    // would compute anyway, and keeps the shape uniform across turns.
    const out = toHostUsage({ prompt_tokens: 500, prompt_cache_hit_tokens: 0 });

    expect(out.prompt_tokens_details).toEqual({ cached_tokens: 0 });
  });

  it('passes usage through untouched when DeepSeek omits the cache field', () => {
    const usage = { prompt_tokens: 500, completion_tokens: 10, total_tokens: 510 };

    expect(toHostUsage(usage)).toBe(usage);
  });

  it('does not clobber prompt_tokens_details if the API ever starts sending it', () => {
    const usage = {
      prompt_tokens: 500,
      prompt_cache_hit_tokens: 100,
      prompt_tokens_details: { cached_tokens: 480 },
    };

    expect(toHostUsage(usage).prompt_tokens_details).toEqual({ cached_tokens: 480 });
  });
});
