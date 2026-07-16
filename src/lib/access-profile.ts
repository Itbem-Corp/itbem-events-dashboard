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
