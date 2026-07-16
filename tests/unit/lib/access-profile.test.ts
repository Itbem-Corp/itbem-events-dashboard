import { accessCan, createAccessProfile } from '@/lib/access-profile'
import type { ApplicationSession } from '@/models/ApplicationSession'
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

describe('access profile', () => {
  it('lets Root 1 use platform mode without an organization', () => {
    const value = session({
      user: { ...session().user, is_root: true, root_level: 1 },
    })

    const profile = createAccessProfile(value, 'platform')

    expect(profile.platformLevel).toBe('root_1')
    expect(profile.isPlatformContext).toBe(true)
    expect(profile.organizationId).toBeUndefined()
    expect(profile.canSwitchOrganizations).toBe(true)
  })

  it('keeps Root 2 inside its operational capability ceiling', () => {
    const value = session({
      user: { ...session().user, is_root: true, root_level: 2 },
      capabilities: ['session:view', 'organizations:view', 'metrics:view'],
    })

    const profile = createAccessProfile(value, 'organization', 'org-a')

    expect(profile.platformLevel).toBe('root_2')
    expect(accessCan(profile, 'metrics:view')).toBe(true)
    expect(accessCan(profile, 'organizations:manage')).toBe(false)
  })

  it('does not merge permissions from a different organization for members', () => {
    const profile = createAccessProfile(session(), 'organization', 'org-a')

    expect(profile.organizationRole).toBe('ANALYST')
    expect(accessCan(profile, 'metrics:view')).toBe(true)
    expect(accessCan(profile, 'members:manage')).toBe(false)
  })

  it('rejects platform mode for an organization member', () => {
    const profile = createAccessProfile(session(), 'platform', 'org-b')

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

    const profile = createAccessProfile(value, 'platform', 'org-a')

    expect(profile.platformLevel).toBe('none')
    expect(profile.isOrganizationContext).toBe(true)
    expect(accessCan(profile, 'members:manage')).toBe(false)
  })
})
