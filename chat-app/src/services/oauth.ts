/**
 * OAuth 2.0 service
 *
 * Supports client_credentials, authorization_code, and password grant types
 * against any RFC 6749 compliant token endpoint (e.g. an API gateway).
 *
 * Secrets are never stored in localStorage — they live only in memory via
 * the auth Zustand store.
 */

import type { OAuthConfig, OAuthToken } from '../types'

export class OAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

/** Exchange credentials for an access token */
export async function fetchToken(config: OAuthConfig): Promise<OAuthToken> {
  if (!config.tokenUrl) throw new OAuthError('Token URL is required')
  if (!config.clientId) throw new OAuthError('Client ID is required')

  const params = new URLSearchParams()
  params.set('grant_type', config.grantType)
  params.set('client_id', config.clientId)

  if (config.clientSecret) {
    params.set('client_secret', config.clientSecret)
  }
  if (config.scope) {
    params.set('scope', config.scope)
  }

  switch (config.grantType) {
    case 'authorization_code':
      // For auth code flow the caller should already have the code; we just
      // need redirect_uri to accompany it.
      if (config.redirectUri) params.set('redirect_uri', config.redirectUri)
      break
    case 'password':
      if (!config.username) throw new OAuthError('Username is required for password grant')
      if (!config.password) throw new OAuthError('Password is required for password grant')
      params.set('username', config.username)
      params.set('password', config.password)
      break
    case 'client_credentials':
      // Nothing extra beyond what's already set
      break
  }

  // Merge any extra body params
  if (config.extraParams) {
    for (const [k, v] of Object.entries(config.extraParams)) {
      if (v) params.set(k, v)
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    ...config.extraHeaders,
  }

  let response: Response
  try {
    response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
    })
  } catch (err) {
    throw new OAuthError(
      `Network error fetching token: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  let json: unknown
  const text = await response.text()
  try {
    json = JSON.parse(text)
  } catch {
    throw new OAuthError(
      `Non-JSON response from token endpoint (${response.status}): ${text.slice(0, 200)}`,
      response.status
    )
  }

  if (!response.ok) {
    const body = json as Record<string, unknown>
    const errMsg =
      typeof body?.error_description === 'string'
        ? body.error_description
        : typeof body?.error === 'string'
        ? body.error
        : `HTTP ${response.status}`
    throw new OAuthError(errMsg, response.status, json)
  }

  const body = json as Record<string, unknown>

  if (typeof body.access_token !== 'string') {
    throw new OAuthError('Token endpoint did not return access_token', response.status, json)
  }

  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null
  const expiresAt = expiresIn !== null ? Date.now() + expiresIn * 1000 : null

  return {
    accessToken: body.access_token,
    tokenType: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    expiresAt,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    scope: typeof body.scope === 'string' ? body.scope : undefined,
  }
}

/** Use a refresh token to get a new access token */
export async function refreshToken(
  config: OAuthConfig,
  currentToken: OAuthToken
): Promise<OAuthToken> {
  if (!currentToken.refreshToken) {
    throw new OAuthError('No refresh token available')
  }

  const params = new URLSearchParams()
  params.set('grant_type', 'refresh_token')
  params.set('refresh_token', currentToken.refreshToken)
  params.set('client_id', config.clientId)
  if (config.clientSecret) params.set('client_secret', config.clientSecret)
  if (config.scope) params.set('scope', config.scope)
  if (config.extraParams) {
    for (const [k, v] of Object.entries(config.extraParams)) {
      if (v) params.set(k, v)
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    ...config.extraHeaders,
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString(),
  })

  const text = await response.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new OAuthError(`Non-JSON refresh response (${response.status})`, response.status)
  }

  if (!response.ok) {
    const body = json as Record<string, unknown>
    throw new OAuthError(
      typeof body.error_description === 'string' ? body.error_description : `HTTP ${response.status}`,
      response.status,
      json
    )
  }

  const body = json as Record<string, unknown>
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null

  return {
    accessToken: body.access_token as string,
    tokenType: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    expiresAt: expiresIn !== null ? Date.now() + expiresIn * 1000 : null,
    refreshToken:
      typeof body.refresh_token === 'string'
        ? body.refresh_token
        : currentToken.refreshToken,
    scope: typeof body.scope === 'string' ? body.scope : currentToken.scope,
  }
}

/** Build the Authorization Code redirect URL */
export function buildAuthorizationUrl(
  authorizationEndpoint: string,
  config: OAuthConfig,
  state: string
): string {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  if (config.redirectUri) url.searchParams.set('redirect_uri', config.redirectUri)
  if (config.scope) url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)
  return url.toString()
}

/** Exchange an authorization code (returned from redirect) for tokens */
export async function exchangeCode(
  config: OAuthConfig,
  code: string
): Promise<OAuthToken> {
  const params = new URLSearchParams()
  params.set('grant_type', 'authorization_code')
  params.set('code', code)
  params.set('client_id', config.clientId)
  if (config.clientSecret) params.set('client_secret', config.clientSecret)
  if (config.redirectUri) params.set('redirect_uri', config.redirectUri)

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    ...config.extraHeaders,
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString(),
  })

  const text = await response.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new OAuthError(`Non-JSON code exchange response (${response.status})`, response.status)
  }

  if (!response.ok) {
    const body = json as Record<string, unknown>
    throw new OAuthError(
      typeof body.error_description === 'string' ? body.error_description : `HTTP ${response.status}`,
      response.status,
      json
    )
  }

  const body = json as Record<string, unknown>
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null

  return {
    accessToken: body.access_token as string,
    tokenType: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    expiresAt: expiresIn !== null ? Date.now() + expiresIn * 1000 : null,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    scope: typeof body.scope === 'string' ? body.scope : undefined,
  }
}

export function formatTokenExpiry(token: OAuthToken): string {
  if (token.expiresAt === null) return 'never expires'
  const diff = token.expiresAt - Date.now()
  if (diff <= 0) return 'expired'
  const minutes = Math.floor(diff / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)
  if (minutes > 0) return `expires in ${minutes}m ${seconds}s`
  return `expires in ${seconds}s`
}
