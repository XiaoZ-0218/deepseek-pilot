import { describe, expect, it } from 'vitest';
import { fingerprintAssistantTurn, ReasoningCache } from '../src/provider/cache';
import { sanitizeFunctionName } from '../src/provider/sanitize';

describe('fingerprintAssistantTurn', () => {
  it('is stable across whitespace differences in text-only turns', () => {
    const a = fingerprintAssistantTurn({ text: 'Hello world', toolCalls: [] });
    const b = fingerprintAssistantTurn({ text: 'Hello   world', toolCalls: [] });
    expect(a).toBe(b);
    expect(a.startsWith('tx:')).toBe(true);
  });

  it('returns empty for blank text with no tool calls', () => {
    expect(fingerprintAssistantTurn({ text: '   ', toolCalls: [] })).toBe('');
  });

  it('keys on tool calls when present, independent of order and text', () => {
    const a = fingerprintAssistantTurn({
      text: 'x',
      toolCalls: [
        { id: '1', name: 'a' },
        { id: '2', name: 'b' },
      ],
    });
    const b = fingerprintAssistantTurn({
      text: 'totally different text',
      toolCalls: [
        { id: '2', name: 'b' },
        { id: '1', name: 'a' },
      ],
    });
    expect(a).toBe(b);
    expect(a.startsWith('tc:')).toBe(true);
  });

  it('reverse-map consistency: both code paths fingerprint to the same value', () => {
    // stream.ts fingerprints the streamed (already-sanitized) name; convert.ts
    // re-sanitizes the original VS Code name on the next turn. Because sanitize
    // is idempotent these must agree, or the reasoning cache would miss after a
    // tool whose name needed rewriting.
    const streamSide = fingerprintAssistantTurn({
      text: '',
      toolCalls: [{ id: 'c1', name: 'server_tool' }],
    });
    const convertSide = fingerprintAssistantTurn({
      text: '',
      toolCalls: [{ id: 'c1', name: sanitizeFunctionName('server.tool') }],
    });
    expect(convertSide).toBe(streamSide);
  });
});

describe('ReasoningCache', () => {
  it('stores and retrieves reasoning by fingerprint', () => {
    const c = new ReasoningCache();
    c.set('fp1', 'reasoning text');
    expect(c.get('fp1')).toBe('reasoning text');
    expect(c.get('missing')).toBeUndefined();
  });

  it('evicts the oldest entry beyond capacity', () => {
    const c = new ReasoningCache(2);
    c.set('a', 'A');
    c.set('b', 'B');
    c.set('c', 'C');
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBe('C');
  });

  it('ignores empty reasoning and empty fingerprints', () => {
    const c = new ReasoningCache();
    c.set('fp', '');
    c.set('', 'x');
    expect(c.get('fp')).toBeUndefined();
    expect(c.stats().entryCount).toBe(0);
  });
});
