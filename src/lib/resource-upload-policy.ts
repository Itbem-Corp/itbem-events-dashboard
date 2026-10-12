export const SECTION_IMAGE_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/heic',
  'image/heif',
  'image/avif',
] as const

export const SECTION_IMAGE_UPLOAD_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.svg',
  '.heic',
  '.heif',
  '.avif',
] as const

export const SECTION_IMAGE_UPLOAD_ACCEPT = [
  ...SECTION_IMAGE_UPLOAD_MIME_TYPES,
  ...SECTION_IMAGE_UPLOAD_EXTENSIONS,
].join(',')

export const SECTION_IMAGE_DROPZONE_ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/svg+xml': ['.svg'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'image/avif': ['.avif'],
} as const

export const SECTION_IMAGE_UPLOAD_MAX_MB = 10
export const SECTION_IMAGE_UPLOAD_MAX_BYTES = SECTION_IMAGE_UPLOAD_MAX_MB * 1024 * 1024
export const SECTION_IMAGE_UPLOAD_HELP_TEXT = 'JPG, PNG, WebP, GIF, HEIC, AVIF, SVG'
export const SECTION_IMAGE_UPLOAD_LIMIT_HELP_TEXT = `${SECTION_IMAGE_UPLOAD_HELP_TEXT} · Hasta ${SECTION_IMAGE_UPLOAD_MAX_MB} MB`

/**
 * Limits of the guest upload page (public site SharedUploadPage: "Máx. 25 MB fotos, 200 MB videos").
 * Shown here only as copy so hosts understand why the dashboard image limit is lower (STU-67);
 * the limits themselves are enforced by the public site and the backend.
 */
export const GUEST_MOMENT_PHOTO_MAX_MB = 25
export const GUEST_MOMENT_VIDEO_MAX_MB = 200
export const GUEST_MOMENT_UPLOAD_LIMIT_TEXT = `Los invitados pueden subir fotos de hasta ${GUEST_MOMENT_PHOTO_MAX_MB} MB y videos de hasta ${GUEST_MOMENT_VIDEO_MAX_MB} MB.`
export const SECTION_IMAGE_UPLOAD_SCOPE_TEXT = `El límite de ${SECTION_IMAGE_UPLOAD_MAX_MB} MB es para las imágenes de la invitación (portada y secciones). ${GUEST_MOMENT_UPLOAD_LIMIT_TEXT}`

function clean(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function extensionFromFilename(filename: string): string {
  const cleanName = clean(filename)
  const dotIndex = cleanName.lastIndexOf('.')
  return dotIndex >= 0 ? cleanName.slice(dotIndex) : ''
}

export function isSupportedSectionImageUploadFile(file: Pick<File, 'name' | 'type'>): boolean {
  const contentType = clean(file.type)
  if (contentType) {
    return SECTION_IMAGE_UPLOAD_MIME_TYPES.includes(contentType as (typeof SECTION_IMAGE_UPLOAD_MIME_TYPES)[number])
  }

  const extension = extensionFromFilename(file.name)
  return SECTION_IMAGE_UPLOAD_EXTENSIONS.includes(extension as (typeof SECTION_IMAGE_UPLOAD_EXTENSIONS)[number])
}

export function sectionImageUploadValidationError(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!isSupportedSectionImageUploadFile(file)) {
    return `Solo se aceptan imágenes (${SECTION_IMAGE_UPLOAD_HELP_TEXT})`
  }

  if (Number.isFinite(file.size) && file.size <= 0) {
    return 'La imagen está vacía o no se pudo leer'
  }

  if (Number.isFinite(file.size) && file.size > SECTION_IMAGE_UPLOAD_MAX_BYTES) {
    return `La imagen no puede superar los ${SECTION_IMAGE_UPLOAD_MAX_MB} MB`
  }

  return null
}

export const SECTION_IMAGE_INVALID_CONTENT_MESSAGE = 'El archivo no es una imagen válida o está dañado. Elige otro archivo.'

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end))
}

/**
 * Checks the first bytes of the file, so a text file renamed to `.png` is
 * rejected before upload with a clear message. Returns null when the content
 * looks like a supported image or when the browser cannot read the file
 * (the backend still validates it).
 */
export async function sectionImageUploadContentError(file: Blob): Promise<string | null> {
  let bytes: Uint8Array
  try {
    if (typeof file.slice !== 'function') return null
    const head = file.slice(0, 512)
    if (typeof head.arrayBuffer !== 'function') return null
    bytes = new Uint8Array(await head.arrayBuffer())
  } catch {
    return null
  }
  if (bytes.length === 0) return SECTION_IMAGE_INVALID_CONTENT_MESSAGE

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return null // JPEG
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null // PNG
  if (ascii(bytes, 0, 4) === 'GIF8') return null // GIF
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return null // WebP
  if (ascii(bytes, 4, 8) === 'ftyp') return null // HEIC / HEIF / AVIF (ISO BMFF)

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '').trimStart().toLowerCase()
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg')) || (text.startsWith('<!--') && text.includes('<svg'))) {
    return null // SVG
  }

  return SECTION_IMAGE_INVALID_CONTENT_MESSAGE
}
