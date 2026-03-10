import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppConfig,
  OAuthToken,
  ChatMessage,
  McpTool,
  McpConnectionState,
} from '../types'
import { DEFAULT_CONFIG } from '../types'

// ─── Config store (persisted to localStorage, secrets NOT persisted) ──────

interface ConfigState {
  config: AppConfig
  setConfig: (config: AppConfig) => void
  updateOAuth: (partial: Partial<AppConfig['oauth']>) => void
  updateLlm: (partial: Partial<AppConfig['llm']>) => void
  updateMcp: (partial: Partial<AppConfig['mcp']>) => void
}

// Sensitive fields that must never be written to localStorage
const REDACT_OAUTH = ['clientSecret', 'password'] as const
const REDACT_LLM = ['apiKey'] as const

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      setConfig: (config) => set({ config }),
      updateOAuth: (partial) =>
        set((s) => ({
          config: { ...s.config, oauth: { ...s.config.oauth, ...partial } },
        })),
      updateLlm: (partial) =>
        set((s) => ({
          config: { ...s.config, llm: { ...s.config.llm, ...partial } },
        })),
      updateMcp: (partial) =>
        set((s) => ({
          config: { ...s.config, mcp: { ...s.config.mcp, ...partial } },
        })),
    }),
    {
      name: 'mcp-chat-config',
      // Strip secrets before persisting
      partialize: (state) => ({
        config: {
          ...state.config,
          oauth: Object.fromEntries(
            Object.entries(state.config.oauth).map(([k, v]) =>
              REDACT_OAUTH.includes(k as typeof REDACT_OAUTH[number]) ? [k, ''] : [k, v]
            )
          ) as AppConfig['oauth'],
          llm: Object.fromEntries(
            Object.entries(state.config.llm).map(([k, v]) =>
              REDACT_LLM.includes(k as typeof REDACT_LLM[number]) ? [k, ''] : [k, v]
            )
          ) as AppConfig['llm'],
        },
      }),
    }
  )
)

// ─── Auth store (in-memory only) ─────────────────────────────────────────

interface AuthState {
  token: OAuthToken | null
  isLoading: boolean
  error: string | null
  setToken: (token: OAuthToken | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearToken: () => void
  isTokenValid: () => boolean
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  isLoading: false,
  error: null,
  setToken: (token) => set({ token, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  clearToken: () => set({ token: null }),
  isTokenValid: () => {
    const { token } = get()
    if (!token) return false
    if (token.expiresAt === null) return true
    return Date.now() < token.expiresAt - 30_000 // 30s buffer
  },
}))

// ─── MCP store ────────────────────────────────────────────────────────────

interface McpState {
  connectionState: McpConnectionState
  tools: McpTool[]
  error: string | null
  setConnectionState: (state: McpConnectionState) => void
  setTools: (tools: McpTool[]) => void
  setError: (error: string | null) => void
}

export const useMcpStore = create<McpState>()((set) => ({
  connectionState: 'disconnected',
  tools: [],
  error: null,
  setConnectionState: (connectionState) => set({ connectionState }),
  setTools: (tools) => set({ tools }),
  setError: (error) => set({ error }),
}))

// ─── Chat store ───────────────────────────────────────────────────────────

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  addMessage: (msg: ChatMessage) => void
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void
  clearMessages: () => void
  setStreaming: (streaming: boolean) => void
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, partial) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...partial } : m)),
    })),
  clearMessages: () => set({ messages: [] }),
  setStreaming: (isStreaming) => set({ isStreaming }),
}))

// ─── UI store ─────────────────────────────────────────────────────────────

interface UiState {
  sidebarOpen: boolean
  activeTab: 'llm' | 'oauth' | 'mcp'
  setSidebarOpen: (open: boolean) => void
  setActiveTab: (tab: 'llm' | 'oauth' | 'mcp') => void
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: true,
  activeTab: 'llm',
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActiveTab: (activeTab) => set({ activeTab }),
}))
