import { BaseEntity } from "./BaseEntity";
import { User } from "./User";

export interface EventMember extends BaseEntity {
  event_id: string;
  user_id: string;
  user?: User;
  role: string; // 'HOST', 'CO_HOST'
}
