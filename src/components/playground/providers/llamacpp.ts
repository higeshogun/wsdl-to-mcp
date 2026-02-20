import type {
  LLMProvider, ProviderConfig, ModelOption, ToolDefinition,
  NormalizedMessage, SendMessageResult, ContentBlock,
} from './types';

const DEFAULT_BASE_URL = import.meta.env.VITE_DEFAULT_LLM_BASE_URL || 'http://localhost:8080';

export const llamacppProvider: LLMProvider = {
  type: 'llamacpp',
  displayName: 'llama.cpp (Local)',
  requiresApiKey: false,
  requiresProxy: false,
  requiresBaseUrl: true,
  defaultBaseUrl: DEFAULT_BASE_URL,

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
    const base = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

    const response = await fetch(`${base}/v1/models`);
    if (!response.ok) {
      throw new Error(
        `Failed to connect to llama.cpp at ${base}. ` +
        `Make sure the server is running with --host and CORS enabled.`,
      );
    }

    const data = await response.json();
    const models: Array<{ id: string; object?: string }> = data.data || [];

    return models.map(m => ({
      id: m.id,
      name: m.id,
    }));
  },

  async sendMessage(
    messages: NormalizedMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig,
  ): Promise<SendMessageResult> {
    const base = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

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

    console.log('[llamacpp] Request body:', JSON.stringify(body, null, 2));

    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama.cpp Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[llamacpp] Raw response:', JSON.stringify(data, null, 2));

    const choice = data.choices?.[0];
    if (!choice) throw new Error('No response from llama.cpp');

    return convertFromOpenAIResponse(choice);
  },
};

function convertToOpenAIMessages(messages: NormalizedMessage[], tools: ToolDefinition[]): any[] {
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
  let hasToolCalls = false;

  // Handle standard tool_calls array
  if (message.tool_calls && message.tool_calls.length > 0) {
    hasToolCalls = true;
    for (const tc of message.tool_calls) {
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments || {};
      } catch {
        parsedArgs = {};
      }
      content.push({
        type: 'tool_use',
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: tc.function.name,
        input: parsedArgs,
      });
    }
  }

  // Add text content (but skip if it looks like a raw tool call JSON that llama.cpp
  // sometimes emits in content instead of tool_calls)
  if (message.content) {
    const textContent = message.content.trim();

    // Some llama.cpp versions put tool calls as JSON in message.content
    // instead of message.tool_calls — try to detect and parse them
    if (!hasToolCalls && textContent) {
      const extracted = tryExtractToolCalls(textContent);
      if (extracted.length > 0) {
        hasToolCalls = true;
        for (const tc of extracted) {
          content.push(tc);
        }
      } else {
        content.push({ type: 'text', text: message.content });
      }
    } else if (!hasToolCalls) {
      content.push({ type: 'text', text: message.content });
    }
    // If we already have tool_calls, still include text if non-empty
    else if (textContent) {
      content.push({ type: 'text', text: message.content });
    }
  }

  // Ensure we have at least some content
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  const stopReason = hasToolCalls
    ? 'tool_use'
    : choice.finish_reason === 'tool_calls'
      ? 'tool_use'
      : choice.finish_reason === 'stop'
        ? 'end_turn'
        : choice.finish_reason || 'end_turn';

  return { content, stopReason };
}

/**
 * Some llama.cpp builds (and some models) emit tool calls as JSON text
 * in the message content rather than in the tool_calls array.
 * Try to detect patterns like:
 *   {"name": "func", "arguments": {...}}
 *   [{"name": "func", "arguments": {...}}]
 *   <tool_call>{"name": "func", ...}</tool_call>
 */
function tryExtractToolCalls(text: string): ContentBlock[] {
  const results: ContentBlock[] = [];

  // Pattern 1: <tool_call>...</tool_call> tags (Mistral-style)
  const toolCallTagRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  while ((match = toolCallTagRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const name = parsed.name || parsed.function?.name;
      const args = parsed.arguments || parsed.function?.arguments || parsed.parameters || {};
      if (name) {
        results.push({
          type: 'tool_use',
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          input: typeof args === 'string' ? JSON.parse(args) : args,
        });
      }
    } catch { /* not valid JSON, skip */ }
  }
  if (results.length > 0) return results;

  // Pattern 2: functools block (Mistral Nemo style)
  // [TOOL_CALLS] [{"name": "...", "arguments": {...}}]
  const toolCallsBlockRegex = /\[TOOL_CALLS\]\s*(\[[\s\S]*?\])/i;
  const blockMatch = toolCallsBlockRegex.exec(text);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1]);
      if (Array.isArray(parsed)) {
        for (const tc of parsed) {
          const name = tc.name || tc.function?.name;
          const args = tc.arguments || tc.function?.arguments || tc.parameters || {};
          if (name) {
            results.push({
              type: 'tool_use',
              id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name,
              input: typeof args === 'string' ? JSON.parse(args) : args,
            });
          }
        }
      }
    } catch { /* skip */ }
    if (results.length > 0) return results;
  }

  // Pattern 3: Raw JSON object or array that looks like tool calls
  // Only try this if the entire text looks like JSON
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
    try {
      let parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) parsed = [parsed];
      for (const tc of parsed) {
        const name = tc.name || tc.function?.name;
        const args = tc.arguments || tc.function?.arguments || tc.parameters || {};
        if (name && typeof name === 'string') {
          results.push({
            type: 'tool_use',
            id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name,
            input: typeof args === 'string' ? JSON.parse(args) : args,
          });
        }
      }
    } catch { /* not valid tool call JSON */ }
  }

  return results;
}
