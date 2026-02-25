import type { Tool, SoapTrafficEntry, PlaygroundServer } from './BrowserMcpServer';
import type { BrowserMcpServer } from './BrowserMcpServer';

export interface RouterServerEntry {
  id: string;
  /** Tool name prefix — empty string for the primary server (no prefix applied) */
  prefix: string;
  server: BrowserMcpServer;
}

/**
 * Wraps multiple BrowserMcpServer instances behind a single PlaygroundServer interface.
 * Primary server tools keep their original names; additional server tools are prefixed
 * with `{prefix}__` (e.g. "Payment_API__CreatePayment").
 */
export class MultiServerRouter implements PlaygroundServer {
  private entries: RouterServerEntry[];
  private toolMap = new Map<string, { server: BrowserMcpServer; originalName: string }>();
  private _onSoapTrafficCb?: (entry: SoapTrafficEntry) => void;

  constructor(entries: RouterServerEntry[]) {
    this.entries = entries;
    this.rebuildIndex();
  }

  private rebuildIndex() {
    this.toolMap.clear();
    for (const { prefix, server } of this.entries) {
      const { tools } = server.getTools();
      for (const tool of tools) {
        const key = prefix ? `${prefix}__${tool.name}`.slice(0, 64) : tool.name;
        this.toolMap.set(key, { server, originalName: tool.name });
      }
    }
  }

  set onSoapTraffic(cb: ((entry: SoapTrafficEntry) => void) | undefined) {
    this._onSoapTrafficCb = cb;
    for (const { prefix, server } of this.entries) {
      server.onSoapTraffic = cb
        ? (entry) => cb({ ...entry, toolName: prefix ? `${prefix}__${entry.toolName}` : entry.toolName })
        : undefined;
    }
  }

  get onSoapTraffic(): ((entry: SoapTrafficEntry) => void) | undefined {
    return this._onSoapTrafficCb;
  }

  getTools(): { tools: Tool[]; warnings: string[] } {
    const allTools: Tool[] = [];
    const allWarnings: string[] = [];
    this.toolMap.clear();

    for (const { prefix, server } of this.entries) {
      const { tools, warnings } = server.getTools();
      for (const tool of tools) {
        const prefixedName = prefix ? `${prefix}__${tool.name}`.slice(0, 64) : tool.name;
        allTools.push({ ...tool, name: prefixedName });
        this.toolMap.set(prefixedName, { server, originalName: tool.name });
      }
      allWarnings.push(...warnings);
    }

    return { tools: allTools, warnings: allWarnings };
  }

  private lookup(prefixedName: string): { server: BrowserMcpServer; originalName: string } {
    let entry = this.toolMap.get(prefixedName);
    if (!entry) {
      // Rebuild in case getTools() hasn't been called since construction
      this.rebuildIndex();
      entry = this.toolMap.get(prefixedName);
    }
    if (!entry) throw new Error(`Tool "${prefixedName}" not found in any server`);
    return entry;
  }

  async callTool(prefixedName: string, args: any, proxyUrl: string): Promise<string> {
    const { server, originalName } = this.lookup(prefixedName);
    return server.callTool(originalName, args, proxyUrl);
  }

  buildEnvelope(prefixedName: string, args: any): string {
    const { server, originalName } = this.lookup(prefixedName);
    return server.buildEnvelope(originalName, args);
  }
}
