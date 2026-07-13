import { mapApiListItems, withApiData } from '@/lib/api-envelope'
import { sectionResourcesPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { getMediaRefreshDelay, getPresignedUrlExpiry } from '@/lib/signed-media'
import type { Resource, ResourceFileMutationResponse } from '@/models/Resource'

type RecordValue = Record<string, unknown>

export const RESOURCE_MEDIA_REFRESH_SKEW_MS = 60 * 1000
export { getPresignedUrlExpiry } from '@/lib/signed-media'

type ResourceMediaCacheSource = Partial<Pick<Resource, 'view_url' | 'url' | 'view_url_expires_at'>> & {
  viewUrl?: unknown
  viewURL?: unknown
  ViewURL?: unknown
  ViewUrl?: unknown
  URL?: unknown
  viewUrlExpiresAt?: unknown
  viewURLExpiresAt?: unknown
  ViewURLExpiresAt?: unknown
  ViewUrlExpiresAt?: unknown
  expires_at?: unknown
  expiresAt?: unknown
  ExpiresAt?: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function firstOptionalString(...values: unknown[]): string | undefined {
  return firstNonEmptyString(...values) || undefined
}

function firstDefinedValue(value: unknown, keys: string[]): unknown {
  if (!isRecord(value)) return undefined

  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && !candidate.trim()) continue
    if (candidate !== undefined && candidate !== null) return candidate
  }

  return undefined
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : undefined
}

function stripResourceAliasFields(resource: Resource): Resource {
  const next = { ...resource } as Resource & Record<string, unknown>
  for (const key of [
    'ID',
    'Id',
    'eventSectionId',
    'eventSectionID',
    'EventSectionID',
    'EventSectionId',
    'resourceTypeId',
    'resourceTypeID',
    'ResourceTypeID',
    'ResourceTypeId',
    'Path',
    'object_key',
    'objectKey',
    'ObjectKey',
    's3_key',
    's3Key',
    'S3Key',
    'viewUrl',
    'viewURL',
    'ViewURL',
    'ViewUrl',
    'URL',
    'viewUrlExpiresAt',
    'viewURLExpiresAt',
    'ViewURLExpiresAt',
    'ViewUrlExpiresAt',
    'expires_at',
    'expiresAt',
    'ExpiresAt',
    'altText',
    'AltText',
    'Title',
    'Position',
    'order',
    'Order',
    'sort_order',
    'sortOrder',
    'SortOrder',
  ]) {
    delete next[key]
  }
  return next
}

function mapResourceListPayload(payload: unknown, mapper: (resources: Resource[]) => Resource[]): unknown {
  return mapApiListItems<Resource>(payload, mapper, { adjustTotal: true })
}

function mergeResource(existing: Resource | undefined, incoming: Resource): Resource {
  const next = normalizeResource(incoming)

  return {
    ...existing,
    ...next,
    resource_type: next.resource_type ?? existing?.resource_type,
  }
}

