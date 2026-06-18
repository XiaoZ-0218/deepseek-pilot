import { describe, expect, it } from 'vitest';
import { isUtilityRequest } from '../src/provider/request-kind';
import { LanguageModelChatMessageRole, LanguageModelTextPart } from './vscode-mock';

// The host delivers a numeric System role (3) the public enum omits.
const SYSTEM = 3;

type Msg = { role: number; content: string | LanguageModelTextPart[] };
function isUtility(messages: Msg[], hasTools: boolean): boolean {
  return isUtilityRequest(
    messages as unknown as Parameters<typeof isUtilityRequest>[0],
    hasTools,
  );
}

const sys = (text: string): Msg => ({ role: SYSTEM, content: [new LanguageModelTextPart(text)] });
const user = (text: string): Msg => ({ role: LanguageModelChatMessageRole.User, content: text });
const asst = (text: string): Msg => ({
  role: LanguageModelChatMessageRole.Assistant,
  content: text,
});

describe('isUtilityRequest', () => {
  it('fires on a title-generation system prompt with no tools', () => {
    expect(isUtility([sys('You craft pithy titles for chats.'), user('hi')], false)).toBe(true);
  });

  it('never fires when tools are present (the real agentic loop)', () => {
    expect(isUtility([sys('You craft pithy titles for chats.')], true)).toBe(false);
  });

  it('does not fire on a normal coding system prompt', () => {
    expect(
      isUtility([sys('You are an expert AI programming assistant.'), user('fix the bug')], false),
    ).toBe(false);
  });

  it('matches a commit-message flow', () => {
    expect(isUtility([sys('Write a commit message for the following diff.')], false)).toBe(true);
  });

  it('scans the leading user message when there is no system role', () => {
    expect(isUtility([user('Suggest a branch name for these changes')], false)).toBe(true);
  });

  it('ignores markers that appear only in assistant turns', () => {
    expect(isUtility([user('hello'), asst('here is a pithy reply')], false)).toBe(false);
  });
});
