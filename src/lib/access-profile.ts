import type { ApplicationSession } from '@/models/ApplicationSession'
import type { ProductShellPolicy } from '@/products/core/product-manifest'

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
  /** Any session organization grants OWNER or ADMIN (direct or inherited). */
  isOrganizationAdmin: boolean
  /** No organization membership, only event grants (event clients). */
  isEventClientOnly: boolean
  /**
   * The product's shell requires the caller-access workspace for this user
   * (a non-root without Owner/Admin). Derived from the session alone, so it
   * is already true on the first render after the session arrives.
   */
  isPortfolioForced: boolean
  /** Organization mode without an organization ID: the caller-access list. */
  isPortfolioContext: boolean
  /** The sidebar shows the workspace block (switcher or assigned card). */
  canShowWorkspaceBlock: boolean
  /** Event lists may be requested without client_id. */
  listsAcrossOrganizations: boolean
  /** The product shell uses the caller-access workspace for members. */
  usesCallerAccessWorkspace: boolean
}

export type AccessProfileInput = {
  session: ApplicationSession | null | undefined
  requestedMode: WorkspaceMode
  organizationId?: string | null
  /** The user chose the caller-access workspace ('Eventos asignados'). */
  portfolioSelected?: boolean
  /** The active product's shell policy; undefined keeps today's behaviour. */
  shell?: ProductShellPolicy
}

const ORGANIZATION_ADMIN_ROLES = new Set(['OWNER', 'ADMIN'])

/** Upper-cases a session role code and strips the INHERITED_ prefix. */
export function normalizeOrganizationRole(role: string | null | undefined): string {
  return (role ?? '').trim().toUpperCase().replace(/^INHERITED_/, '')
}

export function isOrganizationAdminRole(role: string | null | undefined): boolean {
  return ORGANIZATION_ADMIN_ROLES.has(normalizeOrganizationRole(role))
}

function platformLevel(session: ApplicationSession | null | undefined): PlatformLevel {
  const user = session?.user
  if (!session?.application.allows_platform_admin) return 'none'
  if (!user?.is_root && !user?.root_level) return 'none'
  if (user.root_level === 2) return 'root_2'
  return 'root_1'
}

export function createAccessProfile({
  session,
  requestedMode,
  organizationId,
  portfolioSelected = false,
  shell,
}: AccessProfileInput): AccessProfile {
  const level = platformLevel(session)
  const canUsePlatformMode = Boolean(session?.application.allows_platform_admin && level !== 'none')
  const organizations = session?.organizations ?? []
  const canSwitchOrganizations = canUsePlatformMode || organizations.length > 1
  const isOrganizationAdmin = organizations.some((candidate) => isOrganizationAdminRole(candidate.access_role))
  const isEventClientOnly =
    level === 'none' && organizations.length === 0 && (session?.event_access?.assigned_events ?? 0) > 0
  const callerAccessShell = shell?.memberWorkspace === 'caller-access'
  const isPortfolioForced = callerAccessShell && level === 'none' && !isOrganizationAdmin && Boolean(session)
  const isPortfolioContext =
    isPortfolioForced || (callerAccessShell && level === 'none' && Boolean(session) && portfolioSelected)
  const canShowWorkspaceBlock =
    shell?.workspaceSwitcher === 'organization-admins' ? level !== 'none' || isOrganizationAdmin : true
  const shellFlags = {
    isOrganizationAdmin,
    isEventClientOnly,
    isPortfolioForced,
    isPortfolioContext,
    canShowWorkspaceBlock,
    usesCallerAccessWorkspace: callerAccessShell,
  }

  if (isPortfolioContext) {
    // Caller-access scope: organization mode with no organization ID. The
    // backend answers with everything the caller's memberships and grants
    // allow and authorizes each write per resource, so the dashboard uses the
    // top-level capability union only to decide which controls to offer.
    // The list is as narrow as the backend's user-scoped query, which must
    // keep only session-eligible organizations (docs/auth.md, release
    // prerequisite); the dashboard cannot narrow it.
    return {
      platformLevel: level,
      mode: 'organization',
      organizationId: undefined,
      organizationRole: undefined,
      capabilities: session?.capabilities ?? [],
      canSwitchOrganizations,
      canUsePlatformMode,
      isPlatformContext: false,
      isOrganizationContext: true,
      ...shellFlags,
      listsAcrossOrganizations: true,
    }
  }

  const organization = organizationId
    ? organizations.find((candidate) => candidate.id === organizationId)
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
    canSwitchOrganizations,
    canUsePlatformMode,
    isPlatformContext: mode === 'platform',
    isOrganizationContext: mode === 'organization',
    ...shellFlags,
    listsAcrossOrganizations: mode === 'platform' && level !== 'none',
  }
}

export function accessCan(profile: AccessProfile, capability: string): boolean {
  return profile.capabilities.includes(capability)
}
