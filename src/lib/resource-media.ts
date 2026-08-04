import { resolveBackendMediaUrl } from '@/lib/media-url'
import type { Resource } from '@/models/Resource'

export type ResourceMediaSource = Partial<Pick<Resource, 'view_url' | 'url' | 'path'>> & {
  viewUrl?: unknown
  viewURL?: unknown
  ViewURL?: unknown
  ViewUrl?: unknown
  URL?: unknown
  Path?: unknown
  object_key?: unknown
  objectKey?: unknown
  ObjectKey?: unknown
  s3_key?: unknown
  s3Key?: unknown
  S3Key?: unknown
}

function firstNonEmptyString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}

/**
 * Returns a URL that is safe to bind to an image `src` attribute.
 *
 * Resource payloads are API input, including legacy aliases, so they must not
 * be allowed to select an executable URI scheme. Upload previews use a local
 * object URL; persisted media is served through HTTP(S).
 */
export function safeResourceImageUrl(value: string | null | undefined): string {
  const candidate = value?.trim() ?? ''
  if (!candidate) return ''
  if (candidate.startsWith('blob:')) return candidate

  try {
    const url = new URL(candidate.startsWith('//') ? `https:${candidate}` : candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? candidate : ''
  } catch {
    return ''
  }
}

export function readResourceMediaUrl(
  resource: ResourceMediaSource | null | undefined,
  backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
): string {
  if (!resource) return ''

  return resolveBackendMediaUrl(
    firstNonEmptyString(
      resource.view_url,
      resource.viewUrl,
      resource.viewURL,
      resource.ViewURL,
      resource.ViewUrl,
      resource.url,
      resource.URL,
      resource.path,
      resource.Path,
      resource.object_key,
      resource.objectKey,
      resource.ObjectKey,
      resource.s3_key,
      resource.s3Key,
      resource.S3Key
    ),
    backendUrl
  )
}
