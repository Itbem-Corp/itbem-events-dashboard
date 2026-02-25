import { BaseEntity } from "./BaseEntity";
import { EventType } from "./EventType";
import { EventConfig } from "./EventConfig";

export interface Event extends BaseEntity {
  // Core
  name: string;
  identifier: string;        // Slug único, auto-generado por el backend
  description?: string;
  is_active: boolean;

  // Fecha y lugar
  event_date_time: string;   // ISO string (Go time.Time serializado)
  timezone: string;
  address?: string;          // Dirección del evento
  second_address?: string;   // Dirección secundaria (ej. lugar de fiesta)

  // Media
  cover_image_url?: string;
  cover_image_url2?: string;
  music_url?: string;
  custom_domain?: string;

  // Configuración
  language?: string;
  max_guests?: number | null;  // *int en Go — puede ser null
  allow_guest_access?: boolean;
  slug_locked?: boolean;

  // Organizador
  organizer_name?: string;
  organizer_email?: string;
  organizer_phone?: string;

  // Relaciones
  client_id?: string;
  event_type_id: string;
  event_type?: EventType;
  event_config?: EventConfig;  // JSON key from backend: "event_config"
  config?: EventConfig;        // alias — populated by separate /config fetch
}
