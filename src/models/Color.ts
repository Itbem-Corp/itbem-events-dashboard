import { BaseEntity } from "./BaseEntity";

export interface Color extends BaseEntity {
  name: string;
  hex_code: string;
}
