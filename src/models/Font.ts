import { BaseEntity } from "./BaseEntity";

export interface Font extends BaseEntity {
  name: string;
  family: string;
  url?: string; // Google Fonts URL o local
}
