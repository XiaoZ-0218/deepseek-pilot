import vscode from 'vscode';
import { getReasoningEffort, type ReasoningEffort } from '../config';
import { MAX_TOOLS_PER_REQUEST, MODELS } from '../consts';
import { PEAK_WINDOW_DESCRIPTION, priceFields, priceHint } from '../pricing';

export type ModelConfigurationOptions = vscode.ProvideLanguageModelChatResponseOptions & {
  readonly modelConfiguration?: Record<string, unknown>;
  readonly configuration?: Record<string, unknown>;
};

type ThinkingEffortConfigurationSchema = ReturnType<typeof buildThinkingEffortSchema>;

type RuntimeLanguageModelChatCapabilities = vscode.LanguageModelChatCapabilities & {
  editTools?: readonly string[];
};

type RuntimeLanguageModelChatInformation = vscode.LanguageModelChatInformation & {
  isUserSelectable: boolean;
  statusIcon?: vscode.ThemeIcon;
  detail?: string;
  category?: { label: string; order: number };
  configurationSchema?: ThinkingEffortConfigurationSchema;
  capabilities: RuntimeLanguageModelChatCapabilities;
  inputCost?: string;
  outputCost?: string;
  cacheCost?: string;
};

const API_KEY_REQUIRED_DETAIL = vscode.l10n.t(
  'No API key configured. Use "DeepSeek Pilot: Manage Provider" or "DeepSeek Pilot: Set API Key".',
);

export function toChatInfo(
  model: (typeof MODELS)[number],
  hasKey: boolean,
): vscode.LanguageModelChatInformation {
  // Priced at display time, not module load: DeepSeek's peak and off-peak rates
  // differ by 2x, and the host re-queries this per picker open, so quoting the
  // rate in force now (with its tier named) beats a number that silently goes
  // stale when the window rolls over.
  const now = new Date();
  const rate = priceHint(model.family, now);

  const tooltip = hasKey
    ? `${model.description}\n\nContext: ${formatTokens(model.maxInputTokens)} in / ${formatTokens(model.maxOutputTokens)} out\nRate: ${rate} (peak ${PEAK_WINDOW_DESCRIPTION}; off-peak is half price)`
    : API_KEY_REQUIRED_DETAIL;

  const statusIcon = !hasKey
    ? new vscode.ThemeIcon('warning')
    : model.thinking
      ? new vscode.ThemeIcon('lightbulb-sparkle')
      : new vscode.ThemeIcon('rocket');

  const info: RuntimeLanguageModelChatInformation = {
    id: model.id,
    name: model.name,
    family: model.family,
    version: model.version,
    detail: hasKey ? `${model.detailPrefix} · ${rate}` : API_KEY_REQUIRED_DETAIL,
    tooltip,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    isUserSelectable: true,
    statusIcon,
    // Group the four variants under one collapsible row in the model picker.
    category: { label: 'DeepSeek V4', order: 50 },
    capabilities: {
      imageInput: true,
      // Tell the host the explicit per-request tool cap so it can truncate
      // long tool lists upstream instead of letting our request.ts throw.
      toolCalling: MAX_TOOLS_PER_REQUEST,
    },
    // Non-public cost fields so DeepSeek's prices surface in Copilot's native
    // picker cost slots. Hosts that don't read them ignore them; the `detail`
    // string carries the same numbers as a visible fallback.
    ...(hasKey ? priceFields(model.family, now) : {}),
    ...(model.thinking ? { configurationSchema: buildThinkingEffortSchema() } : {}),
  };

  return info;
}

export function getConfiguredThinkingEffort(options: ModelConfigurationOptions): ReasoningEffort {
  const configuredEffort =
    options.modelConfiguration?.reasoningEffort ?? options.configuration?.reasoningEffort;

  // DeepSeek V4 accepts `low` | `high` | `max` (API default `high`). `medium`
  // and `xhigh` belong to other vendors' taxonomies (OpenAI, Anthropic) and are
  // not DeepSeek values, so they map to the nearest real level instead of being
  // passed through — `xhigh` → `max` matches the mapping DeepSeek publishes for
  // its own Oh My Pi integration.
  if (configuredEffort === 'max' || configuredEffort === 'xhigh') return 'max';
  if (configuredEffort === 'high' || configuredEffort === 'medium') return 'high';
  if (configuredEffort === 'low') return 'low';
  return getReasoningEffort();
}

function buildThinkingEffortSchema() {
  return {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        enum: ['low', 'high', 'max'],
        enumItemLabels: ['Low', 'High', 'Max'],
        enumDescriptions: [
          'Lightest reasoning; fastest and cheapest.',
          'Shorter reasoning chains; the DeepSeek default.',
          'Maximum reasoning depth; slower and uses more tokens.',
        ],
        default: 'max',
        group: 'navigation',
      },
    },
  } as const;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}
