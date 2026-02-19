import type {
  LLMProvider, ProviderConfig, ModelOption, ToolDefinition,
  NormalizedMessage, SendMessageResult, ContentBlock,
} from './types';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const geminiProvider: LLMProvider = {
  type: 'gemini',
  displayName: 'Google Gemini',
  requiresApiKey: true,
  requiresProxy: true,
  requiresBaseUrl: false,
  defaultBaseUrl: '',

  async fetchModels(config: ProviderConfig): Promise<ModelOption[]> {
    const url = `${GEMINI_API_BASE}/models?key=${config.apiKey}`;

    const proxyTarget = new URL(config.proxyUrl);
    proxyTarget.searchParams.set('url', url);

    const response = await fetch(proxyTarget.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch Gemini models: ${response.status}`);
    }

    const data = await response.json();

    return (data.models || [])
      .filter((m: any) => {
        const methods: string[] = m.supportedGenerationMethods || [];
        return methods.includes('generateContent');
      })
      .map((m: any) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
      }))
      .sort((a: ModelOption, b: ModelOption) => a.name.localeCompare(b.name));
  },

  async sendMessage(
    messages: NormalizedMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig,
  ): Promise<SendMessageResult> {
    const geminiContents = convertToGeminiContents(messages);

    const geminiTools = tools.length > 0 ? [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: 'OBJECT',
          properties: convertPropertiesToGemini(t.inputSchema.properties),
          required: t.inputSchema.required,
        },
      })),
    }] : undefined;

    const apiUrl = `${GEMINI_API_BASE}/models/${config.model}:generateContent?key=${config.apiKey}`;
    const proxyTarget = new URL(config.proxyUrl);
    proxyTarget.searchParams.set('url', apiUrl);

    const response = await fetch(proxyTarget.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        tools: geminiTools,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return convertFromGeminiResponse(data);
  },
};

function convertToGeminiContents(messages: NormalizedMessage[]): any[] {
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const toolResults = msg.content.filter(b => b.type === 'tool_result');
      if (toolResults.length > 0) {
        contents.push({
          role: 'user',
          parts: toolResults.map(tr => ({
            functionResponse: {
              name: tr.name || tr.tool_use_id || 'unknown',
              response: { result: tr.content },
            },
          })),
        });
      } else {
        const text = msg.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
        contents.push({ role: 'user', parts: [{ text }] });
      }
    } else if (msg.role === 'assistant') {
      const parts: any[] = [];
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          const part: any = {
            functionCall: {
              name: block.name,
              args: block.input,
            },
          };
          // Preserve thoughtSignature from Gemini 3+ models
          if (block.thoughtSignature) {
            part.thoughtSignature = block.thoughtSignature;
          }
          parts.push(part);
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
    }
  }

  return contents;
}

function convertPropertiesToGemini(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    result[key] = convertSchemaToGemini(value as Record<string, any>);
  }
  return result;
}

function convertSchemaToGemini(schema: Record<string, any>): Record<string, any> {
  const converted: Record<string, any> = { ...schema };

  if (converted.type) {
    converted.type = String(converted.type).toUpperCase();
  }

  if (converted.properties) {
    converted.properties = convertPropertiesToGemini(converted.properties);
  }

  if (converted.items) {
    converted.items = convertSchemaToGemini(converted.items);
  }

  return converted;
}

function convertFromGeminiResponse(data: any): SendMessageResult {
  const content: ContentBlock[] = [];
  let hasToolCalls = false;

  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    throw new Error('No response candidates from Gemini');
  }

  const parts = candidates[0].content?.parts || [];

  for (const part of parts) {
    if (part.text) {
      content.push({ type: 'text', text: part.text });
    }
    if (part.functionCall) {
      hasToolCalls = true;
      const id = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const block: ContentBlock = {
        type: 'tool_use',
        id,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      };
      // Capture thoughtSignature from Gemini 3+ models
      if (part.thoughtSignature) {
        block.thoughtSignature = part.thoughtSignature;
      }
      content.push(block);
    }
  }

  const finishReason = candidates[0].finishReason;
  const stopReason = hasToolCalls
    ? 'tool_use'
    : finishReason === 'STOP'
      ? 'end_turn'
      : finishReason || 'end_turn';

  return { content, stopReason };
}
