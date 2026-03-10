import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, ToolResult } from '../types'
import { ToolCallBlock } from './ToolCallDisplay'
import { useChatStore } from '../store'

interface Props {
  message: ChatMessage
}

export function MessageBubble({ message }: Props) {
  const allMessages = useChatStore((s) => s.messages)

  if (message.role === 'system') return null

  // Find tool results that match this message's tool calls
  const toolResults = message.toolCalls
    ? message.toolCalls.map((tc) => {
        const resultMsg = allMessages.find(
          (m) => m.role === 'tool' && m.toolResult?.toolCallId === tc.id
        )
        return resultMsg?.toolResult as ToolResult | undefined
      })
    : []

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  if (message.role === 'tool') return null  // Tool results are rendered inline with the assistant message

  return (
    <div className={`message-bubble ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-role-label">
        {isUser ? 'You' : 'Assistant'}
      </div>

      {/* Text content */}
      {message.content && (
        <div className="message-content">
          {isAssistant ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
          {message.streaming && <span className="cursor-blink">▍</span>}
        </div>
      )}

      {/* Show streaming indicator when no text yet */}
      {isAssistant && message.streaming && !message.content && !message.toolCalls && (
        <div className="message-content">
          <span className="cursor-blink">▍</span>
        </div>
      )}

      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="tool-calls-list">
          {message.toolCalls.map((tc, i) => (
            <ToolCallBlock key={tc.id} toolCall={tc} result={toolResults[i]} />
          ))}
        </div>
      )}

      <div className="message-timestamp">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  )
}
