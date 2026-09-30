// @vitest-environment node

import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, localSessionRecoveryMessage, normalizeApiResponseData } from '@/lib/api'
import { releaseMutationKey, reserveMutationKey } from '@/lib/idempotency-key'
import type { MomentSummary } from '@/models/MomentSummary'
import { useStore } from '@/store/useStore'
import type { InternalAxiosRequestConfig } from 'axios'

describe('normalizeApiResponseData', () => {
  it('unwraps backend envelopes after normalizing Go response keys', () => {
    const payload = {
      Status: 201,
      Message: 'created',
      Data: {
        ID: 'event-1',
        CoverImageURL: 'events/event-1/cover.webp',
      },
    }

    expect(normalizeApiResponseData(payload)).toEqual({
      id: 'event-1',
      cover_image_url: 'events/event-1/cover.webp',
    })
  })

  it('unwraps useful envelope aliases before normalizing duplicate data keys', () => {
    const payload = {
      Status: 200,
      Message: 'ok',
      Data: {
        ID: 'event-1',
        CoverImageURL: 'events/event-1/cover.webp',
      },
      data: [],
    }

    expect(normalizeApiResponseData(payload)).toEqual({
      id: 'event-1',
      cover_image_url: 'events/event-1/cover.webp',
    })
  })

  it('keeps direct paginated payloads while normalizing their keys', () => {
    const payload = {
      Data: [{ ID: 'moment-1' }],
      TotalCount: 1,
    }

    expect(normalizeApiResponseData(payload)).toEqual({
      data: [{ id: 'moment-1' }],
      total_count: 1,
    })
  })

  it('unwraps moment summary envelopes for dashboard consumers', () => {
    const payload = {
      Status: 200,
      Message: 'Moment summaries loaded',
      Data: [
        {
          EventID: 'event-1',
          PendingCount: 2,
        },
      ],
    }

    expect(normalizeApiResponseData(payload)).toEqual([
      {
        event_id: 'event-1',
        pending_count: 2,
      } satisfies MomentSummary,
    ])
  })

  it('does not transform binary responses', () => {
    const payload = { Status: 200, Data: { ID: 'file-1' } }

    expect(normalizeApiResponseData(payload, 'blob')).toBe(payload)
  })
})

describe('localSessionRecoveryMessage', () => {
  it.each([
    [401, 'No se pudo validar tu sesión local. Inicia sesión de nuevo.'],
    [403, 'No se pudo validar tu sesión local. Inicia sesión de nuevo.'],
    [503, 'La sesión local todavía se está preparando. Actualiza en unos segundos.'],
  ])('explains local session status %s', (status, expected) => {
    expect(localSessionRecoveryMessage({ status })).toBe(expected)
  })

  it('leaves transport failures to the API connectivity recovery', () => {
    expect(localSessionRecoveryMessage(new Error('network failed'))).toBeNull()
  })
})

describe('API idempotency fingerprint integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the platform Web Crypto digest for retained mutation signatures', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const reservation = await reserveMutationKey('post', '/api/digest-check', { value: 'digest-canary' }, 1_000)
    const input = new TextEncoder().encode('post\u0000/api/digest-check\u0000{"value":"digest-canary"}')
    const expected = await webcrypto.subtle.digest('SHA-256', input)
    const expectedHex = Array.from(new Uint8Array(expected), (byte) => byte.toString(16).padStart(2, '0')).join('')

    expect(reservation.signature).toBe(`v1:${expectedHex}`)
    releaseMutationKey(reservation.signature)
  })

  it('reuses the original idempotency header when retrying after auth refresh', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const previousToken = useStore.getState().token
    useStore.getState().setToken('stale-token-for-test')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ token: 'fresh-token-for-test' }) })))

    const observedKeys: string[] = []
    let attempt = 0
    const adapter = async (config: InternalAxiosRequestConfig) => {
      observedKeys.push(String(config.headers.get('Idempotency-Key') ?? ''))
      if (attempt++ === 0) {
        const response = { config, data: { message: 'expired' }, headers: {}, status: 401, statusText: 'Unauthorized' }
        return Promise.reject({ config, response })
      }
      return { config, data: { ok: true }, headers: {}, status: 200, statusText: 'OK' }
    }

    try {
      const response = await api.post('/idempotency-retry-test', { value: 'non-sensitive' }, { adapter })
      expect(response.data).toEqual({ ok: true })
      expect(observedKeys).toHaveLength(2)
      expect(observedKeys[0]).toBeTruthy()
      expect(observedKeys[1]).toBe(observedKeys[0])
    } finally {
      useStore.getState().setToken(previousToken)
    }
  })
})
