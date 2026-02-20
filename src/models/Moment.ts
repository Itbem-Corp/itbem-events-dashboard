import { BaseEntity } from "./BaseEntity";
import { MomentType } from "./MomentType";
import { Guest } from "./Guest";
import { Resource } from "./Resource";

export interface Moment extends BaseEntity {
  event_id: string;
  guest_id?: string;
  guest?: Guest;
  
  moment_type_id: string;
  moment_type?: MomentType;
  
  resource_id?: string;
  resource?: Resource;
  
  message?: string;
  is_approved: boolean;
}
