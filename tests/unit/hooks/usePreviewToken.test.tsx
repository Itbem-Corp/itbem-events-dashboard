import {
  clearPreviewTokenCache,
  isPreviewTokenFresh,
  previewTokenRefreshDelay,
  readPreviewTokenPayload,
  usePreviewToken,
} from '@/hooks/usePreviewToken'
import { api } from '@/lib/api'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

function previewResponse(token: string, expiresAt?: string) {
  return {
    data: {
      status: 200,
      message: 'Preview token created',
      data: {
        token,
        expires_at: expiresAt,
      },
    },
  }
}

describe('preview token helpers', () => {
  it('reads and trims preview tokens from API envelopes', () => {
    const expiresAt = '2026-08-15T20:30:00Z'

    expect(
      readPreviewTokenPayload({
        status: 200,
        data: { token: ' token-123 ', expires_at: expiresAt },
      })
    ).toEqual({
      token: 'token-123',
      expiresAt: Date.parse(expiresAt),
    })
  })

  it('reads preview token aliases from raw Go responses', () => {
    const expiresAt = '2026-08-15T20:30:00Z'

    expect(
      readPreviewTokenPayload({
        Status: 200,
        Data: { Token: ' token-raw ', ExpiresAt: expiresAt },
      })
    ).toEqual({
      token: 'token-raw',
      expiresAt: Date.parse(expiresAt),
    })
  })

  it('reads preview tokens from useful Data aliases before empty canonical data', () => {
    const expiresAt = '2026-08-15T20:30:00Z'

    expect(
      readPreviewTokenPayload({
        Status: 200,
        Message: 'Preview token created',
        data: {},
        Data: { Token: ' preview-token ', ExpiresAt: expiresAt },
      })
    ).toEqual({
      token: 'preview-token',
      expiresAt: Date.parse(expiresAt),
    })
  })

  it('treats blank tokens as invalid payloads', () => {
    expect(readPreviewTokenPayload({ status: 200, data: { token: ' ' } })).toBeNull()
  })

  it('keeps legacy tokens without expires_at fresh until a refresh is forced', () => {
    expect(isPreviewTokenFresh('token-123', null, 1000)).toBe(true)
    expect(isPreviewTokenFresh('', null, 1000)).toBe(false)
  })

  it('calculates refresh delay before the expiration skew', () => {
    expect(previewTokenRefreshDelay(10_000, 1_000, 2_000)).toBe(7_000)
    expect(previewTokenRefreshDelay(2_000, 1_000, 2_000)).toBe(0)
    expect(previewTokenRefreshDelay(null, 1_000, 2_000)).toBeNull()
  })
})

describe('usePreviewToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearPreviewTokenCache()
  })

  it('deduplicates concurrent token requests and reuses a fresh token', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(
      previewResponse(' token-123 ', new Date(Date.now() + 10 * 60_000).toISOString())
    )

    const { result } = renderHook(() => usePreviewToken('event-1'))

    let tokens: string[] = []
    await act(async () => {
      tokens = await Promise.all([result.current.ensureToken(), result.current.ensureToken()])
    })

    expect(tokens).toEqual(['token-123', 'token-123'])
    expect(api.post).toHaveBeenCalledTimes(1)

    await act(async () => {
      tokens = [await result.current.ensureToken()]
    })

    expect(tokens).toEqual(['token-123'])
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the stored token is close to expiration', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce(previewResponse('token-1', new Date(Date.now() + 10_000).toISOString()))
      .mockResolvedValueOnce(previewResponse('token-2', new Date(Date.now() + 10 * 60_000).toISOString()))

    const { result } = renderHook(() => usePreviewToken('event-1'))

    await act(async () => {
      expect(await result.current.ensureToken()).toBe('token-1')
    })

    await act(async () => {
      expect(await result.current.ensureToken()).toBe('token-2')
    })

    expect(api.post).toHaveBeenCalledTimes(2)
  })

  it('reuses a fresh token after the first hook unmounts', async () => {
    vi.mocked(api.post).mockResolvedValueOnce(
      previewResponse('token-reentry', new Date(Date.now() + 10 * 60_000).toISOString())
    )

    const first = renderHook(() => usePreviewToken('event-reentry'))
    await act(async () => {
      expect(await first.result.current.ensureToken()).toBe('token-reentry')
    })
    first.unmount()

    const second = renderHook(() => usePreviewToken('event-reentry'))
    await act(async () => {
      expect(await second.result.current.ensureToken()).toBe('token-reentry')
    })

    expect(api.post).toHaveBeenCalledTimes(1)
  })
})
