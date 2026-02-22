import { BaseEntity } from "./BaseEntity";
import { Guest } from "./Guest";

export interface Invitation extends BaseEntity {
  event_id: string;
  guest_id: string;
  guest?: Guest;
  
  token: string;
  sent_at?: string;
  opened_at?: string;
  responded_at?: string;
}
