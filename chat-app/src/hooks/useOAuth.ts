import { useCallback } from 'react'
import { useConfigStore, useAuthStore } from '../store'
import { fetchToken, refreshToken, OAuthError } from '../services/oauth'

export function useOAuth() {
  const config = useConfigStore((s) => s.config.oauth)
  const { token, isLoading, error, setToken, setLoading, setError, clearToken, isTokenValid } =
    useAuthStore()

  const login = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const t = await fetchToken(config)
      setToken(t)
    } catch (err) {
      setError(err instanceof OAuthError ? err.message : String(err))
    }
  }, [config, setToken, setLoading, setError])

  const refresh = useCallback(async () => {
    if (!token?.refreshToken) return login()
    setLoading(true)
    try {
      const t = await refreshToken(config, token)
      setToken(t)
    } catch {
      // Refresh failed — fall back to full login
      return login()
    }
  }, [token, config, login, setToken, setLoading])

  const logout = useCallback(() => {
    clearToken()
  }, [clearToken])

  /** Returns a valid token, refreshing/re-fetching if needed */
  const getValidToken = useCallback(async () => {
    if (isTokenValid()) return token!
    if (token?.refreshToken) {
      await refresh()
    } else {
      await login()
    }
    return useAuthStore.getState().token
  }, [isTokenValid, token, refresh, login])

  return { token, isLoading, error, isTokenValid, login, refresh, logout, getValidToken }
}
