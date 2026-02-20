import type {
  LLMProvider, ProviderConfig, ModelOption, ToolDefinition,
  NormalizedMessage, SendMessageResult, ContentBlock,
} from './types';

// Models known to support tool/function calling in Ollama
const KNOWN_TOOL_CAPABLE_FAMILIES = [
  'llama3.1', 'llama3.2', 'llama3.3', 'llama4',
  'qwen2.5', 'qwen3', 'qwen2',
  'mistral', 'mistral-nemo', 'mistral-small', 'mistral-large',
  'command-r', 'command-r-plus',
  'nemotron',
  'granite3',
  'hermes3',
  'firefunction',
  'deepseek-r1',
];

export const ollamaProvider: LLMProvider = {
  type: 'ollama',
  displayName: 'Ollama (Local)',
  requiresApiKey: false,
  requiresProxy: false,
  requiresBaseUrl: true,
  defaultBaseUrl: 'http://localhost:11434',

  getSystemPrompt(tools: ToolDefinition[]): string | null {
    if (tools.length === 0) return null;
    const toolNames = tools.map(t => t.name).join(', ');
    return `You are a helpful assistant with access to external tools/functions. ` +
      `When the user asks a question that can be answered using the available tools, ` +
      `you MUST call the appropriate tool(s) instead of answering from your own knowledge. ` +
      `Always prefer using tools over answering from memory. ` +
      `Available tools: ${toolNames}`;
  },

  async fetchModels(config: ProviderConfig): Promise<ModelOption[]> {
    const base = config.baseUrl || 'http://localhost:11434';

    const response = await fetch(`${base}/api/tags`);
    if (!response.ok) {
      throw new Error(
        `Failed to connect to Ollama at ${base}. ` +
        `Make sure Ollama is running and OLLAMA_ORIGINS=* is set.`,
      );
    }

    const data = await response.json();
    const allModels: Array<{ name: string; details?: any }> = data.models || [];

    // Filter to models known to support tool calling
    const toolCapable = allModels.filter(m => {
      const modelName = m.name.toLowerCase();
      return KNOWN_TOOL_CAPABLE_FAMILIES.some(family =>
        modelName.startsWith(family),
      );
    });

    return toolCapable.map(m => ({
      id: m.name,
      name: m.name,
    }));
  },

  async sendMessage(
    messages: NormalizedMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig,
  ): Promise<SendMessageResult> {
    const base = config.baseUrl || 'http://localhost:11434';

    const openaiMessages = convertToOpenAIMessages(messages, tools);

    const openaiTools = tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: t.inputSchema.properties,
          required: t.inputSchema.required,
        },
      },
    }));

    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: openaiMessages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No response from Ollama');

    return convertFromOpenAIResponse(choice);
  },
};

function convertToOpenAIMessages(messages: NormalizedMessage[], tools: ToolDefinition[] = []): any[] {
  const result: any[] = [];

  // Add system prompt that instructs the model to use the available tools
  if (tools.length > 0) {
    const toolNames = tools.map(t => t.name).join(', ');
    result.push({
      role: 'system',
      content:
        `You are a helpful assistant with access to external tools/functions. ` +
        `When the user asks a question that can be answered using the available tools, ` +
        `you MUST call the appropriate tool(s) instead of answering from your own knowledge. ` +
        `Always prefer using tools over answering from memory. ` +
        `Available tools: ${toolNames}`,
    });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      const toolResults = msg.content.filter(b => b.type === 'tool_result');
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
          });
        }
      } else {
        const text = msg.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
        result.push({ role: 'user', content: text });
      }
    } else if (msg.role === 'assistant') {
      const textBlocks = msg.content.filter(b => b.type === 'text');
      const toolUses = msg.content.filter(b => b.type === 'tool_use');

      const assistantMsg: any = { role: 'assistant' };

      if (textBlocks.length > 0) {
        assistantMsg.content = textBlocks.map(b => b.text).join('\n');
      } else {
        assistantMsg.content = null;
      }

      if (toolUses.length > 0) {
        assistantMsg.tool_calls = toolUses.map(tu => ({
          id: tu.id,
          type: 'function',
          function: {
            name: tu.name,
            arguments: JSON.stringify(tu.input),
          },
        }));
      }

      result.push(assistantMsg);
    }
  }

  return result;
}

function convertFromOpenAIResponse(choice: any): SendMessageResult {
  const content: ContentBlock[] = [];
  const message = choice.message;

  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch {
        parsedArgs = {};
      }
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: parsedArgs,
      });
    }
  }

  const stopReason = choice.finish_reason === 'tool_calls'
    ? 'tool_use'
    : choice.finish_reason === 'stop'
      ? 'end_turn'
      : choice.finish_reason || 'end_turn';

  return { content, stopReason };
}
