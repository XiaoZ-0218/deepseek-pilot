export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | OpenAIContentPart[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

/**
 * Multimodal content part for native-vision models. DeepSeek's vision API only
 * accepts image parts in `user` messages (anywhere else is a 400), so convert.ts
 * emits arrays only there and keeps plain strings everywhere else.
 */
export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIFunctionToolDef {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface DeepSeekModelVariant {
  id: string;
  displayName: string;
  tooltip: string;
  apiModel: string;
  thinking: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export interface DSUsage {
  prompt_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  /**
   * OpenAI's cached-prompt field. DeepSeek does not send it — it reports cache
   * hits as `prompt_cache_hit_tokens` — but the host reads this one, so
   * `toHostUsage` in provider/stream.ts synthesizes it on the way out.
   */
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface DSBalance {
  currency: 'USD' | 'CNY';
  totalGranted: number;
  totalToppedUp: number;
  totalUsed: number;
  totalBalance: number;
  fetchedAt: number;
}
