import { describe, expect, it } from 'vitest';
import {
  sanitizeFunctionName,
  sanitizeSchema,
  tryParseJSONObject,
} from '../src/provider/sanitize';

describe('sanitizeFunctionName', () => {
  it('passes already-valid names through unchanged', () => {
    expect(sanitizeFunctionName('copilot_searchCodebase')).toBe('copilot_searchCodebase');
    expect(sanitizeFunctionName('read-file')).toBe('read-file');
  });

  it('rewrites characters outside the DeepSeek charset', () => {
    expect(sanitizeFunctionName('server.tool')).toBe('server_tool');
    expect(sanitizeFunctionName('a/b:c')).toBe('a_b_c');
  });

  it('prefixes names that do not start with a letter', () => {
    expect(sanitizeFunctionName('1tool')).toBe('tool_1tool');
    expect(sanitizeFunctionName('_private')).toBe('tool_private');
  });

  it('is idempotent — re-sanitizing a sanitized name is a no-op', () => {
    // This is what keeps the reasoning-cache fingerprint consistent between
    // stream.ts (the sanitized wire name) and convert.ts (which re-sanitizes
    // the original history name). If it were not idempotent, multi-turn
    // reasoning cache would miss for any tool whose name needed rewriting.
    for (const n of ['server.tool', '1tool', 'a..b', 'weird name!', 'OK_name-1', '_private']) {
      expect(sanitizeFunctionName(sanitizeFunctionName(n))).toBe(sanitizeFunctionName(n));
    }
  });

  it('truncates to 64 characters', () => {
    expect(sanitizeFunctionName('a'.repeat(100))).toHaveLength(64);
  });

  it('falls back to "tool" for empty or non-string input', () => {
    expect(sanitizeFunctionName('')).toBe('tool');
    expect(sanitizeFunctionName(undefined)).toBe('tool');
  });
});

describe('sanitizeSchema', () => {
  it('flattens anyOf, preferring a string branch', () => {
    expect(sanitizeSchema({ anyOf: [{ type: 'number' }, { type: 'string' }] }).type).toBe('string');
  });

  it('drops unsupported schema keywords', () => {
    const out = sanitizeSchema({ type: 'object', properties: {}, $schema: 'http://x', $id: 'y' });
    expect(out.$schema).toBeUndefined();
    expect(out.$id).toBeUndefined();
  });

  it('coerces integer-like number properties to integer', () => {
    const out = sanitizeSchema({
      type: 'object',
      properties: { user_id: { type: 'number' }, ratio: { type: 'number' } },
    });
    const props = out.properties as Record<string, { type: string }>;
    expect(props.user_id.type).toBe('integer');
    expect(props.ratio.type).toBe('number');
  });

  it('defaults a missing type to object', () => {
    expect(sanitizeSchema({}).type).toBe('object');
  });
});

describe('tryParseJSONObject', () => {
  it('parses a JSON object', () => {
    const r = tryParseJSONObject('{"a":1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });

  it('rejects arrays, junk, and empty input', () => {
    expect(tryParseJSONObject('[1,2]').ok).toBe(false);
    expect(tryParseJSONObject('not json').ok).toBe(false);
    expect(tryParseJSONObject('').ok).toBe(false);
  });
});
