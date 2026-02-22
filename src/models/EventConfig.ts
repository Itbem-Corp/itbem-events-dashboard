import { BaseEntity } from "./BaseEntity";
import { DesignTemplate } from "./DesignTemplate";

export interface EventConfig extends BaseEntity {
  event_id: string;

  // Design
  design_template_id?: string;
  design_template?: DesignTemplate;

  // Access & visibility
  is_public: boolean;
  is_auth_preview?: boolean;
  show_guest_list: boolean;
  allow_registration: boolean;
  password_protection?: string;
  auth_password_preview?: string;

  // Guest interaction
  allow_uploads?: boolean;       // guests can upload photos
  allow_messages?: boolean;      // guests can send messages

  // Notifications
  notify_on_moment_upload?: boolean;

  // Scheduling
  active_from?: string;   // ISO date — when public page becomes visible
  active_until?: string;  // ISO date — when public page expires

  // Custom messages
  welcome_message?: string;
  moment_message?: string;
  thank_you_message?: string;
  guest_signature_title?: string;

  // Visibility section toggles
  show_countdown?: boolean;
  show_rsvp?: boolean;
  show_location?: boolean;
  show_gallery?: boolean;
  show_wall?: boolean;
  show_contact?: boolean;
  show_header?: boolean;
  show_footer?: boolean;
  show_schedule?: boolean;
}
