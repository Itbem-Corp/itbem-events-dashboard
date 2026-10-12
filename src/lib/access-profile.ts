import type { ApplicationSession } from '@/models/ApplicationSession'

export type PlatformLevel = 'root_1' | 'root_2' | 'none'
export type WorkspaceMode = 'platform' | 'organization'

export interface AccessProfile {
  platformLevel: PlatformLevel
  mode: WorkspaceMode
  organizationId?: string
  organizationRole?: string
  capabilities: string[]
  canSwitchOrganizations: boolean
  canUsePlatformMode: boolean
  isPlatformContext: boolean
  isOrganizationContext: boolean
}

function platformLevel(session: ApplicationSession | null | undefined): PlatformLevel {
  const user = session?.user
  if (!session?.application.allows_platform_admin) return 'none'
  if (!user?.is_root && !user?.root_level) return 'none'
  if (user.root_level === 2) return 'root_2'
  return 'root_1'
}

export function createAccessProfile(
  session: ApplicationSession | null | undefined,
  requestedMode: WorkspaceMode,
  organizationId?: string | null
): AccessProfile {
  const level = platformLevel(session)
  const canUsePlatformMode = Boolean(session?.application.allows_platform_admin && level !== 'none')
  const organization = organizationId
    ? session?.organizations.find((candidate) => candidate.id === organizationId)
    : undefined
  const mode: WorkspaceMode =
    requestedMode === 'platform' && canUsePlatformMode
      ? 'platform'
      : organizationId
        ? 'organization'
        : canUsePlatformMode
          ? 'platform'
          : 'organization'

  // Platform roots may enter any organization even when it is not an explicit
  // membership. Their server-side ceiling still applies. Ordinary members use
  // only the capabilities attached to the selected organization.
  const capabilities =
    mode === 'platform' || level !== 'none' ? (session?.capabilities ?? []) : (organization?.capabilities ?? [])

  return {
    platformLevel: level,
    mode,
    organizationId: mode === 'organization' ? (organizationId ?? undefined) : undefined,
    organizationRole: mode === 'organization' ? organization?.access_role : undefined,
    capabilities,
    canSwitchOrganizations: canUsePlatformMode || (session?.organizations.length ?? 0) > 1,
    canUsePlatformMode,
    isPlatformContext: mode === 'platform',
    isOrganizationContext: mode === 'organization',
  }
}

export function accessCan(profile: AccessProfile, capability: string): boolean {
  return profile.capabilities.includes(capability)
}

// Mirrors the backend surface rule for GET /api/clients
// (organizations:view | members:manage | events:manage on the session).
const ORGANIZATION_LIST_CAPABILITIES = ['organizations:view', 'members:manage', 'events:manage']

/**
 * Whether the session may read the organization list endpoint. Roles such as
 * check-in, analyst, member or viewer cannot (403); their eligible
 * organizations already come in the verified session itself.
 */
export function canListOrganizations(session: ApplicationSession | null | undefined): boolean {
  if (!session) return false
  if (platformLevel(session) !== 'none') return true
  return session.capabilities.some((capability) => ORGANIZATION_LIST_CAPABILITIES.includes(capability))
}

/**
 * Keeps an organization list page inside the verified session. GET /api/clients
 * returns the caller's whole subtree, which can include the portals of other
 * products (ITBEM, Cafetton House inside an EventiApp session). The backend only
 * issues an organization context for `session.organizations`, so anything else
 * would be offered and then rejected with 403.
 */
export function scopeOrganizationsToSession<P extends { data: Array<{ id: string }>; total: number }>(
  page: P | undefined,
  session: ApplicationSession | null | undefined
): P | undefined {
  if (!page || !session) return page
  const allowed = new Set(session.organizations.map((organization) => organization.id))
  const data = page.data.filter((organization) => allowed.has(organization.id))
  const removed = page.data.length - data.length
  if (removed === 0) return page
  return { ...page, data, total: Math.max(data.length, page.total - removed) }
}
