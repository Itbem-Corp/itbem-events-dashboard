import { BaseEntity } from './BaseEntity'
import { ColorPalette } from './ColorPalette'
import { FontSet } from './FontSet'

export interface DesignTemplate extends BaseEntity {
  name: string
  identifier: string // 'ELEGANT_1'
  description?: string | null
  preview_url?: string | null
  preview_image_url?: string | null
  preview_view_url?: string | null
  preview_view_url_expires_at?: string | null
  category?: string | null
  animations_enabled?: boolean
  has_dark_mode?: boolean
  is_premium?: boolean
  is_active?: boolean

  color_palette_id?: string | null
  color_palette?: ColorPalette | null
  default_color_palette_id?: string | null
  default_color_palette?: ColorPalette | null

  font_set_id?: string | null
  font_set?: FontSet | null
  default_font_set_id?: string | null
  default_font_set?: FontSet | null
}
