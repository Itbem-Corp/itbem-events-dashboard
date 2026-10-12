// @vitest-environment node

import { sectionHiddenByEventConfig } from '@/lib/section-config-visibility'
import type { EventConfig } from '@/models/EventConfig'
import { describe, expect, it } from 'vitest'

const base: EventConfig = {
  id: 'cfg-1',
  event_id: 'event-1',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  is_public: true,
  visibility_configured: true,
}

describe('sectionHiddenByEventConfig (STU-54)', () => {
  it('explains a countdown hidden by show_countdown=false', () => {
    const reason = sectionHiddenByEventConfig('CountdownHeader', { ...base, show_countdown: false })
    expect(reason).toMatchObject({ field: 'show_countdown', switchLabel: 'Cuenta regresiva' })
    expect(reason?.message).toContain('«Cuenta regresiva»')
  })

  it('resolves aliases the same way as the backend kinds', () => {
    expect(sectionHiddenByEventConfig('countdown', { ...base, show_countdown: false })?.field).toBe('show_countdown')
    expect(sectionHiddenByEventConfig('LegacyMap', { ...base, show_event_location: false })?.field).toBe(
      'show_event_location'
    )
    expect(sectionHiddenByEventConfig('GraduatesList', { ...base, show_hosts_section: false })?.field).toBe(
      'show_hosts_section'
    )
    expect(sectionHiddenByEventConfig('HERO', { ...base, show_header: false })?.field).toBe('show_header')
  })

  it('returns null when the switch is on, the type has no switch, or there is no config', () => {
    expect(sectionHiddenByEventConfig('CountdownHeader', { ...base, show_countdown: true })).toBeNull()
    expect(sectionHiddenByEventConfig('TEXT', { ...base, show_countdown: false })).toBeNull()
    expect(sectionHiddenByEventConfig('CountdownHeader', undefined)).toBeNull()
  })

  it('treats a config without visibility flags as all visible (defaults)', () => {
    const { visibility_configured: _ignored, ...unconfigured } = base
    expect(sectionHiddenByEventConfig('CountdownHeader', unconfigured)).toBeNull()
  })

  it('keeps the moment wall section visible while uploads are open', () => {
    expect(
      sectionHiddenByEventConfig('MomentWall', { ...base, show_moment_wall: false, allow_uploads: true })
    ).toBeNull()
    expect(
      sectionHiddenByEventConfig('MomentWall', { ...base, show_moment_wall: false, allow_uploads: false })?.field
    ).toBe('show_moment_wall')
  })
})
