import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventPreviewTokenPath } from '@/lib/api-paths'
import type { PreviewTokenResponse } from '@/models/Event'

export const PREVIEW_TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000
export const PREVIEW_TOKEN_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_CACHED_PREVIEW_TOKENS = 20

export interface PreviewTokenState {
  token: string
  expiresAt: number | null
}

type CachedPreviewTokenState = PreviewTokenState & { cachedAt: number }

const previewTokenCache = new Map<string, CachedPreviewTokenState>()
const previewTokenRequests = new Map<string, Promise<PreviewTokenState>>()

function previewTokenCacheKey(eventId: string | number) {
  return String(eventId)
}

function readCachedPreviewToken(eventId: string | number | null | undefined): PreviewTokenState | null {
  if (eventId === null || eventId === undefined || eventId === '') return null
  const key = previewTokenCacheKey(eventId)
  const cached = previewTokenCache.get(key)
  if (!cached) return null
  const legacyFresh = cached.expiresAt === null && Date.now() - cached.cachedAt < PREVIEW_TOKEN_CACHE_TTL_MS
  if (!legacyFresh && !isPreviewTokenFresh(cached.token, cached.expiresAt)) {
    previewTokenCache.delete(key)
    return null
  }
  previewTokenCache.delete(key)
  previewTokenCache.set(key, cached)
  return { token: cached.token, expiresAt: cached.expiresAt }
}

function cachePreviewToken(eventId: string | number, state: PreviewTokenState) {
  const key = previewTokenCacheKey(eventId)
  previewTokenCache.delete(key)
  previewTokenCache.set(key, { ...state, cachedAt: Date.now() })
  while (previewTokenCache.size > MAX_CACHED_PREVIEW_TOKENS) {
    const oldest = previewTokenCache.keys().next().value
    if (oldest === undefined) break
    previewTokenCache.delete(oldest)
  }
}

async function requestPreviewToken(eventId: string | number, fallbackMessage: string) {
  const key = previewTokenCacheKey(eventId)
  const existing = previewTokenRequests.get(key)
  if (existing) return existing

  const request = api.post(eventPreviewTokenPath(eventId)).then((res) => {
    const parsed = readPreviewTokenPayload(res.data)
    if (!parsed) throw new Error(fallbackMessage)
    cachePreviewToken(eventId, parsed)
    return parsed
  })
  previewTokenRequests.set(key, request)
  try {
    return await request
  } finally {
    if (previewTokenRequests.get(key) === request) previewTokenRequests.delete(key)
  }
}

export function clearPreviewTokenCache() {
  previewTokenCache.clear()
  previewTokenRequests.clear()
}

export function previewTokenExpiresAtMillis(expiresAt?: string | null): number | null {
  if (!expiresAt) return null
  const ms = Date.parse(expiresAt)
  return Number.isFinite(ms) ? ms : null
}

export function readPreviewTokenPayload(payload: unknown): PreviewTokenState | null {
  const data = readApiData<
    | (PreviewTokenResponse & {
        Token?: string | null
        expiresAt?: string | null
        ExpiresAt?: string | null
      })
    | null
  >(payload)
  const token = (data?.token ?? data?.Token)?.trim()
  if (!token) return null
  return {
    token,
    expiresAt: previewTokenExpiresAtMillis(data?.expires_at ?? data?.expiresAt ?? data?.ExpiresAt),
  }
}

export function isPreviewTokenFresh(
  token: string,
  expiresAt: number | null,
  now = Date.now(),
  skewMs = PREVIEW_TOKEN_REFRESH_SKEW_MS
): boolean {
  if (!token.trim()) return false
  if (!expiresAt) return true
  return now + skewMs < expiresAt
}

export function previewTokenRefreshDelay(
  expiresAt: number | null,
  now = Date.now(),
  skewMs = PREVIEW_TOKEN_REFRESH_SKEW_MS
): number | null {
  if (!expiresAt) return null
  return Math.max(0, expiresAt - now - skewMs)
}

interface UsePreviewTokenOptions {
  autoLoad?: boolean
  autoRefresh?: boolean
  fallbackMessage?: string
}

export function usePreviewToken(
  eventId: string | number | null | undefined,
  {
    autoLoad = false,
    autoRefresh = false,
    fallbackMessage = 'No se pudo generar el preview',
  }: UsePreviewTokenOptions = {}
) {
  const initialState = useRef(readCachedPreviewToken(eventId))
  const [token, setToken] = useState(initialState.current?.token ?? '')
  const [expiresAt, setExpiresAt] = useState<number | null>(initialState.current?.expiresAt ?? null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const inFlightRef = useRef<Promise<string> | null>(null)

  const reset = useCallback(() => {
    inFlightRef.current = null
    if (eventId !== null && eventId !== undefined && eventId !== '') {
      previewTokenCache.delete(previewTokenCacheKey(eventId))
    }
    setToken('')
    setExpiresAt(null)
    setError('')
    setIsLoading(false)
  }, [eventId])

  const refreshToken = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current

    if (!eventId) {
      reset()
      throw new Error(fallbackMessage)
    }

    const request = (async () => {
      setIsLoading(true)
      const cached = readCachedPreviewToken(eventId)
      const parsed = cached ?? (await requestPreviewToken(eventId, fallbackMessage))
      setToken(parsed.token)
      setExpiresAt(parsed.expiresAt)
      setError('')
      return parsed.token
    })()

    inFlightRef.current = request
    try {
      return await request
    } catch (err) {
      const message = getApiErrorMessage(err, fallbackMessage)
      setToken('')
      setExpiresAt(null)
      setError(message)
      throw new Error(message)
    } finally {
      if (inFlightRef.current === request) {
        inFlightRef.current = null
        setIsLoading(false)
      }
    }
  }, [eventId, fallbackMessage, reset])

  const ensureToken = useCallback(async () => {
    if (isPreviewTokenFresh(token, expiresAt)) {
      setError('')
      return token
    }
    return refreshToken()
  }, [expiresAt, refreshToken, token])

  useEffect(() => {
    inFlightRef.current = null
    const cached = readCachedPreviewToken(eventId)
    setToken(cached?.token ?? '')
    setExpiresAt(cached?.expiresAt ?? null)
    setError('')
    setIsLoading(false)
  }, [eventId])

  useEffect(() => {
    if (!eventId || !autoLoad) return
    void refreshToken().catch(() => undefined)
  }, [autoLoad, eventId, refreshToken])

  useEffect(() => {
    if (!eventId || !autoRefresh) return
    const delay = previewTokenRefreshDelay(expiresAt)
    if (delay === null) return
    const timer = setTimeout(() => {
      void refreshToken().catch(() => undefined)
    }, delay)
    return () => clearTimeout(timer)
  }, [autoRefresh, eventId, expiresAt, refreshToken])

  return {
    token,
    expiresAt,
    error,
    isLoading,
    refreshToken,
    ensureToken,
    reset,
  }
}
