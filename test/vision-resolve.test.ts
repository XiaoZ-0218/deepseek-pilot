import { describe, expect, it } from 'vitest';
import type vscode from 'vscode';
import mock from './vscode-mock';
import { resolveImageMessages } from '../src/provider/vision/resolve';
import type { VisionDescriber } from '../src/provider/vision/model';

const { LanguageModelTextPart, LanguageModelDataPart, LanguageModelToolResultPart } = mock;
const { LanguageModelChatMessageRole } = mock;

type HostMessage = vscode.LanguageModelChatRequestMessage;

function userMessage(content: unknown[]): HostMessage {
  return { role: LanguageModelChatMessageRole.User, content } as unknown as HostMessage;
}

function fakeDescriber(description: string): VisionDescriber {
  return { id: 'fake-vision', describe: async () => description };
}

// Each spec uses distinct bytes: the description cache is module-level and
// keyed on the image hash, so reused bytes would cross-contaminate specs.

describe('resolveImageMessages tool-result descent', () => {
  it('describes images nested inside tool results', async () => {
    const messages = [
      userMessage([
        new LanguageModelToolResultPart('call_9', [
          new LanguageModelTextPart('tool text'),
          new LanguageModelDataPart(new Uint8Array([10, 11, 12]), 'image/png'),
        ]),
      ]),
    ];

    const { resolvedMessages, stats } = await resolveImageMessages(messages, async () =>
      fakeDescriber('a red square'),
    );

    const part = (resolvedMessages[0]!.content as unknown[])[0];
    expect(part).toBeInstanceOf(LanguageModelToolResultPart);
    const toolResult = part as InstanceType<typeof LanguageModelToolResultPart>;
    expect(toolResult.callId).toBe('call_9');
    expect(toolResult.content).toHaveLength(2);
    expect((toolResult.content[0] as { value: string }).value).toBe('tool text');
    expect((toolResult.content[1] as { value: string }).value).toBe(
      '[Image Description: a red square]',
    );
    expect(stats.generatedDescriptions).toBe(1);
  });

  it('still describes top-level user-message images', async () => {
    const messages = [
      userMessage([
        new LanguageModelDataPart(new Uint8Array([20, 21]), 'image/jpeg'),
        new LanguageModelTextPart('what is this?'),
      ]),
    ];

    const { resolvedMessages } = await resolveImageMessages(messages, async () =>
      fakeDescriber('a blue circle'),
    );

    const parts = resolvedMessages[0]!.content as Array<{ value: string }>;
    expect(parts[0]!.value).toBe('[Image Description: a blue circle]');
    expect(parts[1]!.value).toBe('what is this?');
  });

  it('drops nested images when no describer is available, keeping the text', async () => {
    const messages = [
      userMessage([
        new LanguageModelToolResultPart('call_2', [
          new LanguageModelTextPart('kept'),
          new LanguageModelDataPart(new Uint8Array([30, 31]), 'image/png'),
        ]),
      ]),
    ];

    const { resolvedMessages, stats } = await resolveImageMessages(messages, async () => null);

    const toolResult = (resolvedMessages[0]!.content as unknown[])[0] as InstanceType<
      typeof LanguageModelToolResultPart
    >;
    expect(toolResult.content).toHaveLength(1);
    expect((toolResult.content[0] as { value: string }).value).toBe('kept');
    expect(stats.droppedImageParts).toBe(1);
  });
});
