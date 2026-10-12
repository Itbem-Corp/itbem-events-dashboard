import { BaseEntity } from './BaseEntity'
import { GuestStatus } from './GuestStatus'
import type { Table } from './Table'

export interface Guest extends BaseEntity {
  event_id: string
  invitation_id?: string
  pretty_token?: string

  // Personal info
  first_name: string
  last_name: string
  nickname?: string
  email?: string
  phone?: string
  show_contact_info?: boolean

  // Rich profile (for graduate programs, VIP listings, etc.)
  bio?: string
  headline?: string // role/title shown publicly
  signature?: string // closing phrase / dedication
  image_url?: string // primary profile image
  image1_url?: string
  image2_url?: string
  image3_url?: string
  image_1_url?: string
  image_2_url?: string
  image_3_url?: string

  // Party size
  guests_count: number // effective party size from backend (0 when RSVP declined)
  max_guests?: number // max allowed by the invitation

  // Status
  guest_status_id?: string
  guest_status?: GuestStatus
  status_id: string
  status?: GuestStatus

  // Logistics
  order?: number // display order in guest lists / programs
  table_number?: string
  table_id?: string | null
  table?: Table | null
  dietary_restrictions?: string
  role?: string // graduate | guest | host | vip | speaker | staff
  is_host?: boolean

  // RSVP tracking (backend rsup_* fields)
  rsvp_status?: string // pending | confirmed | declined
  rsvp_at?: string // ISO date — when they responded
  rsvp_method?: string // web | app | host
  rsvp_guest_count?: number // how many guests they declared when doing RSVP
  rsvp_token_id?: string // token UUID linked to InvitationAccessToken
  rsvp_notes?: string // public note/message submitted by the guest during RSVP
  /**
   * Set while a door check-in (PATCH /guests/bulk/status action 'checkin') is
   * in place; null or absent otherwise. Only then can the door undo it.
   */
  checked_in_at?: string | null

  // Notes
  notes?: string
}

/** Filter of the check-in list (GET /guests/checkin:<eventID>?filter=). */
export type CheckinGuestFilter = 'ALL' | 'PENDING' | 'CONFIRMED'

/**
 * The door projection returned by the check-in routes (checkin-workspace and
 * guests/checkin:<eventID>): no email, phone, notes or tokens for any caller.
 */
export type CheckinGuest = Pick<
  Guest,
  | 'id'
  | 'event_id'
  | 'first_name'
  | 'last_name'
  | 'table_id'
  | 'table'
  | 'table_number'
  | 'guest_status_id'
  | 'guest_status'
  | 'status_id'
  | 'status'
  | 'guests_count'
  | 'rsvp_status'
  | 'rsvp_guest_count'
  | 'checked_in_at'
> &
  Partial<Pick<Guest, 'rsvp_method' | 'rsvp_at' | 'created_at' | 'updated_at'>>

export interface CheckinGuestsPageResponse {
  data: Guest[]
  total: number
  page: number
  page_size: number
  total_pages: number
  summary?: import('./GuestSummary').GuestSummary
  share_summary?: {
    total: number
    with_email: number
    with_phone: number
    pending_with_email: number
    first_pending?: { id: string; first_name: string; email: string; pretty_token: string }
  }
}
