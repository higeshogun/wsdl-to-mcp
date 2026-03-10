/**
 * OpenAI-compatible LLM client with streaming and tool/function-calling support.
 *
 * Works with:
 *  - OpenAI (api.openai.com/v1)
 *  - Azure OpenAI (https://<resource>.openai.azure.com/openai/deployments/<model>)
 *  - Anthropic (via openai-compatible shim)
 *  - Local models: Ollama (/v1), llama.cpp, LM Studio, vLLM, etc.
 *  - Any API gateway that fronts an OpenAI-compatible model and issues
 *    session tokens via OAuth (set useOAuthToken: true + configure OAuth)
 */

import type {
  LlmConfig,
  OAuthToken,
  OpenAIMessage,
  OpenAITool,
  OpenAIStreamChunk,
  OpenAIToolCall,
  ChatMessage,
  ToolCall,
} from '../types'

export class LlmError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'LlmError'
  }
}

export type StreamDelta =
  | { type: 'text'; content: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_args'; id: string; args: string }
  | { type: 'tool_calls_done'; toolCalls: ToolCall[] }
  | { type: 'done' }

/** Convert our internal ChatMessage[] to OpenAI wire format */
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content })
    } else if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        })
      } else {
        result.push({ role: 'assistant', content: msg.content })
      }
    } else if (msg.role === 'tool' && msg.toolResult) {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolResult.toolCallId,
        name: msg.toolResult.name,
        content: msg.toolResult.content,
      })
    }
  }

  return result
}

/** Convert McpTools to OpenAI function definitions */
export function mcpToolsToOpenAI(mcpTools: Array<{ name: string; description?: string; inputSchema: unknown }>): OpenAITool[] {
  return mcpTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: (tool.inputSchema ?? { type: 'object', properties: {} }) as OpenAITool['function']['parameters'],
    },
  }))
}

interface StreamOptions {
  config: LlmConfig
  token: OAuthToken | null
  messages: OpenAIMessage[]
  tools?: OpenAITool[]
  onDelta: (delta: StreamDelta) => void
  signal?: AbortSignal
}

export async function streamChat(options: StreamOptions): Promise<void> {
  const { config, token, messages, tools, onDelta, signal } = options

  const baseUrl = config.baseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/chat/completions`

  // Build authorization header
  let authHeader: string | undefined
  if (config.useOAuthToken && token) {
    authHeader = `${token.tokenType} ${token.accessToken}`
  } else if (config.apiKey) {
    authHeader = `Bearer ${config.apiKey}`
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...(authHeader ? { Authorization: authHeader } : {}),
    ...config.extraHeaders,
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: true,
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    throw new LlmError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let errMsg = `HTTP ${response.status}`
    try {
      const json = JSON.parse(text) as { error?: { message?: string } }
      if (json.error?.message) errMsg = json.error.message
    } catch { /* ignore */ }
    throw new LlmError(errMsg, response.status)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new LlmError('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  // Accumulate tool call fragments (streamed piece by piece)
  const toolCallAccum: Map<number, { id: string; name: string; args: string }> = new Map()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          // Flush any accumulated tool calls
          if (toolCallAccum.size > 0) {
            const toolCalls: ToolCall[] = []
            for (const [, tc] of toolCallAccum) {
              let args: Record<string, unknown> = {}
              try {
                args = JSON.parse(tc.args) as Record<string, unknown>
              } catch { /* use empty args */ }
              toolCalls.push({ id: tc.id, name: tc.name, arguments: args })
            }
            onDelta({ type: 'tool_calls_done', toolCalls })
          }
          onDelta({ type: 'done' })
          return
        }

        let chunk: OpenAIStreamChunk
        try {
          chunk = JSON.parse(data) as OpenAIStreamChunk
        } catch {
          continue
        }

        const choice = chunk.choices?.[0]
        if (!choice) continue

        const delta = choice.delta

        // Text content
        if (delta.content) {
          onDelta({ type: 'text', content: delta.content })
        }

        // Tool call streaming
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!toolCallAccum.has(idx)) {
              toolCallAccum.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' })
              if (tc.id && tc.function?.name) {
                onDelta({ type: 'tool_call_start', id: tc.id, name: tc.function.name })
              }
            }
            const entry = toolCallAccum.get(idx)!
            if (tc.id) entry.id = tc.id
            if (tc.function?.name) entry.name = tc.function.name
            if (tc.function?.arguments) {
              entry.args += tc.function.arguments
              onDelta({ type: 'tool_call_args', id: entry.id, args: tc.function.arguments })
            }
          }
        }

        if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
          if (toolCallAccum.size > 0) {
            const toolCalls: ToolCall[] = []
            for (const [, tc] of toolCallAccum) {
              let args: Record<string, unknown> = {}
              try {
                args = JSON.parse(tc.args) as Record<string, unknown>
              } catch { /* use empty args */ }
              toolCalls.push({ id: tc.id, name: tc.name, arguments: args })
            }
            onDelta({ type: 'tool_calls_done', toolCalls })
            toolCallAccum.clear()
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  onDelta({ type: 'done' })
}

/** Non-streaming variant (useful for tool result follow-up calls) */
export async function chatCompletion(options: Omit<StreamOptions, 'onDelta'>): Promise<{
  content: string
  toolCalls?: OpenAIToolCall[]
}> {
  const { config, token, messages, tools, signal } = options

  const baseUrl = config.baseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/chat/completions`

  let authHeader: string | undefined
  if (config.useOAuthToken && token) {
    authHeader = `${token.tokenType} ${token.accessToken}`
  } else if (config.apiKey) {
    authHeader = `Bearer ${config.apiKey}`
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authHeader ? { Authorization: authHeader } : {}),
    ...config.extraHeaders,
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: false,
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let errMsg = `HTTP ${response.status}`
    try {
      const json = JSON.parse(text) as { error?: { message?: string } }
      if (json.error?.message) errMsg = json.error.message
    } catch { /* ignore */ }
    throw new LlmError(errMsg, response.status)
  }

  const json = await response.json() as {
    choices: Array<{
      message: {
        content: string | null
        tool_calls?: OpenAIToolCall[]
      }
    }>
  }

  const msg = json.choices?.[0]?.message
  return {
    content: msg?.content ?? '',
    toolCalls: msg?.tool_calls,
  }
}
