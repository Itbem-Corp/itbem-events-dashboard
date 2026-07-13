import { hasAnyEventConfigVisibilityFlag, withEventConfigVisibilityDefaults } from '@/lib/event-config-visibility'
import type { EventConfig } from '@/models/EventConfig'
import { describe, expect, it } from 'vitest'

function config(patch: Partial<EventConfig> = {}): EventConfig {
  return {
    id: 'event-1',
    event_id: 'event-1',
    created_at: '2026-07-05T00:00:00.000Z',
    updated_at: '2026-07-05T00:00:00.000Z',
    is_public: true,
    ...patch,
  }
}

describe('event config visibility defaults', () => {
  it('detects canonical and legacy visibility flags', () => {
    expect(hasAnyEventConfigVisibilityFlag(config())).toBe(false)
    expect(hasAnyEventConfigVisibilityFlag(config({ show_header: true }))).toBe(true)
    expect(hasAnyEventConfigVisibilityFlag(config({ show_header: false }))).toBe(false)
    expect(hasAnyEventConfigVisibilityFlag(config({ visibility_configured: true, show_header: false }))).toBe(true)
    expect(hasAnyEventConfigVisibilityFlag(config({ show_wall: true }))).toBe(true)
  })

  it('normalizes legacy configs without visibility fields to dashboard defaults', () => {
    expect(withEventConfigVisibilityDefaults(config())).toMatchObject({
      show_countdown: true,
      show_rsvp_section: true,
      show_event_location: true,
      show_second_location: true,
      show_hosts_section: true,
      show_photo_gallery: true,
      show_moment_wall: true,
      show_contact_section: true,
      show_header: true,
      show_footer: true,
      show_event_schedule: true,
    })
  })

  it('normalizes backend-marked legacy all-false configs to dashboard defaults', () => {
    expect(
      withEventConfigVisibilityDefaults(
        config({
          visibility_configured: false,
          show_countdown: false,
          show_rsvp_section: false,
          show_event_location: false,
          show_second_location: false,
          show_hosts_section: false,
          show_photo_gallery: false,
          show_moment_wall: false,
          show_contact_section: false,
          show_header: false,
          show_footer: false,
          show_event_schedule: false,
        })
      )
    ).toMatchObject({
      show_countdown: true,
      show_rsvp_section: true,
      show_event_location: true,
      show_second_location: true,
      show_hosts_section: true,
      show_photo_gallery: true,
      show_moment_wall: true,
      show_contact_section: true,
      show_header: true,
      show_footer: true,
      show_event_schedule: true,
    })
  })

  it('preserves explicitly configured all-false visibility', () => {
    const explicit = config({
      visibility_configured: true,
      show_countdown: false,
      show_rsvp_section: false,
      show_event_location: false,
      show_second_location: false,
      show_hosts_section: false,
      show_photo_gallery: false,
      show_moment_wall: false,
      show_contact_section: false,
      show_header: false,
      show_footer: false,
      show_event_schedule: false,
    })

    expect(withEventConfigVisibilityDefaults(explicit)).toBe(explicit)
  })

  it('keeps legacy upload windows unpublished while restoring surrounding sections', () => {
    expect(withEventConfigVisibilityDefaults(config({ allow_uploads: true }))).toMatchObject({
      allow_uploads: true,
      show_header: true,
      show_footer: true,
      show_countdown: true,
      show_moment_wall: false,
    })
  })

  it('keeps public moment-wall aliases unpublished while restoring surrounding sections', () => {
    expect(withEventConfigVisibilityDefaults(config({ moments_wall_published: false }))).toMatchObject({
      show_header: true,
      show_footer: true,
      show_countdown: true,
      show_moment_wall: false,
    })

    expect(withEventConfigVisibilityDefaults(config({ showMomentWall: false }))).toMatchObject({
      show_header: true,
      show_footer: true,
      show_countdown: true,
      show_moment_wall: false,
    })

    expect(withEventConfigVisibilityDefaults(config({ showWall: false }))).toMatchObject({
      show_header: true,
      show_footer: true,
      show_countdown: true,
      show_moment_wall: false,
    })
  })

  it('leaves explicit visibility settings untouched', () => {
    const explicit = config({ show_header: true, show_footer: false, show_moment_wall: false })

    expect(withEventConfigVisibilityDefaults(explicit)).toBe(explicit)
  })
})
