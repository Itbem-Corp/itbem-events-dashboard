import { BaseEntity } from './BaseEntity'
import { ClientSummary } from './Client'
import { EventConfig } from './EventConfig'
import { EventType } from './EventType'
import { EventSection } from './EventSection'

export interface Event extends BaseEntity {
  // Core
  name: string
  identifier: string // Slug único, auto-generado por el backend
  description?: string
  is_active: boolean
  pending_moment_count?: number
  guest_summary?: import('./GuestSummary').GuestSummary
  guest_share_summary?: {
    total: number
    with_email: number
    with_phone: number
    pending_with_email: number
    first_pending?: { id: string; first_name: string; email: string; pretty_token: string }
  }
  event_sections?: EventSection[]

  // Fecha y lugar
  event_date_time: string // ISO string (Go time.Time serializado)
  timezone: string
  address?: string // Dirección del evento
  second_address?: string // Dirección secundaria (ej. lugar de fiesta)

  // Media
  cover_image_url?: string
  cover_image_url2?: string
  cover_view_url?: string
  cover_view_url2?: string
  cover_view_url_expires_at?: string
  cover_view_url2_expires_at?: string
  view_url?: string
  view_url_expires_at?: string
  cover_pending_url?: string
  cover_pending_view_url?: string
  cover_pending_view_url_expires_at?: string
  cover_processing_status?: 'pending' | 'processing' | 'done' | 'failed' | ''
  cover_processing_job_id?: string
  cover_processing_generation?: number
  cover_processing_error?: string
  music_url?: string
  custom_domain?: string

  // Configuración
  language?: string
  max_guests?: number | null // *int en Go — puede ser null
  allow_guest_access?: boolean
  slug_locked?: boolean

  // Organizador
  organizer_name?: string
  organizer_email?: string
  organizer_phone?: string

  // Relaciones
  client_id?: string | null
  client?: ClientSummary | null
  event_type_id: string
  event_type?: EventType | null
  event_config?: EventConfig | null // JSON key from backend: "event_config"
  config?: EventConfig | null // alias — populated by separate /config fetch
}

export type EventResponse = Event

export interface EventDashboardOverview {
  metrics: {
    total: number
    active: number
    upcoming: number
    past_active: number
    total_capacity: number
  }
  next_event: Event | null
  next_event_guest_summary?: import('./GuestSummary').GuestSummary | null
  active_events: Event[]
}

export interface EventListPage {
  data: Event[]
  total: number
  page: number
  page_size: number
  total_pages: number
  counts: {
    all: number
    upcoming: number
    today: number
    past: number
  }
}

export interface PreviewTokenResponse {
  token: string
  expires_at?: string
}

export interface EventCoverResponse {
  cover_image_url: string
  view_url: string
  cover_view_url?: string
  cover_view_url_expires_at?: string
  view_url_expires_at?: string
  pending_url?: string
  pending_view_url?: string
  pending_view_url_expires_at?: string
  processing_status?: 'pending' | 'processing' | 'done' | 'failed' | ''
  processing_job_id?: string
  processing_generation?: number
  processing_error?: string
}

export interface EventRepairResponse {
  repaired: boolean
  fixes: string[]
  warnings: string[]
}
