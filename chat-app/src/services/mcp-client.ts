/**
 * MCP (Model Context Protocol) client — HTTP + SSE transport
 *
 * Implements the MCP Streamable HTTP transport spec:
 *   POST /mcp  → JSON-RPC request/response
 *   GET  /mcp  → SSE stream for server-initiated notifications
 *
 * The generated wsdl-to-mcp server uses stdio by default. To expose it over
 * HTTP/SSE, run it behind a small bridge such as:
 *   - @modelcontextprotocol/server-everything (example)
 *   - mcp-proxy (npm package)
 *   - The built-in HTTP transport added to the generated server
 *
 * For testing without an HTTP bridge, point serverUrl at any MCP-over-HTTP
 * server (e.g. run `npx mcp-proxy` wrapping the stdio server).
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
  private sessionId: string | null = null
  private sseSource: EventSource | null = null
  private pendingRequests = new Map<
    string | number,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
  >()
  private nextId = 1
  private onConnect?: ConnectCallback
  private onDisconnect?: DisconnectCallback
  private onError?: ErrorCallback
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private autoReconnect: boolean
  private destroyed = false

  constructor(options: {
    serverUrl: string
    authToken?: string
    autoReconnect?: boolean
    onConnect?: ConnectCallback
    onDisconnect?: DisconnectCallback
    onError?: ErrorCallback
  }) {
    // Normalize base URL (strip trailing slash)
    this.baseUrl = options.serverUrl.replace(/\/$/, '')
    this.authToken = options.authToken
    this.autoReconnect = options.autoReconnect ?? true
    this.onConnect = options.onConnect
    this.onDisconnect = options.onDisconnect
    this.onError = options.onError
  }

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this.destroyed = false
    await this.openSse()
    // Initialize the MCP session
    await this.initialize()
  }

  private openSse(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sseUrl = `${this.baseUrl}/mcp`
      const headers: Record<string, string> = {}
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`

      // EventSource doesn't support custom headers natively.
      // We use a URL param as a fallback for auth if needed.
      const url = new URL(sseUrl)
      if (this.authToken) url.searchParams.set('token', this.authToken)

      const es = new EventSource(url.toString())
      this.sseSource = es

      const connectTimeout = setTimeout(() => {
        if (es.readyState !== EventSource.OPEN) {
          es.close()
          reject(new McpClientError('SSE connection timed out after 10s'))
        }
      }, 10_000)

      es.onopen = () => {
        clearTimeout(connectTimeout)
        resolve()
      }

      es.onerror = (e) => {
        clearTimeout(connectTimeout)
        if (es.readyState === EventSource.CLOSED) {
          const reason = 'SSE connection closed'
          this.handleDisconnect(reason)
          reject(new McpClientError(reason))
        } else {
          const err = new McpClientError(`SSE error: ${String(e)}`)
          this.onError?.(err)
        }
      }

      // Incoming JSON-RPC responses/notifications from the server
      es.addEventListener('message', (evt) => {
        this.handleSseMessage(evt.data)
      })

      // Session ID sent by the server on connect
      es.addEventListener('endpoint', (evt) => {
        this.sessionId = evt.data
      })
    })
  }

  private handleSseMessage(data: string) {
    let msg: JsonRpcResponse
    try {
      msg = JSON.parse(data) as JsonRpcResponse
    } catch {
      return
    }

    if (msg.id !== null && msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        pending.resolve(msg)
      }
    }
  }

  private handleDisconnect(reason: string) {
    this.onDisconnect?.(reason)

    // Reject all pending requests
    for (const { reject } of this.pendingRequests.values()) {
      reject(new McpClientError(`Disconnected: ${reason}`))
    }
    this.pendingRequests.clear()

    if (this.autoReconnect && !this.destroyed) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(delayMs = 2000) {
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

  disconnect() {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.sseSource?.close()
    this.sseSource = null
    this.sessionId = null
  }

  // ── JSON-RPC over HTTP POST ───────────────────────────────────────────────

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      })
    } catch (err) {
      throw new McpClientError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new McpClientError(`HTTP ${response.status}: ${text.slice(0, 200)}`, response.status)
    }

    const contentType = response.headers.get('content-type') ?? ''

    // Streamable HTTP: server may respond inline as JSON or via SSE
    if (contentType.includes('text/event-stream')) {
      // Response is an SSE stream — read it fully
      return this.readSseResponse(response, id)
    }

    const json = (await response.json()) as JsonRpcResponse
    if (json.error) {
      throw new McpClientError(json.error.message, json.error.code)
    }
    return json.result
  }

  private async readSseResponse(response: Response, requestId: number): Promise<unknown> {
    const reader = response.body?.getReader()
    if (!reader) throw new McpClientError('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let result: unknown = undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          try {
            const msg = JSON.parse(data) as JsonRpcResponse
            if (msg.id === requestId) {
              if (msg.error) throw new McpClientError(msg.error.message, msg.error.code)
              result = msg.result
            }
          } catch (e) {
            if (e instanceof McpClientError) throw e
          }
        }
      }
    }

    return result
  }

  // ── MCP Protocol ──────────────────────────────────────────────────────────

  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'wsdl-to-mcp-chat', version: '0.1.0' },
    })
    // Extract session ID from result if provided
    const r = result as Record<string, unknown> | undefined
    if (r?.sessionId && typeof r.sessionId === 'string') {
      this.sessionId = r.sessionId
    }
    // Send initialized notification
    await this.sendNotification('notifications/initialized')
    this.onConnect?.()
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId

    await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    }).catch(() => {/* notifications are fire-and-forget */})
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.sendRequest('tools/list')
    const r = result as { tools?: McpTool[] }
    return r?.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })

    const r = result as {
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }

    if (r?.isError) {
      const text = r.content?.map((c) => c.text ?? '').join('\n') ?? 'Tool error'
      throw new McpClientError(text)
    }

    return (
      r?.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n') ?? ''
    )
  }
}
