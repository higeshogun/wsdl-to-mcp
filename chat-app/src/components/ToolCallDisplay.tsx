import { useState } from 'react'
import type { ToolCall, ToolResult } from '../types'

interface ToolCallBlockProps {
  toolCall: ToolCall
  result?: ToolResult
}

export function ToolCallBlock({ toolCall, result }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="tool-call-block">
      <button
        className="tool-call-header"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="tool-icon">⚙</span>
        <span className="tool-name">{toolCall.name}</span>
        {result && (
          <span className={`tool-status ${result.isError ? 'tool-status-error' : 'tool-status-ok'}`}>
            {result.isError ? '✗ Error' : '✓ Done'}
          </span>
        )}
        {!result && <span className="tool-status tool-status-pending">Running…</span>}
        <span className="tool-chevron">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="tool-call-body">
          <section>
            <h4>Arguments</h4>
            <pre className="tool-json">{JSON.stringify(toolCall.arguments, null, 2)}</pre>
          </section>

          {result && (
            <section>
              <h4>Result</h4>
              <pre className={`tool-json ${result.isError ? 'tool-json-error' : ''}`}>
                {tryFormatJson(result.content)}
              </pre>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
