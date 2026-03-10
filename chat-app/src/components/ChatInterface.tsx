import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useChat } from '../hooks/useChat'
import { useMcpStore } from '../store'
import { MessageBubble } from './MessageBubble'

export function ChatInterface() {
  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } = useChat()
  const tools = useMcpStore((s) => s.tools)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage(text)
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }

  // Filter out tool-result messages for display (they're shown inline)
  const displayMessages = messages.filter((m) => m.role !== 'tool')

  return (
    <div className="chat-interface">
      {/* Header */}
      <div className="chat-header">
        <h2>Chat</h2>
        <div className="chat-header-actions">
          {tools.length > 0 && (
            <span className="tool-count-badge">{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={clearMessages}
            disabled={isStreaming}
            title="Clear conversation"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {displayMessages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <p>Start a conversation.</p>
            {tools.length === 0 && (
              <p className="empty-hint">
                Connect to an MCP server in the sidebar to enable SOAP tools.
              </p>
            )}
            {tools.length > 0 && (
              <p className="empty-hint">
                {tools.length} tool{tools.length !== 1 ? 's' : ''} available:{' '}
                {tools
                  .slice(0, 3)
                  .map((t) => t.name)
                  .join(', ')}
                {tools.length > 3 ? ` +${tools.length - 3} more` : ''}
              </p>
            )}
          </div>
        )}

        {displayMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={isStreaming}
          />
          <div className="chat-input-actions">
            {isStreaming ? (
              <button className="btn btn-danger btn-sm" onClick={stopStreaming}>
                Stop
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSend}
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
