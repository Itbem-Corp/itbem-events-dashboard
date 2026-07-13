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
