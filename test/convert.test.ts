import { describe, expect, it } from 'vitest';
import type vscode from 'vscode';
import mock from './vscode-mock';
import { convertMessages } from '../src/provider/convert';
import { ReasoningCache } from '../src/provider/cache';
import { VISION_IMAGE_MAX_RAW_BYTES } from '../src/consts';
import type { OpenAIContentPart } from '../src/types';

const { LanguageModelTextPart, LanguageModelDataPart, LanguageModelChatMessageRole } = mock;

type HostMessage = vscode.LanguageModelChatRequestMessage;

function userMessage(content: unknown[]): HostMessage {
  return { role: LanguageModelChatMessageRole.User, content } as unknown as HostMessage;
}

function assistantMessage(content: unknown[]): HostMessage {
  return { role: LanguageModelChatMessageRole.Assistant, content } as unknown as HostMessage;
}

const PNG_BYTES = new Uint8Array([1, 2, 3]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;

describe('convertMessages native vision', () => {
  it('turns user-message images into image_url content parts, preserving order', () => {
    const result = convertMessages(
      [
        userMessage([
          new LanguageModelDataPart(PNG_BYTES, 'image/png'),
          new LanguageModelTextPart('what is in this screenshot?'),
        ]),
      ],
      false,
      new ReasoningCache(),
      true,
    );

    expect(result).toHaveLength(1);
    const content = result[0]!.content as OpenAIContentPart[];
    expect(Array.isArray(content)).toBe(true);
    expect(content).toEqual([
      { type: 'image_url', image_url: { url: PNG_DATA_URL } },
      { type: 'text', text: 'what is in this screenshot?' },
    ]);
  });

  it('emits an image-only user message when no text accompanies the image', () => {
    const result = convertMessages(
      [userMessage([new LanguageModelDataPart(PNG_BYTES, 'image/webp')])],
      false,
      new ReasoningCache(),
      true,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.content).toEqual([
      {
        type: 'image_url',
        image_url: { url: `data:image/webp;base64,${Buffer.from(PNG_BYTES).toString('base64')}` },
      },
    ]);
  });

  it('drops images outside user messages — the API 400s on them', () => {
    const result = convertMessages(
      [
        assistantMessage([
          new LanguageModelTextPart('earlier answer'),
          new LanguageModelDataPart(PNG_BYTES, 'image/png'),
        ]),
        userMessage([new LanguageModelTextPart('follow-up')]),
      ],
      false,
      new ReasoningCache(),
      true,
    );

    expect(result).toEqual([
      { role: 'assistant', content: 'earlier answer' },
      { role: 'user', content: 'follow-up' },
    ]);
  });

  it('drops an image that would exceed the per-image encoded size cap', () => {
    const oversize = new Uint8Array(VISION_IMAGE_MAX_RAW_BYTES + 1);
    const result = convertMessages(
      [
        userMessage([
          new LanguageModelDataPart(oversize, 'image/png'),
          new LanguageModelTextPart('huge attachment'),
        ]),
      ],
      false,
      new ReasoningCache(),
      true,
    );

    expect(result).toEqual([{ role: 'user', content: 'huge attachment' }]);
  });

  it('leaves non-image data parts (e.g. cache_control sentinels) alone', () => {
    const result = convertMessages(
      [
        userMessage([
          new LanguageModelTextPart('hello'),
          new LanguageModelDataPart(new Uint8Array([0]), 'cache_control'),
        ]),
      ],
      false,
      new ReasoningCache(),
      true,
    );

    expect(result).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('ignores image parts entirely when native vision is off (proxy path)', () => {
    const result = convertMessages(
      [
        userMessage([
          new LanguageModelDataPart(PNG_BYTES, 'image/png'),
          new LanguageModelTextPart('described elsewhere'),
        ]),
      ],
      false,
      new ReasoningCache(),
    );

    expect(result).toEqual([{ role: 'user', content: 'described elsewhere' }]);
  });
});
