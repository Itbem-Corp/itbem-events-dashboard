import { BaseEntity } from "./BaseEntity";
import { Font } from "./Font";

export interface FontSetPattern extends BaseEntity {
  font_set_id: string;
  font_id: string;
  font?: Font;
  role: string; // 'HEADING', 'BODY', 'ACCENT'
}
