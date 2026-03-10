import { useState } from 'react'
import { useConfigStore, useAuthStore, useUiStore } from '../store'
import { useOAuth } from '../hooks/useOAuth'
import { useMcpClient } from '../hooks/useMcpClient'
import { formatTokenExpiry } from '../services/oauth'
import { ConnectionBadge, mcpStateToStatus } from './ConnectionStatus'
import type { OAuthGrantType } from '../types'

export function ConfigPanel() {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen } = useUiStore()

  if (!sidebarOpen) {
    return (
      <button
        className="sidebar-toggle sidebar-toggle-collapsed"
        onClick={() => setSidebarOpen(true)}
        title="Open settings"
      >
        ⚙
      </button>
    )
  }

  return (
    <aside className="config-panel">
      <div className="config-panel-header">
        <span className="config-panel-title">Settings</span>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setSidebarOpen(false)}
          title="Close settings"
        >
          ✕
        </button>
      </div>

      <div className="config-tabs">
        {(['llm', 'oauth', 'mcp'] as const).map((tab) => (
          <button
            key={tab}
            className={`config-tab ${activeTab === tab ? 'config-tab-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'llm' ? 'LLM' : tab === 'oauth' ? 'OAuth' : 'MCP'}
          </button>
        ))}
      </div>

      <div className="config-panel-body">
        {activeTab === 'llm' && <LlmTab />}
        {activeTab === 'oauth' && <OAuthTab />}
        {activeTab === 'mcp' && <McpTab />}
      </div>
    </aside>
  )
}

// ─── LLM Tab ──────────────────────────────────────────────────────────────

function LlmTab() {
  const { config, updateLlm } = useConfigStore()
  const llm = config.llm

  return (
    <div className="config-section">
      <h3>LLM Endpoint</h3>
      <p className="config-hint">
        Any OpenAI-compatible endpoint (OpenAI, Azure, Ollama, vLLM, etc.)
      </p>

      <Field label="Base URL">
        <input
          type="url"
          value={llm.baseUrl}
          onChange={(e) => updateLlm({ baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
        />
      </Field>

      <Field label="Model">
        <input
          type="text"
          value={llm.model}
          onChange={(e) => updateLlm({ model: e.target.value })}
          placeholder="gpt-4o"
        />
      </Field>

      <Field label="Authentication">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={llm.useOAuthToken}
            onChange={(e) => updateLlm({ useOAuthToken: e.target.checked })}
          />
          Use OAuth token (from OAuth tab)
        </label>
      </Field>

      {!llm.useOAuthToken && (
        <Field label="API Key">
          <input
            type="password"
            value={llm.apiKey}
            onChange={(e) => updateLlm({ apiKey: e.target.value })}
            placeholder="sk-…"
            autoComplete="off"
          />
        </Field>
      )}

      <Field label="Max Tokens">
        <input
          type="number"
          value={llm.maxTokens}
          min={1}
          max={32768}
          onChange={(e) => updateLlm({ maxTokens: parseInt(e.target.value) || 4096 })}
        />
      </Field>

      <Field label="Temperature">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={llm.temperature}
            onChange={(e) => updateLlm({ temperature: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 32, textAlign: 'right', fontSize: 13 }}>
            {llm.temperature.toFixed(2)}
          </span>
        </div>
      </Field>

      <Field label="System Prompt">
        <textarea
          value={llm.systemPrompt}
          onChange={(e) => updateLlm({ systemPrompt: e.target.value })}
          rows={4}
          placeholder="You are a helpful assistant…"
        />
      </Field>

      <ExtraHeadersEditor
        label="Extra Request Headers"
        value={llm.extraHeaders ?? {}}
        onChange={(h) => updateLlm({ extraHeaders: h })}
      />
    </div>
  )
}

// ─── OAuth Tab ────────────────────────────────────────────────────────────

function OAuthTab() {
  const { config, updateOAuth } = useConfigStore()
  const oauth = config.oauth
  const { token, isLoading, error, login, logout } = useOAuth()
  const authStore = useAuthStore()

  return (
    <div className="config-section">
      <h3>OAuth 2.0 / Token Gateway</h3>
      <p className="config-hint">
        Used when the LLM endpoint is behind an API gateway that requires a session token.
      </p>

      {/* Token status */}
      <div className="token-status-box">
        {token ? (
          <>
            <ConnectionBadge
              label={`Token valid · ${formatTokenExpiry(token)}`}
              state="ok"
            />
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Revoke
            </button>
          </>
        ) : (
          <ConnectionBadge label="No token" state="off" />
        )}
        {error && <div className="config-error">{error}</div>}
      </div>

      <Field label="Grant Type">
        <select
          value={oauth.grantType}
          onChange={(e) => updateOAuth({ grantType: e.target.value as OAuthGrantType })}
        >
          <option value="client_credentials">Client Credentials</option>
          <option value="authorization_code">Authorization Code</option>
          <option value="password">Resource Owner Password</option>
        </select>
      </Field>

      <Field label="Token URL">
        <input
          type="url"
          value={oauth.tokenUrl}
          onChange={(e) => updateOAuth({ tokenUrl: e.target.value })}
          placeholder="https://auth.example.com/oauth/token"
        />
      </Field>

      <Field label="Client ID">
        <input
          type="text"
          value={oauth.clientId}
          onChange={(e) => updateOAuth({ clientId: e.target.value })}
          placeholder="my-client-id"
          autoComplete="off"
        />
      </Field>

      <Field label="Client Secret">
        <input
          type="password"
          value={oauth.clientSecret}
          onChange={(e) => updateOAuth({ clientSecret: e.target.value })}
          placeholder="(not saved to local storage)"
          autoComplete="new-password"
        />
      </Field>

      <Field label="Scope">
        <input
          type="text"
          value={oauth.scope}
          onChange={(e) => updateOAuth({ scope: e.target.value })}
          placeholder="openid profile api"
        />
      </Field>

      {oauth.grantType === 'authorization_code' && (
        <Field label="Redirect URI">
          <input
            type="url"
            value={oauth.redirectUri ?? ''}
            onChange={(e) => updateOAuth({ redirectUri: e.target.value })}
            placeholder={window.location.origin + '/callback'}
          />
        </Field>
      )}

      {oauth.grantType === 'password' && (
        <>
          <Field label="Username">
            <input
              type="text"
              value={oauth.username ?? ''}
              onChange={(e) => updateOAuth({ username: e.target.value })}
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={oauth.password ?? ''}
              onChange={(e) => updateOAuth({ password: e.target.value })}
              autoComplete="current-password"
            />
          </Field>
        </>
      )}

      <ExtraHeadersEditor
        label="Extra Token Request Headers"
        value={oauth.extraHeaders ?? {}}
        onChange={(h) => updateOAuth({ extraHeaders: h })}
      />

      <ExtraHeadersEditor
        label="Extra Token Body Params"
        value={oauth.extraParams ?? {}}
        onChange={(p) => updateOAuth({ extraParams: p })}
      />

      <button
        className="btn btn-primary"
        onClick={login}
        disabled={isLoading || !oauth.tokenUrl || !oauth.clientId}
        style={{ width: '100%', marginTop: 8 }}
      >
        {isLoading ? 'Fetching token…' : token ? 'Re-fetch token' : 'Fetch token'}
      </button>

      {token && (
        <details className="token-details">
          <summary>Token details</summary>
          <pre>{JSON.stringify({ ...token, accessToken: token.accessToken.slice(0, 20) + '…' }, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}

// ─── MCP Tab ──────────────────────────────────────────────────────────────

function McpTab() {
  const { config, updateMcp } = useConfigStore()
  const mcp = config.mcp
  const { connectionState, tools, error, connect, disconnect } = useMcpClient()
  const isConnected = connectionState === 'connected'
  const isConnecting = connectionState === 'connecting'

  return (
    <div className="config-section">
      <h3>MCP Server</h3>
      <p className="config-hint">
        Connect to a running MCP SOAP server generated by this tool (HTTP/SSE transport).
        Run your generated server with an HTTP bridge such as{' '}
        <code>npx @modelcontextprotocol/server-fetch</code> or{' '}
        <code>npx mcp-proxy</code>.
      </p>

      <div className="token-status-box">
        <ConnectionBadge
          label={
            connectionState === 'connected'
              ? `Connected · ${tools.length} tool${tools.length !== 1 ? 's' : ''}`
              : connectionState === 'connecting'
              ? 'Connecting…'
              : connectionState === 'error'
              ? 'Connection error'
              : 'Disconnected'
          }
          state={mcpStateToStatus(connectionState)}
          detail={error ?? undefined}
        />
      </div>

      {error && <div className="config-error">{error}</div>}

      <Field label="Server URL">
        <input
          type="url"
          value={mcp.serverUrl}
          onChange={(e) => updateMcp({ serverUrl: e.target.value })}
          placeholder="http://localhost:3000"
          disabled={isConnected || isConnecting}
        />
      </Field>

      <Field label="Auth Token (optional)">
        <input
          type="password"
          value={mcp.authToken ?? ''}
          onChange={(e) => updateMcp({ authToken: e.target.value })}
          placeholder="Bearer token for MCP server access"
          disabled={isConnected || isConnecting}
        />
      </Field>

      <Field label="">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={mcp.autoReconnect}
            onChange={(e) => updateMcp({ autoReconnect: e.target.checked })}
          />
          Auto-reconnect on disconnect
        </label>
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {!isConnected && !isConnecting && (
          <button
            className="btn btn-primary"
            onClick={connect}
            disabled={!mcp.serverUrl}
            style={{ flex: 1 }}
          >
            Connect
          </button>
        )}
        {isConnecting && (
          <button className="btn btn-secondary" disabled style={{ flex: 1 }}>
            Connecting…
          </button>
        )}
        {isConnected && (
          <button className="btn btn-danger" onClick={disconnect} style={{ flex: 1 }}>
            Disconnect
          </button>
        )}
      </div>

      {tools.length > 0 && (
        <div className="tools-list">
          <h4>Available Tools</h4>
          {tools.map((tool) => (
            <div key={tool.name} className="tool-list-item">
              <span className="tool-list-name">{tool.name}</span>
              {tool.description && (
                <span className="tool-list-desc">{tool.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="config-field">
      {label && <label className="config-label">{label}</label>}
      {children}
    </div>
  )
}

function ExtraHeadersEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
}) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(value)

  const updateEntry = (idx: number, key: string, val: string) => {
    const next = [...entries]
    next[idx] = [key, val]
    onChange(Object.fromEntries(next))
  }

  const addEntry = () => {
    onChange({ ...value, '': '' })
  }

  const removeEntry = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx)
    onChange(Object.fromEntries(next))
  }

  return (
    <div className="extra-headers">
      <button
        className="extra-headers-toggle"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {open ? '▾' : '▸'} {label} {entries.length > 0 && `(${entries.length})`}
      </button>

      {open && (
        <div className="extra-headers-body">
          {entries.map(([k, v], i) => (
            <div key={i} className="extra-header-row">
              <input
                type="text"
                value={k}
                placeholder="Key"
                onChange={(e) => updateEntry(i, e.target.value, v)}
              />
              <input
                type="text"
                value={v}
                placeholder="Value"
                onChange={(e) => updateEntry(i, k, e.target.value)}
              />
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => removeEntry(i)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addEntry}>
            + Add
          </button>
        </div>
      )}
    </div>
  )
}
