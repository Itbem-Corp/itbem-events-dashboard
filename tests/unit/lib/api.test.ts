import { describe, expect, it } from 'vitest'
import { localSessionRecoveryMessage, normalizeApiResponseData } from '@/lib/api'
import type { MomentSummary } from '@/models/MomentSummary'

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
