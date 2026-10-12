import { createAccessProfile, type AccessProfile } from '@/lib/access-profile'
import {
  applicationRoutePreloadPath,
  createApplicationNavigation,
  isGuardedPath,
  resolveApplicationRouteRedirect,
  type ApplicationNavigation,
} from '@/lib/application-navigation'
import type { ApplicationOrganization, ApplicationSession } from '@/models/ApplicationSession'
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
    const accessProfile = createAccessProfile({ session: appSession, requestedMode: 'organization', organizationId: 'org-1' })
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
      accessProfile: createAccessProfile({ session: appSession, requestedMode: 'platform' }),
      hasApplicationSession: true,
      isRoot: true,
      modules: appSession.application.modules,
      product: getProductManifest('itbem'),
    })

    expect(navigation.hasEvents).toBe(false)
    expect(navigation.canViewUsers).toBe(true)
    expect(navigation.canViewOrganizations).toBe(true)
    expect(navigation.canUseAutomation).toBe(false)
  })

  it('exposes automation only to authorized ITBEM platform users', () => {
    const appSession = session({
      application: {
        ...session().application,
        code: 'itbem',
        modules: ['home', 'users', 'organizations', 'metrics', 'automation'],
      },
      capabilities: [...session().capabilities, 'automation:view'],
    })
    const navigation = createApplicationNavigation({
      accessProfile: createAccessProfile({ session: appSession, requestedMode: 'platform' }),
      hasApplicationSession: true,
      isRoot: true,
      modules: appSession.application.modules,
      product: getProductManifest('itbem'),
    })

    expect(navigation.canUseAutomation).toBe(true)
    expect(navigation.canManageAutomationConfiguration).toBe(true)
    expect(applicationRoutePreloadPath({ href: '/automation', listsAcrossOrganizations: true })).toBe('/automation/portfolio')
    expect(applicationRoutePreloadPath({ href: '/automation/agents', listsAcrossOrganizations: true })).toBe('/automation/agents')
    expect(applicationRoutePreloadPath({ href: '/automation/dispatch', listsAcrossOrganizations: true })).toBe(
      '/automation/dispatch/queue?page_size=25'
    )
    expect(applicationRoutePreloadPath({ href: '/automation/traces', listsAcrossOrganizations: true })).toBeNull()
  })

  it('maps route intent to a bounded first request', () => {
    expect(
      applicationRoutePreloadPath({ href: '/events', clientId: 'org-1', listsAcrossOrganizations: false })
    ).toContain('client_id=org-1')
    expect(applicationRoutePreloadPath({ href: '/team', listsAcrossOrganizations: false })).toBeNull()
    expect(applicationRoutePreloadPath({ href: '/audit', listsAcrossOrganizations: true })).toContain('page_size=30')
    expect(applicationRoutePreloadPath({ href: '/automation/projects', listsAcrossOrganizations: true })).toBe(
      '/automation/portfolio'
    )
    expect(applicationRoutePreloadPath({ href: '/automation/clients', listsAcrossOrganizations: true })).toBe(
      '/automation/clients'
    )
    expect(applicationRoutePreloadPath({ href: '/automation/costs', listsAcrossOrganizations: true })).toContain(
      '/automation/costs'
    )
    expect(applicationRoutePreloadPath({ href: '/automation/settings', listsAcrossOrganizations: true })).toBeNull()
  })

  it('preloads the caller-access event list without an organization', () => {
    expect(applicationRoutePreloadPath({ href: '/events', listsAcrossOrganizations: true })).toBe(
      '/events?page=1&page_size=12&filter=all'
    )
    expect(applicationRoutePreloadPath({ href: '/events', listsAcrossOrganizations: false })).toBeNull()
    expect(applicationRoutePreloadPath({ href: '/', listsAcrossOrganizations: false })).toBeNull()
  })
})

describe('guarded paths', () => {
  it('matches whole route segments only', () => {
    for (const path of ['/audit', '/metrics', '/team', '/users', '/clients', '/automation', '/automation/settings', '/users/1/access']) {
      expect(isGuardedPath(path)).toBe(true)
    }
    for (const path of ['/', '/events', '/events/1', '/settings/profile', '/automation-bridge', '/teams']) {
      expect(isGuardedPath(path)).toBe(false)
    }
  })
})

