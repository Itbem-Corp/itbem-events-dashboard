import type { EventConfigPatch } from '@/models/EventConfig'

type EventConfigPatchAliases = EventConfigPatch & {
  isPublic?: boolean
  isAuthPreview?: boolean
  allowUploads?: boolean
  allowMessages?: boolean
  shareUploadsEnabled?: boolean
  sharedUploadsEnabled?: boolean
  shared_uploads_enabled?: boolean
  authPasswordPreview?: string
  notifyOnMomentUpload?: boolean
  designTemplateId?: string | null
  designTemplateID?: string | null
  colorPaletteId?: string | null
  colorPaletteID?: string | null
  fontSetId?: string | null
  fontSetID?: string | null
  activeFrom?: string | null
  activeUntil?: string | null
  defaultWelcomeMessage?: string
  defaultMomentRequestMessage?: string
  defaultThankYouMessage?: string
  defaultGuestSignatureTitle?: string
  welcomeMessage?: string
  momentMessage?: string
  thankYouMessage?: string
  guestSignatureTitle?: string
  showCountdown?: boolean
  showRSVPSection?: boolean
  showRsvpSection?: boolean
  showRSVP?: boolean
  showRsvp?: boolean
  showEventLocation?: boolean
  showLocation?: boolean
  showSecondLocation?: boolean
  showHostsSection?: boolean
  showPhotoGallery?: boolean
  showGallery?: boolean
  show_wall?: boolean
  showWall?: boolean
  showMomentWall?: boolean
  showContactSection?: boolean
  showContact?: boolean
  showHeader?: boolean
  showFooter?: boolean
  showEventSchedule?: boolean
  showSchedule?: boolean
  maxUploadsPerGuest?: number
  autoApproveUploads?: boolean
}

const EVENT_CONFIG_PATCH_ALIASES: Array<[keyof EventConfigPatch, string[]]> = [
  ['is_public', ['isPublic']],
  ['is_auth_preview', ['isAuthPreview']],
  ['allow_uploads', ['allowUploads']],
  ['allow_messages', ['allowMessages']],
  ['share_uploads_enabled', ['shareUploadsEnabled', 'sharedUploadsEnabled', 'shared_uploads_enabled']],
  ['auth_password_preview', ['authPasswordPreview']],
  ['notify_on_moment_upload', ['notifyOnMomentUpload']],
  ['design_template_id', ['designTemplateId', 'designTemplateID']],
  ['color_palette_id', ['colorPaletteId', 'colorPaletteID']],
  ['font_set_id', ['fontSetId', 'fontSetID']],
  ['active_from', ['activeFrom']],
  ['active_until', ['activeUntil']],
  ['default_welcome_message', ['defaultWelcomeMessage', 'welcomeMessage', 'welcome_message']],
  ['default_moment_request_message', ['defaultMomentRequestMessage', 'momentMessage', 'moment_message']],
  ['default_thank_you_message', ['defaultThankYouMessage', 'thankYouMessage', 'thank_you_message']],
  [
    'default_guest_signature_title',
    ['defaultGuestSignatureTitle', 'guestSignatureTitle', 'guest_signature_title'],
  ],
  ['show_countdown', ['showCountdown']],
  ['show_rsvp_section', ['showRSVPSection', 'showRsvpSection', 'showRSVP', 'showRsvp', 'show_rsvp']],
  ['show_event_location', ['showEventLocation', 'showLocation', 'show_location']],
  ['show_second_location', ['showSecondLocation']],
  ['show_hosts_section', ['showHostsSection']],
  ['show_photo_gallery', ['showPhotoGallery', 'showGallery', 'show_gallery']],
  ['show_moment_wall', ['moments_wall_published', 'momentsWallPublished', 'showMomentWall', 'show_wall', 'showWall']],
  ['show_contact_section', ['showContactSection', 'showContact', 'show_contact']],
  ['show_header', ['showHeader']],
  ['show_footer', ['showFooter']],
  ['show_event_schedule', ['showEventSchedule', 'showSchedule', 'show_schedule']],
  ['max_uploads_per_guest', ['maxUploadsPerGuest']],
  ['auto_approve_uploads', ['autoApproveUploads']],
]

function canonicalizeEventConfigPatchAliases(patch: EventConfigPatchAliases): EventConfigPatchAliases {
  const normalized = { ...patch } as EventConfigPatchAliases & Record<string, unknown>
  const record = normalized as Record<string, unknown>

  for (const [canonicalField, aliases] of EVENT_CONFIG_PATCH_ALIASES) {
    if (record[canonicalField] === undefined) {
      for (const alias of aliases) {
        if (record[alias] !== undefined) {
          record[canonicalField] = record[alias]
          break
        }
      }
    }

    for (const alias of aliases) {
      delete record[alias]
    }
  }

  return normalized
}

export function normalizeEventConfigPatch(patch: EventConfigPatchAliases): EventConfigPatch {
  const normalized = canonicalizeEventConfigPatchAliases(patch)

  const wallPublished =
    normalized.show_moment_wall ?? normalized.moments_wall_published ?? normalized.momentsWallPublished

  if (wallPublished !== undefined) {
    normalized.show_moment_wall = wallPublished
    delete normalized.moments_wall_published
    delete normalized.momentsWallPublished
  }

  if (typeof normalized.auth_password_preview === 'string') {
    normalized.auth_password_preview = normalized.auth_password_preview.trim()
  }

  if (normalized.allow_uploads === false) {
    normalized.share_uploads_enabled = false
  }

  if (normalized.show_moment_wall === true) {
    normalized.share_uploads_enabled = false
  }

  if (normalized.share_uploads_enabled === true) {
    normalized.allow_uploads = true
    normalized.show_moment_wall = false
  }

  return normalized
}
