import type {
  LLMProvider, ProviderConfig, ModelOption, ToolDefinition,
  NormalizedMessage, SendMessageResult, ContentBlock,
} from './types';

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com';

// Curated list of NVIDIA Build models with confirmed tool-calling support.
// Source: https://docs.nvidia.com/nim/large-language-models/latest/supported-models.html
// The /v1/models endpoint on integrate.api.nvidia.com does not return a
// browsable catalog, so we provide known models here and let users
// enter any other model ID via the "Custom Model ID" option.
const KNOWN_MODELS: ModelOption[] = [
  // Nemotron
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', name: 'Llama 3.3 Nemotron Super 49B v1.5' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', name: 'Llama 3.1 Nemotron Ultra 253B v1' },
  { id: 'nvidia/llama-3.1-nemotron-nano-4b-v1.1', name: 'Llama 3.1 Nemotron Nano 4B v1.1' },
  { id: 'nvidia/nvidia-nemotron-nano-9b-v2', name: 'Nemotron Nano 9B v2' },
  { id: 'nvidia/nvidia-nemotron-3-nano', name: 'Nemotron 3 Nano' },
  // Meta Llama
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B Instruct' },
  { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct' },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct' },
  // OpenAI GPT-OSS
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
  // DeepSeek
  { id: 'deepseek-ai/deepseek-v3.1-terminus', name: 'DeepSeek V3.1 Terminus' },
  // Qwen
  { id: 'qwen/qwen3-coder-next', name: 'Qwen3 Coder Next' },
  // GLM
  { id: 'zai-org/glm-5', name: 'GLM-5' },
  // Mistral
  { id: 'nv-mistralai/mistral-nemo-12b-instruct', name: 'Mistral Nemo 12B Instruct' },
  { id: 'mistralai/mixtral-8x22b-instruct-v01', name: 'Mixtral 8x22B Instruct' },
  // Microsoft
  { id: 'microsoft/phi-4-mini-instruct', name: 'Phi-4 Mini Instruct' },
  // StepFun
  { id: 'stepfun-ai/step-35-flash', name: 'Step 35 Flash' },
];

const SYSTEM_PROMPT_TEMPLATE = (toolNames: string) =>
  `You are a helpful assistant with access to external tools/functions. ` +
  `When the user asks a question that can be answered using the available tools, ` +
  `you MUST call the appropriate tool(s) instead of answering from your own knowledge. ` +
  `Always prefer using tools over answering from memory. ` +
  `Available tools: ${toolNames}`;

export const nvidiaProvider: LLMProvider = {
  type: 'nvidia',
  displayName: 'NVIDIA Build',
  requiresApiKey: true,
  requiresProxy: true,
  requiresBaseUrl: true,
  defaultBaseUrl: DEFAULT_BASE_URL,

  getSystemPrompt(tools: ToolDefinition[]): string | null {
    if (tools.length === 0) return null;
    return SYSTEM_PROMPT_TEMPLATE(tools.map(t => t.name).join(', '));
  },

  async fetchModels(_config: ProviderConfig): Promise<ModelOption[]> {
    // NVIDIA Build doesn't expose a browsable /v1/models catalog.
    // Return a curated list; users can also enter custom model IDs.
    return KNOWN_MODELS;
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
      max_tokens: config.maxTokens || 4096,
      stream: false,
    };
    if (openaiTools.length > 0) {
      body.tools = openaiTools;
      body.tool_choice = 'auto';
    }

    let response: Response;
    try {
      response = await fetch(proxyTarget.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      throw new Error(
        `Network error reaching NVIDIA Build API (via proxy). ` +
        `Check that your CORS proxy is running and can reach integrate.api.nvidia.com. ` +
        `Details: ${err.message}`
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA Build Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No response from NVIDIA Build');

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
