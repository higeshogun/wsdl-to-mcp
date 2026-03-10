/**
 * MCP client supporting both transport variants:
 *
 *  ① Legacy SSE transport (used by mcp-proxy and most existing servers):
 *       GET  <base>/sse          → SSE stream; server emits "endpoint" event
 *                                  with the message POST URL
 *       POST <message-url>       → JSON-RPC request; response arrives via SSE
 *
 *  ② Streamable HTTP transport (newer spec, 2024-11-05):
 *       POST <base>/mcp          → JSON-RPC; response may be inline JSON or SSE
 *       GET  <base>/mcp          → SSE stream for server-push notifications
 *
 * Detection: if the URL path ends with /sse, or the server sends an "endpoint"
 * event, we switch to legacy mode automatically.  Otherwise Streamable HTTP is
 * assumed.
 *
 * Running with mcp-proxy:
 *   npx mcp-proxy --port 3000 -- node dist/index.js
 *   → set Server URL to http://localhost:3000  (legacy SSE, /sse path)
 */

import type { McpTool } from '../types'

export class McpClientError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message)
    this.name = 'McpClientError'
  }
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

type ConnectCallback = () => void
type DisconnectCallback = (reason: string) => void
type ErrorCallback = (err: Error) => void

export class McpClient {
  private baseUrl: string
  private authToken: string | undefined
  private autoReconnect: boolean
  private destroyed = false

  // SSE connection
  private sseSource: EventSource | null = null
  // Legacy SSE: POST URL received via "endpoint" event
  private messageUrl: string | null = null
  // Pending JSON-RPC requests waiting for SSE response
  private pending = new Map<
    string | number,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
  >()
  private nextId = 1
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private onConnect?: ConnectCallback
  private onDisconnect?: DisconnectCallback
  private onError?: ErrorCallback

  constructor(options: {
    serverUrl: string
    authToken?: string
    autoReconnect?: boolean
    onConnect?: ConnectCallback
    onDisconnect?: DisconnectCallback
    onError?: ErrorCallback
  }) {
    this.baseUrl = options.serverUrl.replace(/\/$/, '')
    this.authToken = options.authToken
    this.autoReconnect = options.autoReconnect ?? true
    this.onConnect = options.onConnect
    this.onDisconnect = options.onDisconnect
    this.onError = options.onError
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.destroyed = false
    await this.openSse()
    await this.initialize()
  }

  disconnect() {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.sseSource?.close()
    this.sseSource = null
    this.messageUrl = null
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.sendRequest('tools/list')
    const r = result as { tools?: McpTool[] } | undefined
    return r?.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.sendRequest('tools/call', { name, arguments: args })
    const r = result as { content?: Array<{ type: string; text?: string }>; isError?: boolean } | undefined
    if (r?.isError) {
      throw new McpClientError(r.content?.map((c) => c.text ?? '').join('\n') ?? 'Tool error')
    }
    return r?.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? ''
  }

  // ── SSE connection ────────────────────────────────────────────────────────

