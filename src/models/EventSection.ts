import { BaseEntity } from "./BaseEntity";

export interface EventSection extends BaseEntity {
  event_id: string;
  name: string;
  type: string; // 'TEXT', 'GALLERY', 'MAP'
  order: number;
  content_json?: any; // JSON dinámico
  is_visible: boolean;
}
