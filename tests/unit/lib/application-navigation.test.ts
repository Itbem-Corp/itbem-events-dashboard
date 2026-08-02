import { createAccessProfile } from '@/lib/access-profile'
import { applicationRoutePreloadPath, createApplicationNavigation } from '@/lib/application-navigation'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { getProductManifest } from '@/products/registry'
import { describe, expect, it } from 'vitest'

function session(overrides?: Partial<ApplicationSession>): ApplicationSession {
  return {
    user: { id: 'root', email: 'root@example.com', is_root: true, root_level: 1 },
    application: {
      id: 'app',
      code: 'eventiapp',
      name: 'EventiApp',
      product_label: 'Event operations',
      modules: ['home', 'events', 'metrics'],
      allows_platform_admin: true,
    },
    capabilities: [
      'events:view',
      'members:manage',
      'metrics:view',
      'platform:users:view',
      'organizations:view',
      'audit:view',
    ],
    organizations: [],
    ...overrides,
  } as ApplicationSession
}

describe('application navigation contract', () => {
  it('keeps EventiApp event routes inside organization workspaces', () => {
    const appSession = session({
      organizations: [
        { id: 'org-1', code: 'demo', name: 'Demo', access_role: 'ADMIN', capabilities: ['events:view', 'members:manage'] },
      ],
    })
    const accessProfile = createAccessProfile(appSession, 'organization', 'org-1')
    const navigation = createApplicationNavigation({
      accessProfile,
      hasApplicationSession: true,
      isRoot: true,
      modules: appSession.application.modules,
      product: getProductManifest('eventiapp'),
    })

    expect(navigation.hasEvents).toBe(true)
    expect(navigation.canManageMembers).toBe(true)
    expect(navigation.canViewUsers).toBe(false)
  })

  it('never exposes EventiApp routes in the ITBEM control plane', () => {
    const appSession = session({
      application: {
        ...session().application,
        code: 'itbem',
        modules: ['home', 'users', 'organizations', 'metrics'],
      },
    })
    const navigation = createApplicationNavigation({
      accessProfile: createAccessProfile(appSession, 'platform'),
      hasApplicationSession: true,
      isRoot: true,
      modules: appSession.application.modules,
      product: getProductManifest('itbem'),
    })

    expect(navigation.hasEvents).toBe(false)
    expect(navigation.canViewUsers).toBe(true)
    expect(navigation.canViewOrganizations).toBe(true)
  })

  it('maps route intent to a bounded first request', () => {
    expect(applicationRoutePreloadPath({ href: '/events', clientId: 'org-1', isRoot: false })).toContain(
      'client_id=org-1'
    )
    expect(applicationRoutePreloadPath({ href: '/team', isRoot: false })).toBeNull()
    expect(applicationRoutePreloadPath({ href: '/audit', isRoot: true })).toContain('page_size=30')
  })
})
