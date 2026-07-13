import { mapApiListItems, withApiData } from '@/lib/api-envelope'
import { usersAllPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { normalizeKeys } from '@/lib/normalizer'
import type { AdminUserListItemResponse, AdminUserResponse } from '@/models/User'

type RecordValue = Record<string, unknown>
type UserCacheInput = (Partial<AdminUserListItemResponse> & AdminUserResponse) | AdminUserListItemResponse
type UserCacheRecord = Partial<AdminUserListItemResponse> & Partial<AdminUserResponse>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeUserCacheRecord<T extends UserCacheRecord>(user: T): T {
  const normalized = normalizeKeys(user)
  return isRecord(normalized) ? (normalized as T) : user
}

function toListUser(user: UserCacheInput, existing?: AdminUserListItemResponse): AdminUserListItemResponse {
  const normalizedUser = normalizeUserCacheRecord(user)
  const normalizedExisting = existing ? normalizeUserCacheRecord(existing) : undefined

  return {
    id: cacheRecordId(normalizedUser) || normalizedUser.id || '',
    email: normalizedUser.email ?? normalizedExisting?.email ?? '',
    first_name: normalizedUser.first_name ?? normalizedExisting?.first_name ?? '',
    last_name: normalizedUser.last_name ?? normalizedExisting?.last_name ?? '',
    is_active: normalizedUser.is_active ?? normalizedExisting?.is_active ?? false,
    is_root: normalizedUser.is_root ?? normalizedExisting?.is_root ?? false,
		root_level: normalizedUser.root_level ?? normalizedExisting?.root_level,
    created_at: normalizedUser.created_at ?? normalizedExisting?.created_at ?? '',
    clients: typeof normalizedUser.clients === 'number' ? normalizedUser.clients : (normalizedExisting?.clients ?? 0),
    profile_image: normalizedUser.profile_image ?? normalizedExisting?.profile_image,
  }
}

function mapUserListPayload(
  payload: unknown,
  mapper: (users: AdminUserListItemResponse[]) => AdminUserListItemResponse[]
): unknown {
  return mapApiListItems<AdminUserListItemResponse>(payload, mapper, { adjustTotal: true })
}

export function isUsersAllCacheKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  const basePath = usersAllPath()
  return key === basePath || key.startsWith(`${basePath}?`)
}

export function patchUserCacheValue(
  payload: unknown,
  userId: string | number,
  patch: Partial<AdminUserListItemResponse>
): unknown {
  const targetId = String(userId)
  const nextPatch = normalizeUserCacheRecord(patch)
  return mapUserListPayload(payload, (users) =>
    users.map((user) => (cacheRecordId(user) === targetId ? { ...normalizeUserCacheRecord(user), ...nextPatch } : user))
  )
}

export function upsertUserCacheValue(payload: unknown, user: UserCacheInput | null | undefined): unknown {
  const targetId = cacheRecordId(user)
  if (!targetId || !user) return payload
  const nextUser = normalizeUserCacheRecord(user)

  const updated = mapUserListPayload(payload, (users) => {
    const index = users.findIndex((item) => cacheRecordId(item) === targetId)
    if (index === -1) return [...users, toListUser(nextUser)]

    const next = [...users]
    next[index] = toListUser({ ...next[index], ...nextUser }, next[index])
    return next
  })

  return updated === payload ? withApiData(payload, [toListUser(nextUser)]) : updated
}

export function removeUsersCacheValue(payload: unknown, userIds: Iterable<string | number>): unknown {
  const ids = new Set(Array.from(userIds, (id) => String(id)))
  if (ids.size === 0) return payload

  return mapUserListPayload(payload, (users) => users.filter((user) => !ids.has(cacheRecordId(user))))
}
