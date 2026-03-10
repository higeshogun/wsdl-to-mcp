import type { McpConnectionState } from '../types'

interface Props {
  label: string
  state: 'ok' | 'warn' | 'err' | 'off'
  detail?: string
}

function StatusDot({ state }: { state: Props['state'] }) {
  const colors: Record<Props['state'], string> = {
    ok: '#22c55e',
    warn: '#f59e0b',
    err: '#ef4444',
    off: '#6b7280',
  }
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: colors[state],
        flexShrink: 0,
      }}
    />
  )
}

export function ConnectionBadge({ label, state, detail }: Props) {
  return (
    <span
      className="connection-badge"
      title={detail}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
    >
      <StatusDot state={state} />
      {label}
    </span>
  )
}

export function mcpStateToStatus(state: McpConnectionState): Props['state'] {
  switch (state) {
    case 'connected': return 'ok'
    case 'connecting': return 'warn'
    case 'error': return 'err'
    case 'disconnected': return 'off'
  }
}
