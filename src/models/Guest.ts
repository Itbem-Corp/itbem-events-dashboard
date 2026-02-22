import { BaseEntity } from "./BaseEntity";
import { GuestStatus } from "./GuestStatus";

export interface Guest extends BaseEntity {
  event_id: string;
  invitation_id?: string;

  // Personal info
  first_name: string;
  last_name: string;
  nickname?: string;
  email?: string;
  phone?: string;
  show_contact_info?: boolean;

  // Rich profile (for graduate programs, VIP listings, etc.)
  bio?: string;
  headline?: string;      // role/title shown publicly
  signature?: string;     // closing phrase / dedication
  image_url?: string;     // primary profile image
  image_1_url?: string;
  image_2_url?: string;
  image_3_url?: string;

  // Party size
  guests_count: number;    // +1s confirmed
  max_guests?: number;     // max allowed by the invitation

  // Status
  status_id: string;
  status?: GuestStatus;

  // Logistics
  order?: number;           // display order in guest lists / programs
  table_number?: string;
  table_id?: string | null;
  dietary_restrictions?: string;
  role?: string;            // graduate | guest | host | vip | speaker | staff
  is_host?: boolean;

  // RSVP tracking (backend rsup_* fields)
  rsvp_status?: string;       // pending | confirmed | declined
  rsvp_at?: string;           // ISO date — when they responded
  rsvp_method?: string;       // web | app | host
  rsvp_guest_count?: number;  // how many guests they declared when doing RSVP
  rsvp_token_id?: string;     // token UUID linked to InvitationAccessToken

  // Notes
  notes?: string;
}
