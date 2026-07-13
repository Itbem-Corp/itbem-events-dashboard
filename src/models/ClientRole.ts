import { BaseEntity } from "./BaseEntity";

export interface ClientRole extends BaseEntity {
  name: string;
  code: string; // e.g. 'Owner', 'Admin', 'Member', 'Guest'
  description?: string;
  hierarchy: number;
  is_active?: boolean;
}