// ─── EventiApp role x route matrix ──────────────────────────────────────────

const eventiapp = getProductManifest('eventiapp')
const ORG_A = 'organization-a'
const ORG_B = 'organization-b'

const ADMIN_CAPABILITIES = [
  'dashboard:view', 'organizations:view', 'organizations:manage', 'members:manage', 'metrics:view',
  'events:view', 'events:create', 'events:manage', 'events:delete', 'guests:manage', 'checkin:run', 'analytics:view',
]
// After be-surfaces, EventiApp sends metrics:view only for Owner/Admin.
const ROLE_CAPABILITIES: Record<string, string[]> = {
  EVENT_MANAGER: ['dashboard:view', 'organizations:view', 'events:view', 'events:create', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view'],
  EDITOR: ['dashboard:view', 'organizations:view', 'events:view', 'events:manage', 'guests:manage', 'analytics:view'],
  CHECKIN: ['dashboard:view', 'organizations:view', 'events:view', 'checkin:run'],
  ANALYST: ['dashboard:view', 'organizations:view', 'events:view', 'analytics:view'],
  MEMBER: ['dashboard:view', 'organizations:view', 'events:view', 'guests:manage'],
  VIEWER: ['dashboard:view', 'organizations:view', 'events:view'],
}
const CLIENT_CAPABILITIES = ['events:view', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view']

function membership(id: string, role: string, capabilities: string[]): ApplicationOrganization {
  return { id, name: id, code: id, access_role: role, capabilities }
}

function eventiSession(overrides: Partial<ApplicationSession>): ApplicationSession {
  return {
    application: {
      id: 'application-eventiapp',
      code: 'eventiapp',
      name: 'EventiApp',
      product_label: 'Event operations',
      modules: ['home', 'events', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    user: { id: 'user', email: 'user@example.test', first_name: 'Persona', last_name: 'Prueba', is_root: false, root_level: 0 },
    organizations: [],
    capabilities: [],
    ...overrides,
  } as ApplicationSession
}

type Persona = {
  session: ApplicationSession
  mode: 'platform' | 'organization'
  organizationId?: string
}

function member(role: string, capabilities: string[]): Persona {
  return {
    session: eventiSession({ organizations: [membership(ORG_A, role, capabilities)], capabilities }),
    mode: 'organization',
    organizationId: ORG_A,
  }
}

const personas: Record<string, Persona> = {
  root_1: {
    session: eventiSession({
      user: { id: 'root-1', email: 'root1@example.test', is_root: true, root_level: 1 } as ApplicationSession['user'],
      capabilities: [...ADMIN_CAPABILITIES, 'platform:users:view', 'audit:view'],
    }),
    mode: 'platform',
  },
  root_2: {
    session: eventiSession({
      user: { id: 'root-2', email: 'root2@example.test', is_root: true, root_level: 2 } as ApplicationSession['user'],
      capabilities: ['dashboard:view', 'organizations:view', 'platform:users:view', 'metrics:view', 'members:manage', 'events:view'],
    }),
    mode: 'platform',
  },
  owner: member('Owner', ADMIN_CAPABILITIES),
  admin: member('ADMIN', ADMIN_CAPABILITIES),
  inherited_admin: member('INHERITED_ADMIN', ADMIN_CAPABILITIES),
  event_manager: member('EVENT_MANAGER', ROLE_CAPABILITIES.EVENT_MANAGER),
  editor: member('EDITOR', ROLE_CAPABILITIES.EDITOR),
  checkin: member('CHECKIN', ROLE_CAPABILITIES.CHECKIN),
  analyst: member('ANALYST', ROLE_CAPABILITIES.ANALYST),
  member: member('Member', ROLE_CAPABILITIES.MEMBER),
  viewer: member('VIEWER', ROLE_CAPABILITIES.VIEWER),
  event_client: {
    session: eventiSession({
      organizations: [],
      capabilities: CLIENT_CAPABILITIES,
      event_access: { assigned_events: 2, capabilities: CLIENT_CAPABILITIES },
    }),
    mode: 'organization',
  },
  // Owner of organization A who is only an editor in organization B, while
  // working inside B.
  mixed_owner_in_editor_org: {
    session: eventiSession({
      organizations: [membership(ORG_A, 'OWNER', ADMIN_CAPABILITIES), membership(ORG_B, 'EDITOR', ROLE_CAPABILITIES.EDITOR)],
      capabilities: ADMIN_CAPABILITIES,
    }),
    mode: 'organization',
    organizationId: ORG_B,
  },
}

function eventiNavigation(persona: Persona): { profile: AccessProfile; navigation: ApplicationNavigation } {
  const profile = createAccessProfile({
    session: persona.session,
    requestedMode: persona.mode,
    organizationId: persona.organizationId,
    shell: eventiapp.shell,
  })
  const navigation = createApplicationNavigation({
    accessProfile: profile,
    hasApplicationSession: true,
    isRoot: Boolean(persona.session.user.is_root),
    modules: persona.session.application.modules,
    product: eventiapp,
  })
  return { profile, navigation }
}

const PATHS = ['/', '/events', '/metrics', '/team', '/audit', '/users', '/clients', '/automation', '/automation/settings'] as const

const NON_ADMIN_REDIRECTS = {
  '/': '/events',
  '/events': null,
  '/metrics': '/events',
  '/team': '/events',
  '/audit': '/events',
  '/users': '/events',
  '/clients': '/events',
  '/automation': '/events',
  '/automation/settings': '/events',
}

const ORGANIZATION_ADMIN_REDIRECTS = {
  '/': null,
  '/events': null,
  '/metrics': null,
  '/team': null,
  '/audit': '/',
  '/users': '/',
  '/clients': '/',
  '/automation': '/',
  '/automation/settings': '/',
}

const EXPECTED: Record<string, Record<(typeof PATHS)[number], string | null>> = {
  root_1: {
    '/': null,
    '/events': '/',
    '/metrics': null,
    '/team': '/',
    '/audit': null,
    '/users': '/',
    '/clients': '/',
    '/automation': '/',
    '/automation/settings': '/',
  },
  root_2: {
    '/': null,
    '/events': '/',
    '/metrics': null,
    '/team': '/',
    '/audit': '/',
    '/users': '/',
    '/clients': '/',
    '/automation': '/',
    '/automation/settings': '/',
  },
  owner: ORGANIZATION_ADMIN_REDIRECTS,
  admin: ORGANIZATION_ADMIN_REDIRECTS,
  inherited_admin: ORGANIZATION_ADMIN_REDIRECTS,
  event_manager: NON_ADMIN_REDIRECTS,
  editor: NON_ADMIN_REDIRECTS,
  checkin: NON_ADMIN_REDIRECTS,
  analyst: NON_ADMIN_REDIRECTS,
  member: NON_ADMIN_REDIRECTS,
  viewer: NON_ADMIN_REDIRECTS,
  event_client: NON_ADMIN_REDIRECTS,
  mixed_owner_in_editor_org: NON_ADMIN_REDIRECTS,
}

describe('EventiApp route policy', () => {
  for (const [name, persona] of Object.entries(personas)) {
    it(`${name}: redirects every route to a destination that does not redirect again`, () => {
      const { navigation } = eventiNavigation(persona)

      for (const pathname of PATHS) {
        const redirect = resolveApplicationRouteRedirect({
          pathname,
          navigation,
          product: eventiapp,
          organizationContextPending: false,
        })
        expect({ pathname, redirect }).toEqual({ pathname, redirect: EXPECTED[name][pathname] })
        if (redirect) {
          expect(
            resolveApplicationRouteRedirect({ pathname: redirect, navigation, product: eventiapp, organizationContextPending: false })
          ).toBeNull()
          expect(redirect).not.toBe(pathname)
        }
      }
    })
  }

  it('keeps Inicio and the workspace block for roots and organization admins only', () => {
    const expectations: Record<string, { showHome: boolean; showWorkspaceBlock: boolean; landingPath: string }> = {
      root_1: { showHome: true, showWorkspaceBlock: true, landingPath: '/' },
      root_2: { showHome: true, showWorkspaceBlock: true, landingPath: '/' },
      owner: { showHome: true, showWorkspaceBlock: true, landingPath: '/' },
      admin: { showHome: true, showWorkspaceBlock: true, landingPath: '/' },
      inherited_admin: { showHome: true, showWorkspaceBlock: true, landingPath: '/' },
      event_manager: { showHome: false, showWorkspaceBlock: false, landingPath: '/events' },
      editor: { showHome: false, showWorkspaceBlock: false, landingPath: '/events' },
      checkin: { showHome: false, showWorkspaceBlock: false, landingPath: '/events' },
      analyst: { showHome: false, showWorkspaceBlock: false, landingPath: '/events' },
      member: { showHome: false, showWorkspaceBlock: false, landingPath: '/events' },
      viewer: { showHome: false, showWorkspaceBlock: false, landingPath: '/events' },
      event_client: { showHome: false, showWorkspaceBlock: false, landingPath: '/events' },
      // Still an Owner elsewhere, so the switcher stays; B is an editor workspace.
      mixed_owner_in_editor_org: { showHome: false, showWorkspaceBlock: true, landingPath: '/events' },
    }

    for (const [name, expected] of Object.entries(expectations)) {
      const { navigation } = eventiNavigation(personas[name])
      expect({ name, ...pick(navigation) }).toEqual({ name, ...expected })
    }
  })

  it('labels the event list for client-only accounts', () => {
    expect(eventiNavigation(personas.event_client).navigation.eventsLabel).toBe('Mis eventos')
    for (const name of ['root_1', 'owner', 'event_manager', 'viewer', 'mixed_owner_in_editor_org']) {
      expect(eventiNavigation(personas[name]).navigation.eventsLabel).toBe('Eventos')
    }
  })

  it('hides metrics and team in the caller-access workspace even for an admin who selected it', () => {
    const session = eventiSession({
      organizations: [membership(ORG_A, 'ADMIN', ADMIN_CAPABILITIES)],
      capabilities: ADMIN_CAPABILITIES,
      event_access: { assigned_events: 1, capabilities: CLIENT_CAPABILITIES },
    })
    const profile = createAccessProfile({ session, requestedMode: 'organization', portfolioSelected: true, shell: eventiapp.shell })
    const navigation = createApplicationNavigation({
      accessProfile: profile,
      hasApplicationSession: true,
      isRoot: false,
      modules: session.application.modules,
      product: eventiapp,
    })

    expect(navigation.hasEvents).toBe(true)
    expect(navigation.canViewMetrics).toBe(false)
    expect(navigation.canManageMembers).toBe(false)
    expect(navigation.showHome).toBe(false)
    expect(navigation.showWorkspaceBlock).toBe(true)
    expect(resolveApplicationRouteRedirect({ pathname: '/', navigation, product: eventiapp, organizationContextPending: false })).toBe('/events')
  })

  it('waits for the organization context before moving an admin away from home', () => {
    const { navigation } = eventiNavigation({ ...personas.mixed_owner_in_editor_org, organizationId: undefined })

    expect(navigation.showHome).toBe(true)
    expect(resolveApplicationRouteRedirect({ pathname: '/', navigation, product: eventiapp, organizationContextPending: true })).toBeNull()
    expect(resolveApplicationRouteRedirect({ pathname: '/events', navigation, product: eventiapp, organizationContextPending: true })).toBeNull()
    expect(resolveApplicationRouteRedirect({ pathname: '/team', navigation, product: eventiapp, organizationContextPending: true })).toBeNull()
  })

  it('never redirects a member without event access into a loop', () => {
    const { navigation } = eventiNavigation(member('VIEWER', ['dashboard:view']))

    expect(navigation.hasEvents).toBe(false)
    expect(navigation.landingPath).toBe('/')
    expect(resolveApplicationRouteRedirect({ pathname: '/', navigation, product: eventiapp, organizationContextPending: false })).toBeNull()
    expect(resolveApplicationRouteRedirect({ pathname: '/events', navigation, product: eventiapp, organizationContextPending: false })).toBe('/')
  })
})

function pick(navigation: ApplicationNavigation) {
  return {
    showHome: navigation.showHome,
    showWorkspaceBlock: navigation.showWorkspaceBlock,
    landingPath: navigation.landingPath,
  }
}
