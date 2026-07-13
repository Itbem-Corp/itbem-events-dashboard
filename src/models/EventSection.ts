import { BaseEntity } from "./BaseEntity";

export interface EventSection extends BaseEntity {
  event_id: string;
  key?: string;              // slug key del backend
  name: string;
  title?: string;            // alias backend
  type?: string;             // legacy
  component_type: string;    // SDUI component type (CountdownHeader, EventVenue, etc.)
  order: number;
  config?: Record<string, unknown>;  // JSONB — config por tipo de sección
  content_json?: Record<string, unknown>; // legacy alias
  is_visible: boolean;
}

// ─── SDUI Section Config shapes (per component_type) ─────────────────────────

export interface CountdownHeaderConfig {
  heading: string;
  targetDate: string; // ISO 8601
}

export interface GraduationHeroConfig {
  title: string;
  years: string;  // e.g. "2022-2025"
  school: string;
}

export interface EventVenueConfig {
  text: string;
  date: string;
  venueText: string;
  mapUrl: string; // Google Maps embed URL
}

export interface ReceptionConfig {
  venueText: string;
  mapUrl: string;
}

export interface GraduatesListConfig {
  closing: string;
}

export interface PhotoGridConfig {
  // No config needed — images managed separately via resources
}

export interface RSVPConfirmationConfig {
  welcome_message?: string;
  thank_you_message?: string;
  guest_signature_title?: string;
}

export interface AgendaItem {
  time: string;
  title: string;
  description?: string;
  icon?: 'ceremony' | 'reception' | 'dinner' | 'party' | 'music' | 'photo' | 'default';
  location?: string;
}

export interface AgendaConfig {
  title?: string;
  subtitle?: string;
  /** Legacy SCHEDULE sections used this plain text body instead of items */
  content?: string;
  items: AgendaItem[];
}

export interface MomentWallConfig {
  identifier?: string;
  title?: string;
  subtitle?: string;
  moment_request_message?: string;
  allow_uploads?: boolean;
  allow_messages?: boolean;
  auto_approve_uploads?: boolean;
  published?: boolean;
  moments_wall_published?: boolean;
  show_moment_wall?: boolean;
  share_uploads_enabled?: boolean;
  max_uploads_per_guest?: number;
}

export interface LegacyHeroConfig {
  title?: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
}

export interface LegacyTextConfig {
  title?: string;
  content?: string;
}

export interface LegacyGalleryConfig {
  title?: string;
  subtitle?: string;
}

export interface LegacyMusicConfig {
  musicUrl?: string;
  audioUrl?: string;
  url?: string;
}
