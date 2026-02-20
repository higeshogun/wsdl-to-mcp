import type {
  LLMProvider, ProviderConfig, ModelOption, ToolDefinition,
  NormalizedMessage, SendMessageResult, ContentBlock,
} from './types';

const DEFAULT_BASE_URL = 'https://api.openai.com';

const SYSTEM_PROMPT_TEMPLATE = (toolNames: string) =>
  `You are a helpful assistant with access to external tools/functions. ` +
  `When the user asks a question that can be answered using the available tools, ` +
  `you MUST call the appropriate tool(s) instead of answering from your own knowledge. ` +
  `Always prefer using tools over answering from memory. ` +
  `Available tools: ${toolNames}`;

export const openaiProvider: LLMProvider = {
  type: 'openai',
  displayName: 'OpenAI',
  requiresApiKey: true,
  requiresProxy: true,
  requiresBaseUrl: true,
  defaultBaseUrl: DEFAULT_BASE_URL,

  getSystemPrompt(tools: ToolDefinition[]): string | null {
    if (tools.length === 0) return null;
    return SYSTEM_PROMPT_TEMPLATE(tools.map(t => t.name).join(', '));
  },

  async fetchModels(config: ProviderConfig): Promise<ModelOption[]> {
    const base = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    const modelsUrl = `${base}/v1/models`;
    const proxyTarget = new URL(config.proxyUrl);
    proxyTarget.searchParams.set('url', modelsUrl);

    const response = await fetch(proxyTarget.toString(), {
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    const models: Array<{ id: string }> = data.data || [];

    return models
      .filter(m =>
        m.id.startsWith('gpt-') ||
        m.id.startsWith('o1') ||
        m.id.startsWith('o3') ||
        m.id.startsWith('o4')
      )
      .sort((a, b) => b.id.localeCompare(a.id))
      .map(m => ({ id: m.id, name: m.id }));
  },

  async sendMessage(
    messages: NormalizedMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig,
  ): Promise<SendMessageResult> {
    const base = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    const chatUrl = `${base}/v1/chat/completions`;
    const proxyTarget = new URL(config.proxyUrl);
    proxyTarget.searchParams.set('url', chatUrl);

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

    const body: any = {
      model: config.model,
      messages: openaiMessages,
      stream: false,
    };
    if (openaiTools.length > 0) {
      body.tools = openaiTools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(proxyTarget.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No response from OpenAI');

    return convertFromOpenAIResponse(choice);
  },
};

function convertToOpenAIMessages(messages: NormalizedMessage[], tools: ToolDefinition[]): any[] {
  const result: any[] = [];

  if (tools.length > 0) {
    result.push({
      role: 'system',
      content: SYSTEM_PROMPT_TEMPLATE(tools.map(t => t.name).join(', ')),
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
        const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        result.push({ role: 'user', content: text });
      }
    } else if (msg.role === 'assistant') {
      const textBlocks = msg.content.filter(b => b.type === 'text');
      const toolUses = msg.content.filter(b => b.type === 'tool_use');
      const assistantMsg: any = {
        role: 'assistant',
        content: textBlocks.length > 0 ? textBlocks.map(b => b.text).join('\n') : null,
      };
      if (toolUses.length > 0) {
        assistantMsg.tool_calls = toolUses.map(tu => ({
          id: tu.id,
          type: 'function',
          function: { name: tu.name, arguments: JSON.stringify(tu.input) },
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

  if (message.tool_calls?.length > 0) {
    for (const tc of message.tool_calls) {
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments || {};
      } catch { parsedArgs = {}; }
      content.push({
        type: 'tool_use',
        id: tc.id || `call_${Date.now()}`,
        name: tc.function.name,
        input: parsedArgs,
      });
    }
  }

  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  const hasToolCalls = content.some(b => b.type === 'tool_use');
  return {
    content,
    stopReason: hasToolCalls ? 'tool_use' : choice.finish_reason === 'stop' ? 'end_turn' : choice.finish_reason || 'end_turn',
  };
}
