import type { EventConfig } from '@/models/EventConfig'

const VISIBILITY_FIELDS = [
  'show_countdown',
  'show_rsvp_section',
  'show_rsvp',
  'show_event_location',
  'show_location',
  'show_second_location',
  'show_hosts_section',
  'show_photo_gallery',
  'show_gallery',
  'show_moment_wall',
  'show_wall',
  'show_contact_section',
  'show_contact',
  'show_header',
  'show_footer',
  'show_event_schedule',
  'show_schedule',
] as const

function hasTrueVisibilityFlag(config: EventConfig): boolean {
  return VISIBILITY_FIELDS.some((field) => config[field] === true)
}

function hasPublicMomentWallAlias(config: EventConfig): boolean {
  return (
    config.moments_wall_published !== undefined ||
    config.momentsWallPublished !== undefined ||
    config.showMomentWall !== undefined ||
    config.show_wall !== undefined ||
    config.showWall !== undefined
  )
}

function publicMomentWallPublished(config: EventConfig): boolean {
  return (
    config.moments_wall_published ??
    config.momentsWallPublished ??
    config.showMomentWall ??
    config.show_wall ??
    config.showWall ??
    true
  )
}

export function hasAnyEventConfigVisibilityFlag(config: EventConfig | undefined): boolean {
  if (!config) return false
  if (config.visibility_configured === true) return true
  return hasTrueVisibilityFlag(config)
}

export function withEventConfigVisibilityDefaults(config: EventConfig | undefined): EventConfig | undefined {
  if (!config || hasAnyEventConfigVisibilityFlag(config)) return config

  return {
    ...config,
    show_countdown: true,
    show_rsvp_section: true,
    show_event_location: true,
    show_second_location: true,
    show_hosts_section: true,
    show_photo_gallery: true,
    show_moment_wall: hasPublicMomentWallAlias(config) ? publicMomentWallPublished(config) : !(config.allow_uploads ?? false),
    show_contact_section: true,
    show_header: true,
    show_footer: true,
    show_event_schedule: true,
  }
}
