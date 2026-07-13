import { normalizeBackendBaseUrl } from '@/lib/base-url'

function isAbsoluteUrl(value: string): boolean {
  return value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)
}

export function resolveBackendMediaUrl(
  mediaPath: string | null | undefined,
  backendUrl: string | null | undefined
): string {
  const raw = mediaPath?.trim() ?? ''
  if (!raw) return ''
  if (isAbsoluteUrl(raw)) return raw

  const base = normalizeBackendBaseUrl(backendUrl, '')
  if (!base) return raw

  const cleanPath = raw.replace(/^\/+/, '')
  const storagePath = cleanPath.startsWith('storage/') ? cleanPath : `storage/${cleanPath}`
  return new URL(storagePath, `${base}/`).toString()
}

function mediaPathname(value: string | null | undefined): string {
  const raw = value?.trim() ?? ''
  if (!raw) return ''

  try {
    return decodeURIComponent(new URL(raw).pathname)
  } catch {
    return raw
  }
}

export function isBackendVideoMediaUrl(value: string | null | undefined): boolean {
  const pathname = mediaPathname(value)
  return /\.(mp4|webm|mov|avi|mkv|m4v|3gp)([?#]|$)/i.test(pathname)
}

export function isBackendVideoContentType(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase().startsWith('video/') ?? false
}

export function isBackendVideoMedia(
  mediaPath: string | null | undefined,
  contentType?: string | null
): boolean {
  return isBackendVideoContentType(contentType) || isBackendVideoMediaUrl(mediaPath)
}

export function isRawMomentMediaPath(value: string | null | undefined): boolean {
  const pathname = mediaPathname(value).replace(/\\/g, '/')
  return /(^|\/)raw\//i.test(pathname) || /\/raw\//i.test(pathname)
}
