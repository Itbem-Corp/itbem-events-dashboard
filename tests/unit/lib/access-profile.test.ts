// @vitest-environment node

import { accessCan, createAccessProfile, type AccessProfile, type WorkspaceMode } from '@/lib/access-profile'
import type { ApplicationOrganization, ApplicationSession } from '@/models/ApplicationSession'
import { getProductManifest } from '@/products/registry'
import { describe, expect, it } from 'vitest'

function session(overrides: Partial<ApplicationSession> = {}): ApplicationSession {
  return {
    application: {
      id: 'app-1',
      code: 'itbem',
      name: 'ITBEM',
      product_label: 'Operations',
      modules: ['home', 'organizations', 'users', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    user: {
      id: 'user-1',
      email: 'user@example.com',
      first_name: 'User',
      last_name: 'One',
      profile_image: '',
      is_active: true,
      is_root: false,
      root_level: 0,
    },
    organizations: [
      {
        id: 'org-a',
        name: 'Organization A',
        code: 'org-a',
        access_role: 'ANALYST',
        capabilities: ['organizations:view', 'metrics:view'],
      },
      {
        id: 'org-b',
        name: 'Organization B',
        code: 'org-b',
        access_role: 'OWNER',
        capabilities: ['organizations:view', 'organizations:manage', 'members:manage'],
      },
    ],
    capabilities: ['session:view', 'organizations:view', 'organizations:manage', 'members:manage', 'metrics:view'],
    ...overrides,
  }
}

function organization(id: string, role: string, capabilities: string[]): ApplicationOrganization {
  return { id, name: `Organización ${id}`, code: id, access_role: role, capabilities }
}

function eventiSession(overrides: Partial<ApplicationSession> = {}): ApplicationSession {
  return session({
    application: {
      id: 'app-eventi',
      code: 'eventiapp',
      name: 'EventiApp',
      product_label: 'Event operations',
      modules: ['home', 'events', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    organizations: [organization('org-a', 'EDITOR', ['events:view', 'events:manage'])],
    capabilities: ['events:view', 'events:manage', 'guests:manage'],
    ...overrides,
  })
}

const eventiShell = getProductManifest('eventiapp').shell
const cafettonShell = getProductManifest('cafettonhouse').shell
const itbemShell = getProductManifest('itbem').shell

describe('access profile', () => {
  it('lets Root 1 use platform mode without an organization', () => {
    const value = session({
      user: { ...session().user, is_root: true, root_level: 1 },
    })

    const profile = createAccessProfile({ session: value, requestedMode: 'platform' })

    expect(profile.platformLevel).toBe('root_1')
    expect(profile.isPlatformContext).toBe(true)
    expect(profile.organizationId).toBeUndefined()
    expect(profile.canSwitchOrganizations).toBe(true)
    expect(profile.listsAcrossOrganizations).toBe(true)
  })

  it('keeps Root 2 inside its operational capability ceiling', () => {
    const value = session({
      user: { ...session().user, is_root: true, root_level: 2 },
      capabilities: ['session:view', 'organizations:view', 'metrics:view'],
    })

    const profile = createAccessProfile({ session: value, requestedMode: 'organization', organizationId: 'org-a' })

    expect(profile.platformLevel).toBe('root_2')
    expect(accessCan(profile, 'metrics:view')).toBe(true)
    expect(accessCan(profile, 'events:create')).toBe(false)
    expect(accessCan(profile, 'events:delete')).toBe(false)
    expect(accessCan(profile, 'organizations:manage')).toBe(false)
    expect(profile.listsAcrossOrganizations).toBe(false)
  })

  it('does not merge permissions from a different organization for members', () => {
    const profile = createAccessProfile({ session: session(), requestedMode: 'organization', organizationId: 'org-a' })

    expect(profile.organizationRole).toBe('ANALYST')
    expect(accessCan(profile, 'metrics:view')).toBe(true)
    expect(accessCan(profile, 'members:manage')).toBe(false)
  })

  it('rejects platform mode for an organization member', () => {
    const profile = createAccessProfile({ session: session(), requestedMode: 'platform', organizationId: 'org-b' })

    expect(profile.isOrganizationContext).toBe(true)
    expect(profile.organizationId).toBe('org-b')
  })

  it('treats a platform root as an organization member in a customer portal', () => {
    const value = session({
      application: {
        ...session().application,
        code: 'cafettonhouse',
        allows_platform_admin: false,
      },
      user: { ...session().user, is_root: true, root_level: 1 },
    })

    const profile = createAccessProfile({ session: value, requestedMode: 'platform', organizationId: 'org-a' })

    expect(profile.platformLevel).toBe('none')
    expect(profile.isOrganizationContext).toBe(true)
    expect(accessCan(profile, 'members:manage')).toBe(false)
  })
})

describe('EventiApp caller-access workspace', () => {
  it('forces a non-admin member into the portfolio with the session capability union', () => {
    const value = eventiSession({
      organizations: [
        organization('org-a', 'EDITOR', ['events:view', 'events:manage']),
        organization('org-b', 'CHECKIN', ['events:view', 'checkin:run']),
      ],
      capabilities: ['events:view', 'events:manage', 'checkin:run'],
    })

    // Even a persisted organization from an earlier visit is ignored: the
    // decision comes from the session alone, so it holds from the first render.
    const profile = createAccessProfile({
      session: value,
      requestedMode: 'organization',
      organizationId: 'org-a',
      shell: eventiShell,
    })

    expect(profile.isPortfolioForced).toBe(true)
    expect(profile.isPortfolioContext).toBe(true)
    expect(profile.mode).toBe('organization')
    expect(profile.isOrganizationContext).toBe(true)
    expect(profile.organizationId).toBeUndefined()
    expect(profile.organizationRole).toBeUndefined()
    expect(profile.capabilities).toEqual(['events:view', 'events:manage', 'checkin:run'])
    expect(profile.listsAcrossOrganizations).toBe(true)
    expect(profile.canShowWorkspaceBlock).toBe(false)
    expect(profile.isOrganizationAdmin).toBe(false)
    expect(profile.isEventClientOnly).toBe(false)
  })

  it.each(['OWNER', 'Owner', 'admin', 'INHERITED_ADMIN', 'Inherited_Owner'])(
    'keeps %s in organization workspaces with the switcher block',
    (role) => {
      const value = eventiSession({
        organizations: [
          organization('org-a', role, ['events:view', 'members:manage', 'metrics:view']),
          organization('org-b', 'EDITOR', ['events:view']),
        ],
      })

      const profile = createAccessProfile({
        session: value,
        requestedMode: 'organization',
        organizationId: 'org-a',
        shell: eventiShell,
      })

      expect(profile.isOrganizationAdmin).toBe(true)
      expect(profile.isPortfolioForced).toBe(false)
      expect(profile.isPortfolioContext).toBe(false)
      expect(profile.organizationId).toBe('org-a')
      expect(profile.capabilities).toEqual(['events:view', 'members:manage', 'metrics:view'])
      expect(profile.canShowWorkspaceBlock).toBe(true)
      expect(profile.listsAcrossOrganizations).toBe(false)
    }
  )

  it('enters the portfolio for an admin who also holds event grants only when selected', () => {
    const value = eventiSession({
      organizations: [organization('org-a', 'ADMIN', ['events:view', 'members:manage'])],
      capabilities: ['events:view', 'members:manage', 'guests:manage'],
      event_access: { assigned_events: 2, capabilities: ['events:view', 'guests:manage'] },
    })

    const inOrganization = createAccessProfile({
      session: value,
      requestedMode: 'organization',
      organizationId: 'org-a',
      shell: eventiShell,
    })
    const selected = createAccessProfile({
      session: value,
      requestedMode: 'organization',
      organizationId: null,
      portfolioSelected: true,
      shell: eventiShell,
    })

    expect(inOrganization.isPortfolioContext).toBe(false)
    expect(selected.isPortfolioForced).toBe(false)
    expect(selected.isPortfolioContext).toBe(true)
    expect(selected.organizationId).toBeUndefined()
    expect(selected.capabilities).toEqual(['events:view', 'members:manage', 'guests:manage'])
    expect(selected.canShowWorkspaceBlock).toBe(true)
    expect(selected.listsAcrossOrganizations).toBe(true)
  })

  it('flags an account that only holds event grants', () => {
    const value = eventiSession({
      organizations: [],
      capabilities: ['events:view', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view'],
      event_access: {
        assigned_events: 2,
        capabilities: ['events:view', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view'],
      },
    })

    const profile = createAccessProfile({ session: value, requestedMode: 'organization', shell: eventiShell })

    expect(profile.isEventClientOnly).toBe(true)
    expect(profile.isPortfolioForced).toBe(true)
    expect(profile.canShowWorkspaceBlock).toBe(false)
    expect(accessCan(profile, 'events:manage')).toBe(true)
    expect(accessCan(profile, 'events:create')).toBe(false)
  })

  it('does not treat an empty grant summary or a root as a client-only account', () => {
    const noGrants = eventiSession({ organizations: [], event_access: { assigned_events: 0, capabilities: [] } })
    const root = eventiSession({
      user: { ...eventiSession().user, is_root: true, root_level: 1 },
      organizations: [],
      event_access: { assigned_events: 3, capabilities: ['events:view'] },
    })

    expect(createAccessProfile({ session: noGrants, requestedMode: 'organization', shell: eventiShell }).isEventClientOnly).toBe(false)
    const rootProfile = createAccessProfile({ session: root, requestedMode: 'platform', shell: eventiShell })
    expect(rootProfile.isEventClientOnly).toBe(false)
    expect(rootProfile.isPortfolioForced).toBe(false)
    expect(rootProfile.canShowWorkspaceBlock).toBe(true)
  })

  it('never forces the portfolio before the session is known', () => {
    const profile = createAccessProfile({ session: null, requestedMode: 'organization', shell: eventiShell })

    expect(profile.isPortfolioForced).toBe(false)
    expect(profile.isPortfolioContext).toBe(false)
  })
})

// Copy of createAccessProfile as it was before the product shell existed
// (src/lib/access-profile.ts at 94f16b8). Products without manifest.shell must
// keep producing exactly these fields.
function legacyCreateAccessProfile(
  value: ApplicationSession | null | undefined,
  requestedMode: WorkspaceMode,
  organizationId?: string | null
) {
  const user = value?.user
  const level = !value?.application.allows_platform_admin
    ? 'none'
    : !user?.is_root && !user?.root_level
      ? 'none'
      : user.root_level === 2
        ? 'root_2'
        : 'root_1'
  const canUsePlatformMode = Boolean(value?.application.allows_platform_admin && level !== 'none')
  const selected = organizationId ? value?.organizations.find((candidate) => candidate.id === organizationId) : undefined
  const mode: WorkspaceMode =
    requestedMode === 'platform' && canUsePlatformMode
      ? 'platform'
      : organizationId
        ? 'organization'
        : canUsePlatformMode
          ? 'platform'
          : 'organization'
  const capabilities =
    mode === 'platform' || level !== 'none' ? (value?.capabilities ?? []) : (selected?.capabilities ?? [])
  return {
    platformLevel: level,
    mode,
    organizationId: mode === 'organization' ? (organizationId ?? undefined) : undefined,
    organizationRole: mode === 'organization' ? selected?.access_role : undefined,
    capabilities,
    canSwitchOrganizations: canUsePlatformMode || (value?.organizations.length ?? 0) > 1,
    canUsePlatformMode,
    isPlatformContext: mode === 'platform',
    isOrganizationContext: mode === 'organization',
  }
}

function legacyFields(profile: AccessProfile) {
  return {
    platformLevel: profile.platformLevel,
    mode: profile.mode,
    organizationId: profile.organizationId,
    organizationRole: profile.organizationRole,
    capabilities: profile.capabilities,
    canSwitchOrganizations: profile.canSwitchOrganizations,
    canUsePlatformMode: profile.canUsePlatformMode,
    isPlatformContext: profile.isPlatformContext,
    isOrganizationContext: profile.isOrganizationContext,
  }
}

describe('products without a shell policy', () => {
  const memberOfOne = session({
    application: { ...session().application, code: 'cafettonhouse', allows_platform_admin: false },
    organizations: [organization('org-a', 'MEMBER', ['organizations:view'])],
    capabilities: ['organizations:view'],
  })
  const multiOrganizationMember = session({
    application: { ...session().application, code: 'cafettonhouse', allows_platform_admin: false },
    organizations: [
      organization('org-a', 'EDITOR', ['organizations:view']),
      organization('org-b', 'CHECKIN', ['organizations:view']),
    ],
    capabilities: ['organizations:view'],
    event_access: { assigned_events: 1, capabilities: ['events:view'] },
  })
  const owner = session({
    application: { ...session().application, code: 'cafettonhouse', allows_platform_admin: false },
    organizations: [organization('org-a', 'Owner', ['organizations:view', 'members:manage', 'metrics:view'])],
  })
  const grantOnly = session({
    organizations: [],
    capabilities: ['events:view'],
    event_access: { assigned_events: 2, capabilities: ['events:view'] },
  })
  const root = session({ user: { ...session().user, is_root: true, root_level: 1 } })
  const rootTwo = session({ user: { ...session().user, is_root: true, root_level: 2 } })
  const sessions = { memberOfOne, multiOrganizationMember, owner, grantOnly, root, rootTwo, none: null }

  for (const [productName, shell] of [['cafettonhouse', cafettonShell], ['itbem', itbemShell]] as const) {
    it(`${productName} keeps today's profile for every session, mode and organization`, () => {
      expect(shell).toBeUndefined()
      for (const value of Object.values(sessions)) {
        for (const requestedMode of ['organization', 'platform'] as const) {
          for (const organizationId of [undefined, null, 'org-a', 'org-b', 'org-missing']) {
            for (const portfolioSelected of [false, true]) {
              const profile = createAccessProfile({ session: value, requestedMode, organizationId, portfolioSelected, shell })
              expect(legacyFields(profile)).toEqual(legacyCreateAccessProfile(value, requestedMode, organizationId))
              expect(profile.isPortfolioForced).toBe(false)
              expect(profile.isPortfolioContext).toBe(false)
              expect(profile.canShowWorkspaceBlock).toBe(true)
            }
          }
        }
      }
    })
  }
})
