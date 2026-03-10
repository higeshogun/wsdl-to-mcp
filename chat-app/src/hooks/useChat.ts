import { useCallback, useRef } from 'react'
import { useConfigStore, useAuthStore, useChatStore } from '../store'
import { useMcpClient } from './useMcpClient'
import { useOAuth } from './useOAuth'
import { streamChat, toOpenAIMessages, mcpToolsToOpenAI, LlmError } from '../services/llm-client'
import type { ChatMessage, ToolCall } from '../types'

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function useChat() {
  const llmConfig = useConfigStore((s) => s.config.llm)
  const { token } = useAuthStore()
  const { messages, isStreaming, addMessage, updateMessage, clearMessages, setStreaming } =
    useChatStore()
  const { tools, callTool } = useMcpClient()
  const { getValidToken, login } = useOAuth()
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (userText: string) => {
      if (isStreaming) return
      if (!userText.trim()) return

      // Add user message
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      }
      addMessage(userMsg)

      // Resolve auth token
      let activeToken = token
      if (llmConfig.useOAuthToken) {
        try {
          activeToken = await getValidToken()
        } catch {
          await login()
          activeToken = useAuthStore.getState().token
        }
      }

      setStreaming(true)
      const abortController = new AbortController()
      abortRef.current = abortController

      // Build message history for the LLM
      const allMessages = useChatStore.getState().messages

      // Prepend system prompt if configured
      const systemMsg = llmConfig.systemPrompt
        ? [{ id: 'system', role: 'system' as const, content: llmConfig.systemPrompt, timestamp: 0 }]
        : []

      const openAIMessages = toOpenAIMessages([...systemMsg, ...allMessages])
      const openAITools = mcpToolsToOpenAI(tools)

      // Create a placeholder assistant message for streaming
      const assistantMsgId = uid()
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
      }
      addMessage(assistantMsg)

      let accumulatedText = ''
      let pendingToolCalls: ToolCall[] | undefined

      try {
        await streamChat({
          config: llmConfig,
          token: activeToken,
          messages: openAIMessages,
          tools: openAITools.length > 0 ? openAITools : undefined,
          signal: abortController.signal,
          onDelta: (delta) => {
            if (delta.type === 'text') {
              accumulatedText += delta.content
              updateMessage(assistantMsgId, { content: accumulatedText })
            } else if (delta.type === 'tool_calls_done') {
              pendingToolCalls = delta.toolCalls
              updateMessage(assistantMsgId, {
                toolCalls: delta.toolCalls,
                streaming: false,
              })
            } else if (delta.type === 'done') {
              updateMessage(assistantMsgId, { streaming: false })
            }
          },
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const errMsg = err instanceof LlmError ? err.message : String(err)
          updateMessage(assistantMsgId, {
            content: accumulatedText || `Error: ${errMsg}`,
            streaming: false,
          })
        } else {
          updateMessage(assistantMsgId, { streaming: false })
        }
        setStreaming(false)
        abortRef.current = null
        return
      }

      // Execute tool calls if any
      if (pendingToolCalls && pendingToolCalls.length > 0 && !abortController.signal.aborted) {
        await executeToolCalls(pendingToolCalls, abortController, activeToken)
      } else {
        setStreaming(false)
        abortRef.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming, token, llmConfig, tools, addMessage, updateMessage, setStreaming, getValidToken, login, callTool]
  )

  async function executeToolCalls(
    toolCalls: ToolCall[],
    abortController: AbortController,
    activeToken: typeof token
  ) {
    // Execute each tool call and add result messages
    for (const tc of toolCalls) {
      if (abortController.signal.aborted) break

      const toolResultId = uid()
      let resultContent: string
      let isError = false

      try {
        resultContent = await callTool(tc.name, tc.arguments)
      } catch (err) {
        resultContent = `Tool error: ${err instanceof Error ? err.message : String(err)}`
        isError = true
      }

      const toolResultMsg: ChatMessage = {
        id: toolResultId,
        role: 'tool',
        content: resultContent,
        toolResult: {
          toolCallId: tc.id,
          name: tc.name,
          content: resultContent,
          isError,
        },
        timestamp: Date.now(),
      }
      addMessage(toolResultMsg)
    }

    if (abortController.signal.aborted) {
      setStreaming(false)
      abortRef.current = null
      return
    }

    // Re-send to LLM with tool results
    const updatedMessages = useChatStore.getState().messages
    const systemMsg = llmConfig.systemPrompt
      ? [{ id: 'sys', role: 'system' as const, content: llmConfig.systemPrompt, timestamp: 0 }]
      : []
    const openAIMessages = toOpenAIMessages([...systemMsg, ...updatedMessages])
    const openAITools = mcpToolsToOpenAI(tools)

    const followupId = uid()
    addMessage({
      id: followupId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    })

    let accText = ''
    let nextToolCalls: ToolCall[] | undefined

    try {
      await streamChat({
        config: llmConfig,
        token: activeToken,
        messages: openAIMessages,
        tools: openAITools.length > 0 ? openAITools : undefined,
        signal: abortController.signal,
        onDelta: (delta) => {
          if (delta.type === 'text') {
            accText += delta.content
            updateMessage(followupId, { content: accText })
          } else if (delta.type === 'tool_calls_done') {
            nextToolCalls = delta.toolCalls
            updateMessage(followupId, { toolCalls: delta.toolCalls, streaming: false })
          } else if (delta.type === 'done') {
            updateMessage(followupId, { streaming: false })
          }
        },
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        updateMessage(followupId, {
          content: accText || `Error: ${err instanceof Error ? err.message : String(err)}`,
          streaming: false,
        })
      } else {
        updateMessage(followupId, { streaming: false })
      }
      setStreaming(false)
      abortRef.current = null
      return
    }

    // Handle chained tool calls (recursive)
    if (nextToolCalls && nextToolCalls.length > 0 && !abortController.signal.aborted) {
      await executeToolCalls(nextToolCalls, abortController, activeToken)
    } else {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [setStreaming])

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    clearMessages,
  }
}
