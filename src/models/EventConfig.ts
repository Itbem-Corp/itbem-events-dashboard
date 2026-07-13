import { BaseEntity } from './BaseEntity'
import { ColorPalette } from './ColorPalette'
import { DesignTemplate } from './DesignTemplate'
import { FontSet } from './FontSet'

export interface EventConfig extends BaseEntity {
  // Backend stores EventConfig with the event UUID as `id`; `event_id` is
  // emitted by the API response so dashboard code can treat it as an event-scoped resource.
  event_id: string

  // Design
  design_template_id?: string | null
  design_template?: DesignTemplate | null
  color_palette_id?: string | null
  color_palette?: ColorPalette | null
  font_set_id?: string | null
  font_set?: FontSet | null

  // Access & visibility
  is_public: boolean
  is_auth_preview?: boolean
  auth_password_preview?: string
  visibility_configured?: boolean

  // Guest interaction
  allow_uploads?: boolean // guests can upload photos
  allow_messages?: boolean // guests can send messages
  share_uploads_enabled?: boolean // QR shared uploads (no personal token needed)
  shareUploadsEnabled?: boolean
  sharedUploadsEnabled?: boolean
  max_uploads_per_guest?: number // per-IP upload limit used by public uploads
  auto_approve_uploads?: boolean // moments skip review when true

  // Notifications
  notify_on_moment_upload?: boolean

  // Scheduling
  active_from?: string | null // ISO date — when public page becomes visible
  active_until?: string | null // ISO date — when public page expires

  // Custom messages
  default_welcome_message?: string
  default_moment_request_message?: string
  default_thank_you_message?: string
  default_guest_signature_title?: string
  // Legacy dashboard aliases kept for local fallback while old cache entries expire.
  welcome_message?: string
  moment_message?: string
  thank_you_message?: string
  guest_signature_title?: string

  // Visibility section toggles
  show_countdown?: boolean
  show_rsvp_section?: boolean
  show_event_location?: boolean
  show_second_location?: boolean
  show_hosts_section?: boolean
  show_photo_gallery?: boolean
  show_moment_wall?: boolean
  moments_wall_published?: boolean
  momentsWallPublished?: boolean
  showMomentWall?: boolean
  show_contact_section?: boolean
  show_header?: boolean
  show_footer?: boolean
  show_event_schedule?: boolean
  // Legacy dashboard aliases kept for local fallback while old cache entries expire.
  show_rsvp?: boolean
  show_location?: boolean
  show_gallery?: boolean
  show_wall?: boolean
  showWall?: boolean
  show_contact?: boolean
  show_schedule?: boolean
}

export type EventConfigPatch = Partial<
  Pick<
    EventConfig,
    | 'is_public'
    | 'is_auth_preview'
    | 'auth_password_preview'
    | 'allow_uploads'
    | 'allow_messages'
    | 'share_uploads_enabled'
    | 'max_uploads_per_guest'
    | 'auto_approve_uploads'
    | 'notify_on_moment_upload'
    | 'design_template_id'
    | 'color_palette_id'
    | 'font_set_id'
    | 'active_from'
    | 'active_until'
    | 'default_welcome_message'
    | 'default_moment_request_message'
    | 'default_thank_you_message'
    | 'default_guest_signature_title'
    | 'show_countdown'
    | 'show_rsvp_section'
    | 'show_event_location'
    | 'show_second_location'
    | 'show_hosts_section'
    | 'show_photo_gallery'
    | 'show_moment_wall'
    | 'moments_wall_published'
    | 'momentsWallPublished'
    | 'show_contact_section'
    | 'show_header'
    | 'show_footer'
    | 'show_event_schedule'
  >
>
