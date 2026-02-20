import { BaseEntity } from "./BaseEntity";
import { GuestStatus } from "./GuestStatus";

export interface Guest extends BaseEntity {
  event_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  
  guests_count: number; // +1s
  
  status_id: string;
  status?: GuestStatus;
  
  table_number?: string;
  dietary_restrictions?: string;
}
