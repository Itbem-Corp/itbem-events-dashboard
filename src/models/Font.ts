import { BaseEntity } from "./BaseEntity";

export interface Font extends BaseEntity {
  name: string;
  family?: string;
  url?: string; // Google Fonts URL o local
  view_url?: string;
  view_url_expires_at?: string;
  resource_id?: string;
  is_serif?: boolean;
}

export type FontResponse = Font;
