import { BaseEntity } from "./BaseEntity";
import { ColorPalette } from "./ColorPalette";
import { FontSet } from "./FontSet";

export interface DesignTemplate extends BaseEntity {
  name: string;
  identifier: string; // 'ELEGANT_1'
  preview_image_url?: string;
  
  default_color_palette_id?: string;
  default_color_palette?: ColorPalette;
  
  default_font_set_id?: string;
  default_font_set?: FontSet;
}
