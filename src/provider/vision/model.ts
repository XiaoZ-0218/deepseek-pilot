import vscode from 'vscode';
import { getApiModelId, getApiUrl, getVisionModelSetting } from '../../config';
import { NATIVE_VISION_MODEL_ID } from '../../consts';
import { logger } from '../../logger';
import { safeJsonStringify, tryParseJson } from '../../json';

/**
 * A model that can turn an image part into a text description for the
 * text-only DeepSeek variants. Two implementations: DeepSeek's own vision
 * model called directly over the API (the zero-config default — same key,
 * no host consent dialog), and any host-registered vision-capable model
 * (the pre-vision-exp behavior, kept for users who configured one).
 */
export interface VisionDescriber {
  readonly id: string;
  describe(part: vscode.LanguageModelDataPart, prompt: string): Promise<string>;
}

/** Cap a runaway description; also DeepSeek's request timeout is minutes-long. */
const NATIVE_DESCRIBE_MAX_TOKENS = 2048;
const NATIVE_DESCRIBE_TIMEOUT_MS = 120_000;

export interface VisionDescriberDeps {
  getApiKey: () => Promise<string | undefined>;
}

/**
 * Lazy-resolved vision describer. Cached after the first successful lookup
 * and invalidated when the user changes the `deepseek-pilot.visionModel`
 * setting (the provider listens to `onDidChangeConfiguration` and calls
 * `reset()`).
 *
 * Resolution order:
 *   1. `deepseek-pilot.visionModel` set to a host model id → that model.
 *   2. API key present → DeepSeek's own vision model, called directly.
 *   3. First non-DeepSeek vision-capable host model (legacy auto-detect).
 */
export function createVisionModelGetter(deps: VisionDescriberDeps): {
  get: () => Promise<VisionDescriber | null>;
  reset: () => void;
} {
  let cached: VisionDescriber | null | undefined;
  let pending: Promise<VisionDescriber | null> | undefined;

  return {
    get: async () => {
      if (cached !== undefined) return cached;
      if (pending) return pending;

      pending = (async () => {
        const settingId = getVisionModelSetting().trim();
        if (settingId && settingId !== NATIVE_VISION_MODEL_ID) {
          const models = await vscode.lm.selectChatModels({ id: settingId });
          if (models[0]) {
            logger.info(`Vision proxy model: ${models[0].id}`);
            cached = hostModelDescriber(models[0]);
            return cached;
          }
          logger.warn(`Configured vision proxy model not found: ${settingId}`);
        }

        // Default: DeepSeek's own vision model over the same API key. No host
        // model lookup, no vscode.lm consent dialog.
        const apiKey = await deps.getApiKey();
        if (apiKey) {
          logger.info(`Vision describer: native ${NATIVE_VISION_MODEL_ID}`);
          cached = nativeDescriber(deps);
          return cached;
        }

        // No key (the main request will fail too, but a key may arrive before
        // the next call): fall back to the pre-vision-exp auto-detect of the
        // first non-DeepSeek vision-capable model from any registered vendor.
        try {
          const all = await vscode.lm.selectChatModels();
          const candidate = all.find(
            (m) =>
              m.vendor !== 'deepseek-pilot' &&
              m.vendor !== 'deepseek' &&
              m.vendor !== 'deepseek-v4',
          );
          if (candidate) {
            logger.info(`Vision proxy auto-detected: ${candidate.id}`);
            cached = hostModelDescriber(candidate);
            return cached;
          }
        } catch (e) {
          logger.warn('Vision auto-detect failed', e);
        }

        cached = null;
        return null;
      })();

      try {
        return await pending;
      } finally {
        pending = undefined;
      }
    },

    reset: () => {
      cached = undefined;
      pending = undefined;
    },
  };
}

function hostModelDescriber(model: vscode.LanguageModelChat): VisionDescriber {
  return {
    id: model.id,
    describe: async (part, prompt) => {
      const visionMessage = vscode.LanguageModelChatMessage.User([
        part,
        new vscode.LanguageModelTextPart(prompt),
      ] as (vscode.LanguageModelDataPart | vscode.LanguageModelTextPart)[]);

      const tokenSource = new vscode.CancellationTokenSource();
      try {
        const response = await model.sendRequest([visionMessage], {}, tokenSource.token);
        let text = '';
        for await (const chunk of response.stream) {
          if (chunk instanceof vscode.LanguageModelTextPart) {
            text += chunk.value;
          }
        }
        return text.trim();
      } finally {
        tokenSource.dispose();
      }
    },
  };
}

function nativeDescriber(deps: VisionDescriberDeps): VisionDescriber {
  return {
    id: NATIVE_VISION_MODEL_ID,
    describe: async (part, prompt) => {
      const apiKey = await deps.getApiKey();
      if (!apiKey) throw new Error('DeepSeek API key not configured');

      const base64 = Buffer.from(part.data).toString('base64');
      const body = {
        model: getApiModelId(NATIVE_VISION_MODEL_ID),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${base64}` } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        // A description is a utility flow — reasoning tokens buy nothing here.
        thinking: { type: 'disabled' },
        stream: false,
        max_tokens: NATIVE_DESCRIBE_MAX_TOKENS,
      };

      const response = await fetch(getApiUrl('chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: safeJsonStringify(body),
        signal: AbortSignal.timeout(NATIVE_DESCRIBE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        throw new Error(`Native vision describe failed: HTTP ${response.status} ${detail}`);
      }

      const parsed = tryParseJson(await response.text()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      } | null;
      const content = parsed?.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content.trim() : '';
    },
  };
}

/**
 * Let the user pick a vision proxy model: DeepSeek's built-in vision model
 * (the default — clears the setting) or any host-registered chat model from
 * another vendor. Persists the choice to settings.
 */
export async function setVisionProxyModel(): Promise<void> {
  const allModels = await vscode.lm.selectChatModels();
  const candidates = allModels.filter(
    (m) => m.vendor !== 'deepseek-pilot' && m.vendor !== 'deepseek' && m.vendor !== 'deepseek-v4',
  );

  const currentId = getVisionModelSetting().trim();

  const builtinItem = {
    label: NATIVE_VISION_MODEL_ID,
    description: vscode.l10n.t(
      'DeepSeek built-in vision model (default, uses your DeepSeek API key)',
    ),
    detail:
      currentId === '' || currentId === NATIVE_VISION_MODEL_ID
        ? vscode.l10n.t('Currently selected')
        : undefined,
  };

  const items = [
    builtinItem,
    ...candidates.map((m) => ({
      label: m.id,
      description: m.vendor,
      detail: m.id === currentId ? vscode.l10n.t('Currently selected') : undefined,
    })),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t('Pick a model to describe images before sending them to DeepSeek'),
    matchOnDescription: true,
  });

  if (!picked) return;

  // The built-in default is represented by an empty setting, so picking it
  // clears any override rather than pinning the (experimental) model id.
  const newValue = picked.label === NATIVE_VISION_MODEL_ID ? undefined : picked.label;
  await vscode.workspace
    .getConfiguration('deepseek-pilot')
    .update('visionModel', newValue, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage(
    vscode.l10n.t('Vision proxy model set to: {0}', picked.label),
  );
}
