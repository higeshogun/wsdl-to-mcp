import type {
  LLMProvider, ProviderConfig, ModelOption, ToolDefinition,
  NormalizedMessage, SendMessageResult, ContentBlock,
} from './types';

export const anthropicProvider: LLMProvider = {
  type: 'anthropic',
  displayName: 'Anthropic (Claude)',
  requiresApiKey: true,
  requiresProxy: true,
  requiresBaseUrl: false,
  defaultBaseUrl: '',

  async fetchModels(config: ProviderConfig): Promise<ModelOption[]> {
    const modelsUrl = 'https://api.anthropic.com/v1/models';
    const proxyTarget = new URL(config.proxyUrl);
    proxyTarget.searchParams.set('url', modelsUrl);

    const response = await fetch(proxyTarget.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    return (data.data || [])
      .filter((m: any) => m.id.startsWith('claude-'))
      .map((m: any) => ({ id: m.id, name: m.display_name || m.id }))
      .sort((a: ModelOption, b: ModelOption) => b.id.localeCompare(a.id));
  },

  async sendMessage(
    messages: NormalizedMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig,
  ): Promise<SendMessageResult> {
    const formattedTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: t.inputSchema.properties,
        required: t.inputSchema.required,
      },
    }));

    const anthropicUrl = 'https://api.anthropic.com/v1/messages';
    const proxyTarget = new URL(config.proxyUrl);
    proxyTarget.searchParams.set('url', anthropicUrl);

    const response = await fetch(proxyTarget.toString(), {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerously-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content.map(block => {
            if (block.type === 'tool_result') {
              return {
                type: 'tool_result',
                tool_use_id: block.tool_use_id,
                content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                ...(block.is_error ? { is_error: true } : {}),
              };
            }
            if (block.type === 'tool_use') {
              return {
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input,
              };
            }
            return { type: 'text', text: block.text || '' };
          }),
        })),
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.content as ContentBlock[],
      stopReason: data.stop_reason,
    };
  },
};
