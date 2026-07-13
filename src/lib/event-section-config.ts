import { canonicalSectionType } from '@/lib/section-type-aliases'
import type { EventSection } from '@/models/EventSection'

type SectionConfigAliasSource = Partial<Pick<EventSection, 'config' | 'content_json'>> & {
  Config?: unknown
  contentJson?: unknown
  ContentJSON?: unknown
  ContentJson?: unknown
  component_type?: unknown
  componentType?: unknown
  ComponentType?: unknown
  type?: unknown
  Type?: unknown
}

type SectionConfigSource = SectionConfigAliasSource | null | undefined

function firstValue(source: SectionConfigAliasSource, keys: string[]): unknown {
  let blankString: string | undefined

  for (const key of keys) {
    const value = source[key as keyof SectionConfigAliasSource]
    if (!(key in source) || value === undefined || value === null) continue
    if (typeof value === 'string' && !value.trim()) {
      blankString ??= value
      continue
    }
    return value
  }

  return blankString
}

function asConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return {}
    try {
      return asConfigObject(JSON.parse(trimmed))
    } catch {
      return {}
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function firstStringValue(source: SectionConfigAliasSource, keys: string[]): string {
  for (const key of keys) {
    const value = source[key as keyof SectionConfigAliasSource]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function firstConfigValue(config: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = config[key]
    if (hasConfigValue(value)) return value
  }
  return undefined
}

function hasConfigValue(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')
}

function setCanonicalAlias(config: Record<string, unknown>, key: string, aliases: string[]) {
  if (hasConfigValue(config[key])) return
  const value = firstConfigValue(config, aliases)
  if (value !== undefined) config[key] = value
}

function normalizeAgendaItems(value: unknown): unknown {
  if (!Array.isArray(value)) return value

  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const next = { ...(item as Record<string, unknown>) }
    setCanonicalAlias(next, 'time', ['Time', 'start_time', 'startTime', 'StartTime'])
    setCanonicalAlias(next, 'title', ['Title', 'name', 'Name'])
    setCanonicalAlias(next, 'description', ['Description', 'content', 'Content'])
    setCanonicalAlias(next, 'icon', ['Icon'])
    setCanonicalAlias(next, 'location', ['Location', 'venue', 'Venue'])
    return next
  })
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return true
    if (value === 0) return false
  }
  return undefined
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function normalizeMomentWallRuntimeState(config: Record<string, unknown>) {
  const momentsWallPublished = optionalBoolean(config.moments_wall_published) ?? optionalBoolean(config.published)
  let allowUploads = optionalBoolean(config.allow_uploads)
  let shareUploadsEnabled = optionalBoolean(config.share_uploads_enabled)

  if (shareUploadsEnabled === true && allowUploads === undefined && momentsWallPublished !== true) {
    allowUploads = true
  }
  if (momentsWallPublished === true) {
    allowUploads = false
    shareUploadsEnabled = false
  }
  if (allowUploads === false) {
    shareUploadsEnabled = false
  }

  if (momentsWallPublished !== undefined) {
    config.moments_wall_published = momentsWallPublished
    config.show_moment_wall = momentsWallPublished
  }
  if (allowUploads !== undefined) config.allow_uploads = allowUploads
  if (shareUploadsEnabled !== undefined) config.share_uploads_enabled = shareUploadsEnabled

  const maxUploadsPerGuest = optionalNumber(config.max_uploads_per_guest)
  if (maxUploadsPerGuest !== undefined) {
    config.max_uploads_per_guest = Math.max(0, Math.trunc(maxUploadsPerGuest))
  }
}

