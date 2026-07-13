import { BaseEntity } from "./BaseEntity";

export interface Color extends BaseEntity {
  name: string;
  value?: string;
  hex_code?: string;
}
