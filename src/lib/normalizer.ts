/**
 * normalizer.ts — converts PascalCase keys from the Go API to snake_case.
 * Used automatically by the Axios response interceptor in api.ts.
 */

export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

const RESPONSE_ALIASES: Record<string, string> = {
  guest_status_id: 'status_id',
  guest_status: 'status',
  image1_url: 'image_1_url',
  image2_url: 'image_2_url',
  image3_url: 'image_3_url',
}

const DESIGN_TEMPLATE_RESPONSE_ALIASES: Record<string, string> = {
  preview_url: 'preview_image_url',
  color_palette: 'default_color_palette',
  color_palette_id: 'default_color_palette_id',
  font_set: 'default_font_set',
  font_set_id: 'default_font_set_id',
}

function isRawSectionConfigContainer(record: Record<string, unknown>): boolean {
  return [
    'component_type',
    'componentType',
    'ComponentType',
    'content_json',
    'contentJson',
    'ContentJSON',
    'ContentJson',
    'is_visible',
    'isVisible',
    'IsVisible',
    'section_id',
    'sectionId',
    'SectionId',
    'event_section_id',
    'eventSectionId',
    'EventSectionId',
  ].some((key) => key in record)
}

function shouldPreserveRawValue(record: Record<string, unknown>, normalizedKey: string): boolean {
  if (normalizedKey === 'content_json') return true
  return normalizedKey === 'config' && isRawSectionConfigContainer(record)
}

function isDesignTemplateRecord(record: Record<string, unknown>): boolean {
  if (typeof record.identifier !== 'string' || 'event_id' in record) return false
  return [
    'preview_url',
    'preview_image_url',
    'preview_view_url',
    'animations_enabled',
    'has_dark_mode',
    'is_premium',
    'category',
    'default_color_palette',
    'default_color_palette_id',
    'default_font_set',
    'default_font_set_id',
  ].some((key) => key in record)
}

function applyAliases(record: Record<string, unknown>, aliases: Record<string, string>) {
  for (const [source, target] of Object.entries(aliases)) {
    if (source in record && !(target in record)) {
      record[target] = record[source]
    }
  }
}

export function normalizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(normalizeKeys)
  if (obj !== null && typeof obj === 'object') {
    const record = obj as Record<string, unknown>
    const normalized = Object.fromEntries(
      Object.entries(record).map(([k, v]) => {
        const normalizedKey = toSnakeCase(k)
        return [normalizedKey, shouldPreserveRawValue(record, normalizedKey) ? v : normalizeKeys(v)]
      })
    )

    applyAliases(normalized, RESPONSE_ALIASES)
    if (isDesignTemplateRecord(normalized)) {
      applyAliases(normalized, DESIGN_TEMPLATE_RESPONSE_ALIASES)
    }

    return normalized
  }
  return obj
}
