// ─── OAuth / Auth ──────────────────────────────────────────────────────────

export type OAuthGrantType = 'client_credentials' | 'authorization_code' | 'password'

export interface OAuthConfig {
  /** Token endpoint URL (e.g. https://auth.example.com/oauth/token) */
  tokenUrl: string
  /** Client ID registered with the gateway */
  clientId: string
  /** Client secret (kept in memory only, never persisted) */
  clientSecret: string
  /** Space-separated scopes requested */
  scope: string
  /** Grant type to use */
  grantType: OAuthGrantType
  /** For authorization_code flow: redirect URI */
  redirectUri?: string
  /** For password flow: username */
  username?: string
  /** For password flow: password (never persisted) */
  password?: string
  /** Extra static headers to include in every token request */
  extraHeaders?: Record<string, string>
  /** Extra body params to include in every token request */
  extraParams?: Record<string, string>
}

export interface OAuthToken {
  accessToken: string
  tokenType: string
  expiresAt: number | null   // Unix ms timestamp, null = never expires
  refreshToken?: string
  scope?: string
}

// ─── LLM / OpenAI-compatible ──────────────────────────────────────────────

export interface LlmConfig {
  /** Base URL of the OpenAI-compatible endpoint */
  baseUrl: string
  /** Model identifier passed to the endpoint */
  model: string
  /** Max tokens for completion */
  maxTokens: number
  /** Temperature (0-2) */
  temperature: number
  /** System prompt shown to every conversation */
  systemPrompt: string
  /**
   * When true, the bearer token from OAuth is injected into requests.
   * When false, the apiKey below is used instead.
   */
  useOAuthToken: boolean
  /** Static API key (used when useOAuthToken is false) */
  apiKey: string
  /** Additional HTTP headers added to every LLM request */
  extraHeaders?: Record<string, string>
}

// ─── MCP ──────────────────────────────────────────────────────────────────

export interface McpConfig {
  /** HTTP base URL of the running MCP server (SSE transport) */
  serverUrl: string
  /** Optional bearer token for MCP server auth (if the server requires it) */
  authToken?: string
  /** Reconnect automatically when SSE connection drops */
  autoReconnect: boolean
}

export type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

/** A tool exposed by the MCP server */
export interface McpTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, JsonSchema>
    required?: string[]
  }
}

export interface JsonSchema {
  type?: string
  description?: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  enum?: unknown[]
  [key: string]: unknown
}

// ─── Chat / Messages ──────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  name: string
  content: string
  isError: boolean
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  /** If the assistant requested tool calls */
  toolCalls?: ToolCall[]
  /** If this is a tool result message */
  toolResult?: ToolResult
  /** Timestamp (ms) */
  timestamp: number
  /** Whether the message is still streaming */
  streaming?: boolean
}

// ─── OpenAI wire types ────────────────────────────────────────────────────

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: JsonSchema
  }
}

export interface OpenAIStreamChunk {
  id: string
  object: string
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason: string | null
  }>
}

// ─── App config (persisted) ──────────────────────────────────────────────

export interface AppConfig {
  oauth: OAuthConfig
  llm: LlmConfig
  mcp: McpConfig
}

export const DEFAULT_CONFIG: AppConfig = {
  oauth: {
    tokenUrl: '',
    clientId: '',
    clientSecret: '',
    scope: '',
    grantType: 'client_credentials',
    redirectUri: '',
    username: '',
    password: '',
    extraHeaders: {},
    extraParams: {},
  },
  llm: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: 'You are a helpful assistant with access to SOAP web service tools. Use them to answer questions accurately.',
    useOAuthToken: true,
    apiKey: '',
    extraHeaders: {},
  },
  mcp: {
    serverUrl: 'http://localhost:3000',
    authToken: '',
    autoReconnect: true,
  },
}
