import { BaseEntity } from "./BaseEntity";
import { DesignTemplate } from "./DesignTemplate";

export interface EventConfig extends BaseEntity {
  event_id: string;
  
  // Design
  design_template_id?: string;
  design_template?: DesignTemplate;
  
  // Settings
  is_public: boolean;
  show_guest_list: boolean;
  allow_registration: boolean;
  password_protection?: string;
}
