import { BaseEntity } from "./BaseEntity";

export interface ClientRole extends BaseEntity {
  name: string;
  code: string; // 'OWNER', 'ADMIN', 'EDITOR'
  hierarchy: number;
}
