import { BaseEntity } from "./BaseEntity";
import { Color } from "./Color";

export interface ColorPalettePattern extends BaseEntity {
  color_palette_id: string;
  color_id: string;
  color?: Color;
  key?: string;
  role?: string; // 'PRIMARY', 'SECONDARY', 'BACKGROUND'
  order?: number;
}
