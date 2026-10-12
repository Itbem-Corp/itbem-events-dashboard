import { describe, expect, it } from 'vitest'

import { EVENT_TIMEZONES, eventTimezoneOptions, isLocalDateTimeInPast } from '@/lib/event-timezones'

// EVT-20: America/Mazatlan was missing and Tijuana was labelled "Pacífico".
describe('event time zones', () => {
  it('offers every Mexican zone with its official name and offset', () => {
    const label = (value: string) => EVENT_TIMEZONES.find((tz) => tz.value === value)?.label
    expect(label('America/Mazatlan')).toMatch(/Pacífico.*Mazatlán.*UTC-7/)
    expect(label('America/Tijuana')).toMatch(/Noroeste.*Tijuana.*UTC-8/)
    expect(label('America/Tijuana')).not.toMatch(/Pacífico/)
    expect(label('America/Cancun')).toMatch(/Sureste.*UTC-5/)
    expect(label('America/Mexico_City')).toMatch(/Centro.*UTC-6/)
    expect(label('America/Monterrey')).toMatch(/Centro.*UTC-6/)
    expect(label('America/Hermosillo')).toMatch(/Sonora.*UTC-7/)
  })

  it('only lists zones the runtime recognises', () => {
    for (const tz of EVENT_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('es-MX', { timeZone: tz.value })).not.toThrow()
    }
  })

  it('keeps a stored zone outside the list instead of swapping it', () => {
    expect(eventTimezoneOptions('Europe/Madrid')[0]).toEqual({ value: 'Europe/Madrid', label: 'Europe/Madrid' })
    expect(eventTimezoneOptions('America/Mazatlan')).toHaveLength(EVENT_TIMEZONES.length)
    expect(eventTimezoneOptions(undefined)).toHaveLength(EVENT_TIMEZONES.length)
  })

  // EVT-26: creating an event in the past gave no notice.
  it('detects a local date already in the past in the event zone', () => {
    const now = new Date('2026-10-12T18:00:00Z') // 12:00 in CDMX, 11:00 in Mazatlán
    expect(isLocalDateTimeInPast('2026-10-12T11:30', 'America/Mexico_City', now)).toBe(true)
    expect(isLocalDateTimeInPast('2026-10-12T11:30', 'America/Mazatlan', now)).toBe(false)
    expect(isLocalDateTimeInPast('', 'America/Mexico_City', now)).toBe(false)
  })
})
