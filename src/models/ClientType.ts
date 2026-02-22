import { BaseEntity } from "./BaseEntity";

export interface ClientType extends BaseEntity {
  name: string;
  code: string; // 'AGENCY', 'PLATFORM', 'CUSTOMER'
  description?: string;
}