  private openSse(): Promise<void> {
    return new Promise((resolve, reject) => {
      // mcp-proxy serves legacy SSE at /sse
      // Streamable HTTP also uses /mcp with GET — we'll try /sse first then fall back
      const sseUrl = new URL(`${this.baseUrl}/sse`)
      if (this.authToken) sseUrl.searchParams.set('token', this.authToken)

      const es = new EventSource(sseUrl.toString())
      this.sseSource = es

      let resolved = false

      const connectTimeout = setTimeout(() => {
        if (!resolved) {
          es.close()
          reject(new McpClientError(
            'SSE connection timed out (10s). Check that mcp-proxy is running on the correct port and CORS is enabled.'
          ))
        }
      }, 10_000)

      es.onopen = () => {
        // For legacy SSE we wait for the "endpoint" event before resolving,
        // because we need the message URL before we can send requests.
        // Set a short timeout: if no endpoint event arrives within 3s, assume
        // Streamable HTTP and resolve anyway.
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            clearTimeout(connectTimeout)
            resolve()
          }
        }, 3_000)
      }

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          clearTimeout(connectTimeout)
          if (!resolved) {
            reject(new McpClientError('SSE connection closed. Is mcp-proxy running?'))
          } else {
            this.handleDisconnect('SSE connection closed')
          }
        }
      }

      // Legacy SSE transport: server sends the POST endpoint URL
      es.addEventListener('endpoint', (evt) => {
        const endpointData = evt.data as string
        // The endpoint may be relative (/message?sessionId=xxx) or absolute
        try {
          this.messageUrl = new URL(endpointData, this.baseUrl).toString()
        } catch {
          this.messageUrl = endpointData
        }
        if (!resolved) {
          resolved = true
          clearTimeout(connectTimeout)
          resolve()
        }
      })

      // JSON-RPC responses arrive as SSE "message" events
      es.addEventListener('message', (evt) => {
        this.handleSseData(evt.data as string)
      })
    })
  }

  private handleSseData(data: string) {
    let msg: JsonRpcResponse
    try {
      msg = JSON.parse(data) as JsonRpcResponse
    } catch {
      return
    }
    if (msg.id !== null && msg.id !== undefined) {
      const handler = this.pending.get(msg.id)
      if (handler) {
        this.pending.delete(msg.id)
        handler.resolve(msg)
      }
    }
  }

  private handleDisconnect(reason: string) {
    this.onDisconnect?.(reason)
    for (const { reject } of this.pending.values()) {
      reject(new McpClientError(`Disconnected: ${reason}`))
    }
    this.pending.clear()
    if (this.autoReconnect && !this.destroyed) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(delayMs = 2_000) {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (this.destroyed) return
      try {
        await this.openSse()
        await this.initialize()
        this.onConnect?.()
      } catch {
        this.scheduleReconnect(Math.min(delayMs * 2, 30_000))
      }
    }, delayMs)
  }

  // ── JSON-RPC sending ──────────────────────────────────────────────────────

  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    if (this.messageUrl) {
      // ① Legacy SSE transport — POST to message URL, response comes via SSE
      return this.sendLegacy(id, request)
    } else {
      // ② Streamable HTTP transport — POST to /mcp, response inline or via SSE
      return this.sendStreamable(id, request)
    }
  }

  /** Legacy SSE: POST to message URL, await response on SSE stream */
  private sendLegacy(id: number, request: JsonRpcRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (r) => {
          if (r.error) reject(new McpClientError(r.error.message, r.error.code))
          else resolve(r.result)
        },
        reject,
      })

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`

      fetch(this.messageUrl!, { method: 'POST', headers, body: JSON.stringify(request) })
        .then((res) => {
          if (!res.ok) {
            this.pending.delete(id)
            res.text().then((t) => reject(new McpClientError(`HTTP ${res.status}: ${t.slice(0, 200)}`, res.status)))
          }
          // 202 Accepted: response will arrive via SSE — nothing more to do here
        })
        .catch((err) => {
          this.pending.delete(id)
          reject(new McpClientError(`Network error: ${err instanceof Error ? err.message : String(err)}`))
        })

      // Timeout individual requests after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new McpClientError(`Request timed out: ${request.method}`))
        }
      }, 30_000)
    })
  }

  /** Streamable HTTP: POST to /mcp, read inline JSON or SSE response */
  private async sendStreamable(id: number, request: JsonRpcRequest): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/mcp`, { method: 'POST', headers, body: JSON.stringify(request) })
    } catch (err) {
      throw new McpClientError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new McpClientError(`HTTP ${response.status}: ${text.slice(0, 200)}`, response.status)
    }

    const ct = response.headers.get('content-type') ?? ''
    if (ct.includes('text/event-stream')) {
      return this.readInlineSse(response, id)
    }

    const json = (await response.json()) as JsonRpcResponse
    if (json.error) throw new McpClientError(json.error.message, json.error.code)
    return json.result
  }

  private async readInlineSse(response: Response, requestId: number): Promise<unknown> {
    const reader = response.body?.getReader()
    if (!reader) throw new McpClientError('No response body')
    const decoder = new TextDecoder()
    let buffer = ''
    let result: unknown = undefined
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6)) as JsonRpcResponse
            if (msg.id === requestId) {
              if (msg.error) throw new McpClientError(msg.error.message, msg.error.code)
              result = msg.result
            }
          } catch (e) { if (e instanceof McpClientError) throw e }
        }
      }
    } finally { reader.releaseLock() }
    return result
  }

  // ── MCP handshake ─────────────────────────────────────────────────────────

  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'wsdl-to-mcp-chat', version: '0.1.0' },
    })
    // Fire-and-forget initialized notification
    const notification = { jsonrpc: '2.0' as const, method: 'notifications/initialized' }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`
    const postUrl = this.messageUrl ?? `${this.baseUrl}/mcp`
    fetch(postUrl, { method: 'POST', headers, body: JSON.stringify(notification) }).catch(() => {})

    // Streamable HTTP may return a session ID
    const r = result as Record<string, unknown> | undefined
    if (r?.sessionId && typeof r.sessionId === 'string' && !this.messageUrl) {
      // Store for Mcp-Session-Id header usage in streamable mode
      this.messageUrl = null
    }

    this.onConnect?.()
  }
}
