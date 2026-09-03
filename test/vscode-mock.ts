// Minimal stand-in for the parts of the `vscode` API the unit-tested modules
// touch. request-kind.ts needs the message-role enum (note the real enum has no
// `System` member — the host delivers a numeric 3) and the text-part class used
// in `instanceof` checks.
export class LanguageModelTextPart {
  constructor(public readonly value: string) {}
}

// convert.ts instanceof-checks these three during request preparation.
export class LanguageModelDataPart {
  constructor(
    public readonly data: Uint8Array,
    public readonly mimeType: string,
  ) {}
}

export class LanguageModelToolCallPart {
  constructor(
    public readonly callId: string,
    public readonly name: string,
    public readonly input: object,
  ) {}
}

export class LanguageModelToolResultPart {
  constructor(
    public readonly callId: string,
    public readonly content: unknown[],
  ) {}
}

export const LanguageModelChatMessageRole = { User: 1, Assistant: 2 } as const;

// logger.ts constructs its output channel at module scope, so importing any
// module that reaches it (stream.ts does) needs `window` to exist.
export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    append: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    replace: () => {},
    name: 'DeepSeek Pilot',
  }),
};

export const workspace = {
  getConfiguration: () => ({ get: () => undefined }),
};

export default {
  LanguageModelTextPart,
  LanguageModelDataPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
  LanguageModelChatMessageRole,
  window,
  workspace,
};
