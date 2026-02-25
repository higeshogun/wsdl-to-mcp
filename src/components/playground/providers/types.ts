export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  // tool_use fields
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result fields
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  // Gemini thought signature (must be preserved and sent back with functionCall parts)
  thoughtSignature?: string;
}

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface SendMessageResult {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
}

export type ProviderType = 'anthropic' | 'ollama' | 'gemini' | 'llamacpp' | 'openai' | 'nvidia';

export interface ProviderConfig {
  apiKey: string;
  proxyUrl: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  contextWindow?: number;
}

export interface LLMProvider {
  readonly type: ProviderType;
  readonly displayName: string;
  readonly requiresApiKey: boolean;
  readonly requiresProxy: boolean;
  readonly requiresBaseUrl: boolean;
  readonly defaultBaseUrl: string;

  getSystemPrompt?(tools: ToolDefinition[]): string | null;

  fetchModels(config: ProviderConfig): Promise<ModelOption[]>;

  sendMessage(
    messages: NormalizedMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig,
  ): Promise<SendMessageResult>;
}
