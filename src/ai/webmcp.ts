// WebMCP — Chrome 146+ behind chrome://flags/#enable-webmcp-testing
// https://webmachinelearning.github.io/webmcp/

interface WebMCPContentBlock {
  type: 'text';
  text: string;
}

interface WebMCPToolResult {
  content: WebMCPContentBlock[];
  isError?: boolean;
}

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, string>;
  execute: (args: Record<string, unknown>) => WebMCPToolResult | Promise<WebMCPToolResult>;
}

interface WebMCPModelContext {
  registerTool(tool: WebMCPTool): void;
  unregisterTool(name: string): void;
  provideContext(context: { tools: WebMCPTool[] }): void;
  clearContext(): void;
}

declare global {
  interface Navigator {
    /** Chrome 146+ experimental WebMCP API */
    modelContext?: WebMCPModelContext;
  }
}

export function isWebMCPAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'modelContext' in navigator;
}

/**
 * Register SOAP tools (from BrowserMcpServer) as WebMCP tools via navigator.modelContext.
 *
 * @param tools        Tool list from BrowserMcpServer.getTools()
 * @param callTool     Async function that executes a tool and returns the SOAP response XML
 * @param getProxyUrl  Getter that returns the current CORS proxy URL (read at call time)
 */
export function registerSOAPToolsWithWebMCP(
  tools: Array<{ name: string; description?: string; inputSchema: unknown }>,
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  getProxyUrl: () => string,
): void {
  if (!isWebMCPAvailable() || !navigator.modelContext) return;

  const webMCPTools: WebMCPTool[] = tools.map(tool => ({
    name: tool.name,
    description: tool.description || tool.name,
    inputSchema: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    execute: async (args) => {
      if (!getProxyUrl()) {
        return {
          content: [{
            type: 'text',
            text: 'No CORS proxy configured. Set a proxy URL in Connection Settings before invoking WebMCP tools.',
          }],
          isError: true,
        };
      }
      try {
        const xml = await callTool(tool.name, args);
        return { content: [{ type: 'text', text: xml }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: message }], isError: true };
      }
    },
  }));

  navigator.modelContext.provideContext({ tools: webMCPTools });
}

export function clearWebMCPContext(): void {
  if (!isWebMCPAvailable() || !navigator.modelContext) return;
  navigator.modelContext.clearContext();
}
