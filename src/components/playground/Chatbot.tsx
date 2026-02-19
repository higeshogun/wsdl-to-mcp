import { useState, useRef, useEffect } from 'react';
import type { BrowserMcpServer } from './BrowserMcpServer';
import type { NormalizedMessage, ProviderConfig, ToolDefinition, ProviderType } from './providers/types';
import { getProvider } from './providers/index';

interface ChatbotProps {
  provider: ProviderType;
  apiKey: string;
  proxyUrl: string;
  baseUrl: string;
  model: string;
  server: BrowserMcpServer;
}

export function Chatbot({ provider, apiKey, proxyUrl, baseUrl, model, server }: ChatbotProps) {
  const [messages, setMessages] = useState<NormalizedMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const processTurn = async (currentMessages: NormalizedMessage[]) => {
    // 1. Get available tools from MCP server
    const tools: ToolDefinition[] = server.getTools().map(t => ({
      name: t.name,
      description: t.description || 'No description',
      inputSchema: {
        type: 'object' as const,
        properties: t.inputSchema.properties || {},
        required: t.inputSchema.required || [],
      },
    }));

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
      await processTurn([...updatedMessages, toolMsg]);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setInput('');
  };

  return (
    <div className="chatbot">
      <div className="chatbot-header">
        <span className="chatbot-header-title">Chat</span>
        <button
          className="btn-clear-chat"
          onClick={clearChat}
          disabled={loading}
          title="Clear chat and start a new session"
        >
          ↺ New Chat
        </button>
      </div>
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="message-role">{m.role}</div>
            <div className="message-content">
              {m.content.map((block: any, j: number) => {
                if (block.type === 'text') return <div key={j}>{block.text}</div>;
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
  );
}
