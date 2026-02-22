import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BrowserMcpServer, SoapTrafficEntry } from './BrowserMcpServer';
import type { NormalizedMessage, ProviderConfig, ToolDefinition, ProviderType } from './providers/types';
import { getProvider } from './providers/index';

interface ChatbotProps {
  provider: ProviderType;
  apiKey: string;
  proxyUrl: string;
  baseUrl: string;
  model: string;
  server: BrowserMcpServer;
  /** Tool names to hide from the LLM (handled automatically, e.g. Login/Logout) */
  hiddenToolNames?: Set<string>;
  /** Per-tool input schema overrides (tool name -> schema) */
  schemaOverrides?: Record<string, any>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button className="soap-copy-btn" onClick={copy} title="Copy to clipboard">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

export function Chatbot({ provider, apiKey, proxyUrl, baseUrl, model, server, hiddenToolNames, schemaOverrides }: ChatbotProps) {
  const [messages, setMessages] = useState<NormalizedMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soapLog, setSoapLog] = useState<SoapTrafficEntry[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    server.onSoapTraffic = (entry) => setSoapLog(prev => [...prev, entry]);
    return () => { server.onSoapTraffic = undefined; };
  }, [server]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: NormalizedMessage = { role: 'user', content: [{ type: 'text', text: input }] };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      await processTurn(newMessages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const processTurn = async (currentMessages: NormalizedMessage[], depth = 0) => {
    if (depth >= 10) throw new Error('Max tool call rounds reached (10). The tool may be unavailable or returning errors.');
    // 1. Get available tools from MCP server (excluding session-managed ones)
    const tools: ToolDefinition[] = server.getTools().tools
      .filter(t => !hiddenToolNames?.has(t.name))
      .map(t => {
        const schema = schemaOverrides?.[t.name] || t.inputSchema;
        return {
          name: t.name,
          description: t.description || 'No description',
          inputSchema: {
            type: 'object' as const,
            properties: schema.properties || {},
            required: schema.required || [],
          },
        };
      });

    console.log(`[Chatbot] Sending ${tools.length} tools to ${provider}:`, tools.map(t => t.name));

    // 2. Call LLM via provider
    const p = getProvider(provider);
    const config: ProviderConfig = { apiKey, proxyUrl, baseUrl, model };
    const result = await p.sendMessage(currentMessages, tools, config);

    console.log(`[Chatbot] Response from ${provider}:`, JSON.stringify(result, null, 2));

    // 3. Add assistant response
    const assistantMsg: NormalizedMessage = {
      role: 'assistant',
      content: result.content,
    };
    const updatedMessages = [...currentMessages, assistantMsg];
    setMessages(updatedMessages);

    // 4. Check for tool use
    const toolUses = result.content.filter(c => c.type === 'tool_use');
    console.log(`[Chatbot] Tool uses found: ${toolUses.length}`, toolUses.map(t => t.name));

    if (toolUses.length > 0) {
      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          // Dry-run mode: build envelope but don't send
          if (dryRun) {
            try {
              const envelope = server.buildEnvelope(toolUse.name!, toolUse.input!);
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                name: toolUse.name,
                content: `[DRY RUN] SOAP Envelope:\n${envelope}`,
              };
            } catch (err: any) {
              return {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                name: toolUse.name,
                content: `[DRY RUN] Error building envelope: ${err.message}`,
                is_error: true,
              };
            }
          }

          try {
            const callResult = await server.callTool(
              toolUse.name!,
              toolUse.input!,
              proxyUrl,
            );
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              name: toolUse.name,
              content: callResult,
            };
          } catch (err: any) {
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              name: toolUse.name,
              content: `Error: ${err.message}`,
              is_error: true,
            };
          }
        }),
      );

      const toolMsg: NormalizedMessage = { role: 'user', content: toolResults };
      await processTurn([...updatedMessages, toolMsg], depth + 1);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setInput('');
    setSoapLog([]);
  };

  const tools: ToolDefinition[] = server.getTools().tools
    .filter(t => !hiddenToolNames?.has(t.name))
    .map(t => {
      const schema = schemaOverrides?.[t.name] || t.inputSchema;
      return {
        name: t.name,
        description: t.description || 'No description',
        inputSchema: { type: 'object' as const, properties: schema.properties || {}, required: schema.required || [] },
      };
    });
  const p = getProvider(provider);
  const systemPrompt = p.getSystemPrompt ? p.getSystemPrompt(tools) : null;

  return (
    <>
    <div className="chatbot">
      <div className="chatbot-header">
        <span className="chatbot-header-title">Chat</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`btn-dry-run${dryRun ? ' btn-dry-run--active' : ''}`}
            onClick={() => setDryRun(d => !d)}
            title={dryRun ? 'Dry-run ON: tool calls will show SOAP envelope without sending' : 'Enable dry-run to preview SOAP envelopes without sending'}
          >
            {dryRun ? 'Dry Run ON' : 'Dry Run'}
          </button>
          <button
            className="btn-clear-chat"
            onClick={clearChat}
            disabled={loading}
            title="Clear chat and start a new session"
          >
            ↺ New Chat
          </button>
        </div>
      </div>
      <details className="system-prompt-panel">
        <summary>System Prompt</summary>
        <pre className="system-prompt-content">
          {systemPrompt ?? 'No explicit system prompt — this provider uses native tool-calling support.'}
        </pre>
      </details>
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="message-role">{m.role}</div>
            <div className="message-content">
              {m.content.map((block: any, j: number) => {
                if (block.type === 'text') return (
                  <div key={j} className="message-text">
                    {m.role === 'assistant'
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
                      : block.text}
                  </div>
                );
                if (block.type === 'tool_use') return (
                  <div key={j} className="tool-use">
                    Using tool: <code>{block.name}</code>
                    <pre>{JSON.stringify(block.input, null, 2)}</pre>
                  </div>
                );
                if (block.type === 'tool_result') return (
                  <div key={j} className="tool-result">
                    Result: <pre>{typeof block.content === 'string' ? block.content.substring(0, 200) : JSON.stringify(block.content).substring(0, 200)}...</pre>
                  </div>
                );
                return null;
              })}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="input-area">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>

    {soapLog.length > 0 && (
      <details className="soap-traffic-panel">
        <summary>
          SOAP Traffic
          <span className="soap-count-badge">{soapLog.length}</span>
        </summary>
        <div className="soap-log-list">
          {soapLog.map(entry => (
            <div key={entry.id} className={`soap-log-entry${entry.isError ? ' soap-log-entry--error' : ''}`}>
              <div className="soap-log-entry-header">
                <code className="soap-log-tool">{entry.toolName}</code>
                <span className="soap-log-timestamp">{entry.timestamp.toLocaleTimeString()}</span>
                {entry.isError && <span className="soap-log-error-badge">Error</span>}
              </div>
              <details className="soap-log-sub">
                <summary><span>Request</span><CopyButton text={entry.request} /></summary>
                <pre className="soap-xml">{entry.request}</pre>
              </details>
              <details className="soap-log-sub">
                <summary><span>Response</span><CopyButton text={entry.response} /></summary>
                <pre className="soap-xml">{entry.response}</pre>
              </details>
            </div>
          ))}
        </div>
      </details>
    )}
    </>
  );
}
