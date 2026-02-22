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
  // Dynamic — driven by backend invitation data
}
