import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore, useMcpStore } from '../store'
import { McpClient, McpClientError } from '../services/mcp-client'

export function useMcpClient() {
  const mcpConfig = useConfigStore((s) => s.config.mcp)
  const { connectionState, tools, error, setConnectionState, setTools, setError } = useMcpStore()
  const clientRef = useRef<McpClient | null>(null)

  const connect = useCallback(async () => {
    // Tear down existing connection
    clientRef.current?.disconnect()
    clientRef.current = null

    setConnectionState('connecting')
    setError(null)

    const client = new McpClient({
      serverUrl: mcpConfig.serverUrl,
      authToken: mcpConfig.authToken || undefined,
      autoReconnect: mcpConfig.autoReconnect,
      onConnect: async () => {
        setConnectionState('connected')
        try {
          const toolList = await client.listTools()
          setTools(toolList)
        } catch (err) {
          setError(`Failed to list tools: ${err instanceof Error ? err.message : String(err)}`)
        }
      },
      onDisconnect: (reason) => {
        setConnectionState(mcpConfig.autoReconnect ? 'connecting' : 'disconnected')
        setError(`Disconnected: ${reason}`)
      },
      onError: (err) => {
        setError(err.message)
      },
    })

    clientRef.current = client

    try {
      await client.connect()
    } catch (err) {
      setConnectionState('error')
      setError(
        err instanceof McpClientError ? err.message : `Connection failed: ${String(err)}`
      )
    }
  }, [mcpConfig, setConnectionState, setTools, setError])

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect()
    clientRef.current = null
    setConnectionState('disconnected')
  }, [setConnectionState])

  const callTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<string> => {
      if (!clientRef.current) throw new McpClientError('Not connected to MCP server')
      return clientRef.current.callTool(name, args)
    },
    []
  )

  const refreshTools = useCallback(async () => {
    if (!clientRef.current) return
    try {
      const toolList = await clientRef.current.listTools()
      setTools(toolList)
    } catch (err) {
      setError(`Failed to refresh tools: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [setTools, setError])

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect()
    }
  }, [])

  return {
    connectionState,
    tools,
    error,
    connect,
    disconnect,
    callTool,
    refreshTools,
  }
}
