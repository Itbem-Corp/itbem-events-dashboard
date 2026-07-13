import { getMediaRefreshDelay, getPresignedUrlExpiry } from '@/lib/signed-media'

export const DESIGN_CATALOG_MEDIA_REFRESH_SKEW_MS = 60 * 1000

type RecordValue = Record<string, unknown>

const TEMPLATE_PREVIEW_EXPIRY_KEYS = [
  'preview_view_url_expires_at',
  'previewViewUrlExpiresAt',
  'previewViewURLExpiresAt',
  'PreviewViewURLExpiresAt',
  'PreviewViewUrlExpiresAt',
]

const TEMPLATE_PREVIEW_URL_KEYS = [
  'preview_view_url',
  'previewViewUrl',
  'previewViewURL',
  'PreviewViewURL',
  'PreviewViewUrl',
  'preview_image_url',
  'previewImageUrl',
  'PreviewImageURL',
  'PreviewImageUrl',
  'preview_url',
  'previewUrl',
  'PreviewURL',
  'PreviewUrl',
]

const FONT_EXPIRY_KEYS = [
  'view_url_expires_at',
  'viewUrlExpiresAt',
  'viewURLExpiresAt',
  'ViewURLExpiresAt',
  'ViewUrlExpiresAt',
  'font_view_url_expires_at',
  'fontViewUrlExpiresAt',
  'fontViewURLExpiresAt',
  'FontViewURLExpiresAt',
  'FontViewUrlExpiresAt',
]

const FONT_URL_KEYS = [
  'view_url',
  'viewUrl',
  'viewURL',
  'ViewURL',
  'ViewUrl',
  'font_view_url',
  'fontViewUrl',
  'fontViewURL',
  'FontViewURL',
  'FontViewUrl',
  'url',
  'URL',
]

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined

  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed) return trimmed
    }
  }

  return undefined
}

function firstArray(value: unknown, keys: string[]): unknown[] {
  if (!isRecord(value)) return []

  let emptyArray: unknown[] | undefined
  for (const key of keys) {
    const candidate = value[key]
    if (!Array.isArray(candidate)) continue
    if (candidate.length > 0) return candidate
    emptyArray ??= candidate
  }

  return emptyArray ?? []
}

function firstRecord(value: unknown, keys: string[]): RecordValue | undefined {
  if (!isRecord(value)) return undefined

  let emptyRecord: RecordValue | undefined
  for (const key of keys) {
    const candidate = value[key]
    if (!isRecord(candidate)) continue
    if (Object.keys(candidate).length > 0) return candidate
    emptyRecord ??= candidate
  }

  return emptyRecord
}

function explicitExpiry(value: unknown, keys: string[]): Date | null {
  const raw = firstString(value, keys)
  if (!raw) return null

  const expiry = new Date(raw)
  return Number.isNaN(expiry.getTime()) ? null : expiry
}

export function getDesignTemplatePreviewExpiry(template: unknown): Date | null {
  return (
    explicitExpiry(template, TEMPLATE_PREVIEW_EXPIRY_KEYS) ??
    getPresignedUrlExpiry(firstString(template, TEMPLATE_PREVIEW_URL_KEYS))
  )
}

export function getDesignCatalogFontExpiry(font: unknown): Date | null {
  return explicitExpiry(font, FONT_EXPIRY_KEYS) ?? getPresignedUrlExpiry(firstString(font, FONT_URL_KEYS))
}

export function getDesignCatalogFontSetExpiries(fontSet: unknown): Array<Date | null> {
  return firstArray(fontSet, ['patterns', 'Patterns']).map((pattern) =>
    getDesignCatalogFontExpiry(firstRecord(pattern, ['font', 'Font']))
  )
}

function getTemplateFontSetExpiries(template: unknown): Array<Date | null> {
  const fontSets = [
    firstRecord(template, ['font_set', 'fontSet', 'FontSet']),
    firstRecord(template, ['default_font_set', 'defaultFontSet', 'DefaultFontSet']),
  ].filter((fontSet): fontSet is RecordValue => Boolean(fontSet))

  return fontSets.flatMap((fontSet) => getDesignCatalogFontSetExpiries(fontSet))
}

export function getDesignCatalogMediaRefreshDelay(
  catalogs: { templates?: unknown[] | null; fontSets?: unknown[] | null },
  now = Date.now(),
  skewMs = DESIGN_CATALOG_MEDIA_REFRESH_SKEW_MS
): number | null {
  const templates = catalogs.templates ?? []
  const fontSets = catalogs.fontSets ?? []
  const expiries = [
    ...templates.map((template) => getDesignTemplatePreviewExpiry(template)),
    ...templates.flatMap((template) => getTemplateFontSetExpiries(template)),
    ...fontSets.flatMap((fontSet) => getDesignCatalogFontSetExpiries(fontSet)),
  ]

  return getMediaRefreshDelay(expiries, now, skewMs)
}

function designCatalogMediaRefreshPart(value: unknown, urlKeys: string[], expiryKeys: string[]): string {
  const url = firstString(value, urlKeys) ?? ''
  const expiry = firstString(value, expiryKeys) ?? getPresignedUrlExpiry(url)?.toISOString() ?? ''
  return url || expiry ? `${url}:${expiry}` : ''
}

function getFontSetMediaRefreshParts(fontSet: unknown): string[] {
  return firstArray(fontSet, ['patterns', 'Patterns'])
    .map((pattern) => firstRecord(pattern, ['font', 'Font']))
    .map((font) => designCatalogMediaRefreshPart(font, FONT_URL_KEYS, FONT_EXPIRY_KEYS))
    .filter(Boolean)
}

function getTemplateMediaRefreshParts(template: unknown): string[] {
  const fontSets = [
    firstRecord(template, ['font_set', 'fontSet', 'FontSet']),
    firstRecord(template, ['default_font_set', 'defaultFontSet', 'DefaultFontSet']),
  ].filter((fontSet): fontSet is RecordValue => Boolean(fontSet))

  return [
    designCatalogMediaRefreshPart(template, TEMPLATE_PREVIEW_URL_KEYS, TEMPLATE_PREVIEW_EXPIRY_KEYS),
    ...fontSets.flatMap((fontSet) => getFontSetMediaRefreshParts(fontSet)),
  ].filter(Boolean)
}

export function designCatalogMediaRefreshKey(catalogs: {
  templates?: unknown[] | null
  fontSets?: unknown[] | null
}): string {
  const templates = catalogs.templates ?? []
  const fontSets = catalogs.fontSets ?? []

  return [
    ...templates.flatMap((template) => getTemplateMediaRefreshParts(template)),
    ...fontSets.flatMap((fontSet) => getFontSetMediaRefreshParts(fontSet)),
  ].join('|')
}
