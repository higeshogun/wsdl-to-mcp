import { ConfigPanel } from './components/ConfigPanel'
import { ChatInterface } from './components/ChatInterface'
import { useAuthStore, useMcpStore, useUiStore } from './store'
import { ConnectionBadge, mcpStateToStatus } from './components/ConnectionStatus'
import { formatTokenExpiry } from './services/oauth'
import './App.css'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const mcpState = useMcpStore((s) => s.connectionState)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)

  return (
    <div className="app-layout">
      {/* Top nav */}
      <header className="app-header">
        <div className="app-header-left">
          {!sidebarOpen && (
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setSidebarOpen(true)}
              title="Open settings"
            >
              ☰
            </button>
          )}
          <span className="app-title">MCP SOAP Chat</span>
        </div>
        <div className="app-header-status">
          <ConnectionBadge
            label={token ? `OAuth · ${formatTokenExpiry(token)}` : 'No token'}
            state={token ? 'ok' : 'off'}
          />
          <ConnectionBadge
            label={`MCP · ${mcpState}`}
            state={mcpStateToStatus(mcpState)}
          />
        </div>
      </header>

      {/* Main body */}
      <div className="app-body">
        <ConfigPanel />
        <main className="app-main">
          <ChatInterface />
        </main>
      </div>
    </div>
  )
}
