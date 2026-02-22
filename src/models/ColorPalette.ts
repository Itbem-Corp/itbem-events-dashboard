import { BaseEntity } from "./BaseEntity";
import { ColorPalettePattern } from "./ColorPalettePattern";

export interface ColorPalette extends BaseEntity {
  name: string;
  is_premium: boolean;
  patterns?: ColorPalettePattern[];
}
