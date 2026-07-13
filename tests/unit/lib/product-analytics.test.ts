import { describe, expect, it } from 'vitest'

import { buildProductAnalyticsProperties } from '@/lib/product-analytics'

describe('buildProductAnalyticsProperties', () => {
  it('adds the common schema and accepts only the event-specific contract', () => {
    expect(
      buildProductAnalyticsProperties('design_saved', {
        template_kind: 'editorial-romance',
        palette_override: true,
        font_override: false,
      })
    ).toEqual({
      schema_version: 1,
      surface: 'dashboard',
      template_kind: 'editorial-romance',
      palette_override: true,
      font_override: false,
    })
  })

  it('drops extra PII-like and identifier fields at the runtime boundary', () => {
    const unsafe = {
      channel: 'whatsapp',
      token: 'secret',
      event_id: 'event-1',
      guest: 'Ana',
      url: 'https://example.test',
    }

    expect(
      buildProductAnalyticsProperties(
        'invitation_handoff',
        unsafe as unknown as { channel: 'whatsapp' }
      )
    ).toEqual({ schema_version: 1, surface: 'dashboard', channel: 'whatsapp' })
  })

  it('rejects unrecognized enum values from untyped callers', () => {
    expect(
      buildProductAnalyticsProperties(
        'checkin_completed',
        { method: 'face-recognition' } as unknown as { method: 'manual' }
      )
    ).toEqual({ schema_version: 1, surface: 'dashboard' })
  })
})