function normalizeSectionConfigAliases(config: Record<string, unknown>, sectionType: string): Record<string, unknown> {
  const next = { ...config }
  const kind = canonicalSectionType(sectionType)

  setCanonicalAlias(next, 'title', ['Title'])
  setCanonicalAlias(next, 'subtitle', ['Subtitle'])
  setCanonicalAlias(next, 'content', ['Content', 'body', 'Body'])
  setCanonicalAlias(next, 'imageUrl', ['imageURL', 'image_url', 'ImageURL', 'ImageUrl'])
  setCanonicalAlias(next, 'musicUrl', ['musicURL', 'music_url', 'MusicURL', 'MusicUrl'])
  setCanonicalAlias(next, 'audioUrl', ['audioURL', 'audio_url', 'AudioURL', 'AudioUrl'])

  switch (kind) {
    case 'CountdownHeader':
      setCanonicalAlias(next, 'heading', ['Heading'])
      setCanonicalAlias(next, 'targetDate', [
        'target_date',
        'TargetDate',
        'eventDateTime',
        'event_date_time',
        'EventDateTime',
      ])
      break

    case 'EventVenue':
      setCanonicalAlias(next, 'text', ['Text', 'description', 'Description', 'content', 'Content', 'body', 'Body'])
      setCanonicalAlias(next, 'date', ['Date', 'eventDate', 'event_date', 'EventDate'])
      setCanonicalAlias(next, 'venueText', ['venue_text', 'VenueText', 'venue', 'Venue', 'location', 'Location'])
      setCanonicalAlias(next, 'mapUrl', [
        'mapURL',
        'map_url',
        'MapURL',
        'MapUrl',
        'googleMapsUrl',
        'googleMapsURL',
        'google_maps_url',
        'GoogleMapsURL',
        'GoogleMapsUrl',
      ])
      break

    case 'Reception':
      setCanonicalAlias(next, 'venueText', ['venue_text', 'VenueText', 'venue', 'Venue', 'location', 'Location'])
      setCanonicalAlias(next, 'mapUrl', [
        'mapURL',
        'map_url',
        'MapURL',
        'MapUrl',
        'googleMapsUrl',
        'googleMapsURL',
        'google_maps_url',
        'GoogleMapsURL',
        'GoogleMapsUrl',
      ])
      break

    case 'GraduatesList':
    case 'Hosts':
      setCanonicalAlias(next, 'closing', ['Closing', 'content', 'Content'])
      break

    case 'Agenda': {
      setCanonicalAlias(next, 'content', ['body', 'Body', 'description', 'Description'])
      setCanonicalAlias(next, 'items', ['Items', 'agenda_items', 'agendaItems', 'AgendaItems'])
      if (next.items !== undefined) next.items = normalizeAgendaItems(next.items)
      break
    }

    case 'RSVPConfirmation':
      setCanonicalAlias(next, 'welcome_message', [
        'welcomeMessage',
        'WelcomeMessage',
        'default_welcome_message',
        'defaultWelcomeMessage',
        'DefaultWelcomeMessage',
      ])
      setCanonicalAlias(next, 'thank_you_message', [
        'thankYouMessage',
        'ThankYouMessage',
        'default_thank_you_message',
        'defaultThankYouMessage',
        'DefaultThankYouMessage',
      ])
      setCanonicalAlias(next, 'guest_signature_title', [
        'guestSignatureTitle',
        'GuestSignatureTitle',
        'default_guest_signature_title',
        'defaultGuestSignatureTitle',
        'DefaultGuestSignatureTitle',
      ])
      break

    case 'MomentWall':
      setCanonicalAlias(next, 'identifier', ['Identifier'])
      setCanonicalAlias(next, 'moment_request_message', ['momentRequestMessage', 'MomentRequestMessage'])
      setCanonicalAlias(next, 'allow_uploads', ['allowUploads', 'AllowUploads'])
      setCanonicalAlias(next, 'allow_messages', ['allowMessages', 'AllowMessages'])
      setCanonicalAlias(next, 'auto_approve_uploads', ['autoApproveUploads', 'AutoApproveUploads'])
      setCanonicalAlias(next, 'published', ['Published'])
      setCanonicalAlias(next, 'moments_wall_published', [
        'momentsWallPublished',
        'MomentsWallPublished',
        'show_moment_wall',
        'show_wall',
        'showMomentWall',
        'showWall',
        'ShowMomentWall',
        'ShowWall',
      ])
      setCanonicalAlias(next, 'share_uploads_enabled', [
        'shareUploadsEnabled',
        'ShareUploadsEnabled',
        'sharedUploadsEnabled',
        'SharedUploadsEnabled',
      ])
      setCanonicalAlias(next, 'max_uploads_per_guest', [
        'maxUploadsPerGuest',
        'MaxUploadsPerGuest',
        'uploads_limit',
        'uploadsLimit',
        'UploadsLimit',
      ])
      normalizeMomentWallRuntimeState(next)
      break

    case 'TEXT':
      setCanonicalAlias(next, 'content', ['description', 'Description', 'text', 'Text'])
      break

    case 'MAP':
      setCanonicalAlias(next, 'content', ['description', 'Description'])
      setCanonicalAlias(next, 'mapUrl', [
        'mapURL',
        'map_url',
        'MapURL',
        'MapUrl',
        'googleMapsUrl',
        'googleMapsURL',
        'google_maps_url',
        'GoogleMapsURL',
        'GoogleMapsUrl',
      ])
      break

    case 'MUSIC':
      setCanonicalAlias(next, 'musicUrl', ['url', 'URL'])
      break
  }

  return next
}

function sectionComponentType(section: SectionConfigAliasSource): string {
  return firstStringValue(section, ['component_type', 'componentType', 'ComponentType', 'type', 'Type'])
}

export function readEventSectionConfig(section: SectionConfigSource): Record<string, unknown> {
  if (!section) return {}

  const rawConfig = firstValue(section, ['config', 'Config'])
  if (rawConfig !== undefined && rawConfig !== null) {
    const config = asConfigObject(rawConfig)
    if (Object.keys(config).length > 0) return normalizeSectionConfigAliases(config, sectionComponentType(section))
  }

  return normalizeSectionConfigAliases(
    asConfigObject(firstValue(section, ['content_json', 'contentJson', 'ContentJSON', 'ContentJson'])),
    sectionComponentType(section)
  )
}

export function hasEventSectionConfig(section: SectionConfigSource): boolean {
  return Object.keys(readEventSectionConfig(section)).length > 0
}
