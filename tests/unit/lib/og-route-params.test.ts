import { describe, expect, it } from 'vitest'
import {
  formatOgDate,
  formatOgEventType,
  ogLabelsForLanguage,
  readOgRouteParams,
  truncateOgAddress,
} from '@/lib/og-route-params'

describe('readOgRouteParams', () => {
  it('reads canonical params for the dashboard OG endpoint', () => {
    const params = new URLSearchParams({
      title: 'Boda Ana y Luis',
      date: '2026-09-01T19:00:00-06:00',
      timezone: 'America/Mexico_City',
      language: 'es',
      address: 'Jardin Central',
      cover: 'https://cdn.example.com/cover.webp',
      type: 'wedding',
    })

    expect(readOgRouteParams(params, 'https://api.example.com')).toEqual({
      title: 'Boda Ana y Luis',
      date: '2026-09-01T19:00:00-06:00',
      timezone: 'America/Mexico_City',
      language: 'es',
      address: 'Jardin Central',
      cover: 'https://cdn.example.com/cover.webp',
      type: 'wedding',
    })
  })

  it('normalizes event aliases from Cafetton or backend-shaped payloads', () => {
    const params = new URLSearchParams({
      eventName: 'Graduacion Alias',
      eventDateTime: '2026-10-12T18:30:00-06:00',
      eventTimezone: 'America/Chicago',
      eventLanguage: 'en',
      locationName: 'Salon Alias',
      coverImageUrl: 'events/alias/cover.webp',
      eventType: 'graduation',
    })

    expect(readOgRouteParams(params, 'https://api.example.com/api')).toEqual({
      title: 'Graduacion Alias',
      date: '2026-10-12T18:30:00-06:00',
      timezone: 'America/Chicago',
      language: 'en',
      address: 'Salon Alias',
      cover: 'https://api.example.com/storage/events/alias/cover.webp',
      type: 'graduation',
    })
  })

  it('uses secondary address aliases when the primary address is absent', () => {
    const params = new URLSearchParams({
      title: 'Recepcion secundaria',
      secondAddress: 'Terraza Central',
    })

    expect(readOgRouteParams(params, 'https://api.example.com')).toMatchObject({
      title: 'Recepcion secundaria',
      address: 'Terraza Central',
    })
  })

  it('prefers cover view aliases over raw cover image keys', () => {
    const params = new URLSearchParams({
      cover_image_url: 'events/event-1/cover.webp',
      cover_view_url: 'https://signed.example.com/cover.webp',
    })

    expect(readOgRouteParams(params, 'https://api.example.com')).toMatchObject({
      cover: 'https://signed.example.com/cover.webp',
    })
  })

  it('accepts Pascal cover URL query aliases', () => {
    const params = new URLSearchParams({
      CoverImageUrl: 'events/event-1/cover.webp',
      CoverViewUrl: 'https://signed.example.com/pascal-cover.webp',
    })

    expect(readOgRouteParams(params, 'https://api.example.com')).toMatchObject({
      cover: 'https://signed.example.com/pascal-cover.webp',
    })
  })

  it('falls back to a neutral event title and ignores blank params', () => {
    const params = new URLSearchParams({
      title: '   ',
      coverImageUrl: '   ',
    })

    expect(readOgRouteParams(params, 'https://api.example.com')).toEqual({
      title: 'Evento',
      date: '',
      timezone: '',
      language: '',
      address: '',
      cover: '',
      type: '',
    })
  })
})

describe('formatOgDate', () => {
  it('formats dates in the event timezone instead of the runtime timezone', () => {
    expect(formatOgDate('2026-08-16T04:30:00Z', 'America/Mexico_City')).toContain(
      '15 de agosto de 2026'
    )
    expect(formatOgDate('2026-08-16T04:30:00Z', 'UTC')).toContain('16 de agosto de 2026')
  })

  it('formats dates with the event language locale when provided', () => {
    expect(formatOgDate('2026-08-16T04:30:00Z', 'America/Mexico_City', 'en')).toContain(
      'August 15, 2026'
    )
  })

  it('keeps invalid date text as a safe fallback', () => {
    expect(formatOgDate('por confirmar')).toBe('por confirmar')
  })
})

describe('ogLabelsForLanguage', () => {
  it('localizes dashboard OG labels from the event language', () => {
    expect(ogLabelsForLanguage('en')).toEqual({ date: 'Date', place: 'Place' })
    expect(ogLabelsForLanguage('es-MX')).toEqual({ date: 'Fecha', place: 'Lugar' })
    expect(ogLabelsForLanguage('')).toEqual({ date: 'Fecha', place: 'Lugar' })
  })
})

describe('formatOgEventType', () => {
  it('uses dashboard event-type labels for backend catalog values', () => {
    expect(formatOgEventType('wedding')).toBe('Boda')
    expect(formatOgEventType(' graduation ')).toBe('Graduación')
    expect(formatOgEventType('')).toBe('')
  })
})

describe('truncateOgAddress', () => {
  it('limits long addresses for the generated image', () => {
    expect(truncateOgAddress('Avenida Principal 123, Colonia Centro, Ciudad')).toBe(
      'Avenida Principal 123, Colonia Centro, C...',
    )
  })
})