function normalizeResource(resource: Resource): Resource {
  const id = firstOptionalString(firstDefinedValue(resource, ['id', 'ID', 'Id']))
  const eventSectionId = firstOptionalString(
    firstDefinedValue(resource, [
      'event_section_id',
      'eventSectionId',
      'eventSectionID',
      'EventSectionID',
      'EventSectionId',
    ])
  )
  const resourceTypeId = firstOptionalString(
    firstDefinedValue(resource, [
      'resource_type_id',
      'resourceTypeId',
      'resourceTypeID',
      'ResourceTypeID',
      'ResourceTypeId',
    ])
  )
  const path = firstOptionalString(
    firstDefinedValue(resource, ['path', 'Path', 'object_key', 'objectKey', 'ObjectKey', 's3_key', 's3Key', 'S3Key'])
  )
  const viewUrl = firstOptionalString(
    firstDefinedValue(resource, ['view_url', 'viewUrl', 'viewURL', 'ViewURL', 'ViewUrl', 'url', 'URL'])
  )
  const url = firstOptionalString(firstDefinedValue(resource, ['url', 'URL']))
  const viewUrlExpiresAt = firstOptionalString(
    firstDefinedValue(resource, [
      'view_url_expires_at',
      'viewUrlExpiresAt',
      'viewURLExpiresAt',
      'ViewURLExpiresAt',
      'ViewUrlExpiresAt',
      'expires_at',
      'expiresAt',
      'ExpiresAt',
    ])
  )
  const altText = firstOptionalString(firstDefinedValue(resource, ['alt_text', 'altText', 'AltText']))
  const title = firstOptionalString(firstDefinedValue(resource, ['title', 'Title', 'alt_text', 'altText', 'AltText']))
  const position = normalizeNumber(
    firstDefinedValue(resource, ['position', 'Position', 'order', 'Order', 'sort_order', 'sortOrder', 'SortOrder'])
  )

  return {
    ...stripResourceAliasFields(resource),
    ...(id !== undefined ? { id } : {}),
    ...(eventSectionId !== undefined ? { event_section_id: eventSectionId } : {}),
    ...(resourceTypeId !== undefined ? { resource_type_id: resourceTypeId } : {}),
    ...(path !== undefined ? { path } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(viewUrl !== undefined ? { view_url: viewUrl } : {}),
    ...(viewUrlExpiresAt !== undefined ? { view_url_expires_at: viewUrlExpiresAt } : {}),
    ...(altText !== undefined ? { alt_text: altText } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(position !== undefined ? { position } : {}),
  }
}

function resourcePosition(resource: Resource): number {
  const position = normalizeNumber(resource.position)
  return position ?? 0
}

export function compareResourcesByRenderOrder(a: Resource, b: Resource): number {
  const positionDiff = resourcePosition(a) - resourcePosition(b)
  if (positionDiff !== 0) return positionDiff
  return cacheRecordId(a).localeCompare(cacheRecordId(b))
}

export function sortResourcesByRenderOrder(resources: Resource[]): Resource[] {
  return [...resources].sort(compareResourcesByRenderOrder)
}

export function isSectionResourcesCacheKey(key: unknown, sectionId: string | number): key is string {
  return key === sectionResourcesPath(sectionId)
}

function resourceMediaUrl(resource: ResourceMediaCacheSource): string | undefined {
  return firstOptionalString(
    resource.view_url,
    resource.viewUrl,
    resource.viewURL,
    resource.ViewURL,
    resource.ViewUrl,
    resource.url,
    resource.URL
  )
}

function resourceMediaExpiresAt(resource: ResourceMediaCacheSource): string | undefined {
  return firstOptionalString(
    resource.view_url_expires_at,
    resource.viewUrlExpiresAt,
    resource.viewURLExpiresAt,
    resource.ViewURLExpiresAt,
    resource.ViewUrlExpiresAt,
    resource.expires_at,
    resource.expiresAt,
    resource.ExpiresAt
  )
}

export function getResourceMediaExpiry(resource: ResourceMediaCacheSource): Date | null {
  const expiresAt = resourceMediaExpiresAt(resource)
  if (expiresAt) {
    const explicitExpiry = new Date(expiresAt)
    if (!Number.isNaN(explicitExpiry.getTime())) return explicitExpiry
  }
  return getPresignedUrlExpiry(resourceMediaUrl(resource))
}

export function getSectionResourcesRefreshDelay(
  resources: ResourceMediaCacheSource[],
  now = Date.now(),
  skewMs = RESOURCE_MEDIA_REFRESH_SKEW_MS
): number | null {
  return getMediaRefreshDelay(
    resources.map((resource) => getResourceMediaExpiry(resource)),
    now,
    skewMs
  )
}

export function sectionResourcesMediaRefreshKey(
  resources: ResourceMediaCacheSource[]
): string {
  return resources.map((resource) => [resourceMediaUrl(resource) ?? '', resourceMediaExpiresAt(resource) ?? ''].join(':')).join('|')
}

export function upsertResourceCacheValue(payload: unknown, resource: Resource | null | undefined): unknown {
  const targetId = cacheRecordId(resource)
  if (!targetId || !resource) return payload
  const nextResource = normalizeResource(resource)

  const updated = mapResourceListPayload(payload, (resources) => {
    const index = resources.findIndex((item) => cacheRecordId(item) === targetId)
    if (index === -1) return sortResourcesByRenderOrder([...resources, nextResource])

    const next = [...resources]
    next[index] = mergeResource(next[index], nextResource)
    return sortResourcesByRenderOrder(next)
  })

  return updated === payload ? withApiData(payload, [nextResource]) : updated
}

export function patchResourceFileCacheValue(payload: unknown, resourceId: string | number, file: unknown): unknown {
  const filePatch = normalizeResourceFileMutation(file)
  if (!filePatch) return payload
  const targetId = String(resourceId)

  return mapResourceListPayload(payload, (resources) =>
    resources.map((resource) => {
      if (cacheRecordId(resource) !== targetId) return resource

      return {
        ...resource,
        path: filePatch.path || resource.path,
        url: filePatch.url || filePatch.view_url || resource.url,
        view_url: filePatch.view_url || filePatch.url || resource.view_url,
        view_url_expires_at: filePatch.view_url_expires_at ?? resource.view_url_expires_at,
      }
    })
  )
}

export function hasResourceFileMutationData(file: unknown): boolean {
  return normalizeResourceFileMutation(file) !== null
}

function normalizeResourceFileMutation(file: unknown): ResourceFileMutationResponse | null {
  if (!isRecord(file)) return null
  const viewUrl = firstOptionalString(file.view_url, file.viewUrl, file.viewURL, file.ViewURL, file.ViewUrl)
  const url = firstOptionalString(file.url, file.URL)
  const path = firstOptionalString(
    file.path,
    file.Path,
    file.object_key,
    file.objectKey,
    file.ObjectKey,
    file.s3_key,
    file.s3Key,
    file.S3Key
  )
  const viewUrlExpiresAt = firstOptionalString(
    file.view_url_expires_at,
    file.viewUrlExpiresAt,
    file.viewURLExpiresAt,
    file.ViewURLExpiresAt,
    file.ViewUrlExpiresAt,
    file.expires_at,
    file.expiresAt,
    file.ExpiresAt
  )

  if (!viewUrl && !url && !path) return null

  return {
    path: path ?? '',
    url,
    view_url: viewUrl ?? url ?? '',
    view_url_expires_at: viewUrlExpiresAt,
  }
}

export function removeResourceCacheValue(payload: unknown, resourceId: string | number): unknown {
  const targetId = String(resourceId)
  return mapResourceListPayload(payload, (resources) =>
    resources.filter((resource) => cacheRecordId(resource) !== targetId)
  )
}
