import { accessCan, createAccessProfile, type AccessProfile, type WorkspaceMode } from '@/lib/access-profile'
import { createApplicationNavigation, resolveApplicationRouteRedirect } from '@/lib/application-navigation'
import type { ApplicationOrganization, ApplicationSession } from '@/models/ApplicationSession'
import {
  productSupportsFeature,
  productSupportsPath,
  type ProductManifest,
} from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { describe, expect, it } from 'vitest'

// Fixture: the route rules app-layout-client.tsx applied at 94f16b8
// (lines 42-68 and 70-127), minus the dead /sub-clients rule. They computed
// their own flags from the access profile and returned the first redirect.
function legacyRedirect(
  pathname: string,
  accessProfile: AccessProfile,
  product: ProductManifest,
  organizationContextPending: boolean
): string | null {
  const canViewEvents =
    productSupportsFeature(product, 'events') &&
    accessProfile.isOrganizationContext &&
    accessCan(accessProfile, 'events:view')
  const canViewUsers =
    productSupportsFeature(product, 'users') &&
    accessProfile.isPlatformContext &&
    accessCan(accessProfile, 'platform:users:view')
  const canViewOrganizations =
    productSupportsFeature(product, 'organizations') &&
    accessProfile.isPlatformContext &&
    accessCan(accessProfile, 'organizations:view')
  const canManageMembers =
    productSupportsFeature(product, 'team') &&
    accessProfile.isOrganizationContext &&
    accessCan(accessProfile, 'members:manage')
  const canViewMetrics = productSupportsFeature(product, 'metrics') && accessCan(accessProfile, 'metrics:view')
  const canViewAudit =
    productSupportsFeature(product, 'audit') && accessProfile.isPlatformContext && accessCan(accessProfile, 'audit:view')
  const canUseAutomation =
    productSupportsFeature(product, 'automation') &&
    accessProfile.isPlatformContext &&
    (accessCan(accessProfile, 'automation:view') || accessCan(accessProfile, 'automation:manage'))
  const canManageAutomationConfiguration = canUseAutomation && accessProfile.platformLevel === 'root_1'

  if (!productSupportsPath(product, pathname)) return '/'
  if (pathname.startsWith('/events') && !organizationContextPending && !canViewEvents) return '/'
  if (pathname.startsWith('/clients') && !canViewOrganizations) return '/'
  if (pathname.startsWith('/users') && !canViewUsers) return '/'
  if (pathname.startsWith('/metrics') && !canViewMetrics) return '/'
  if (pathname.startsWith('/audit') && !canViewAudit) return '/'
  if (pathname.startsWith('/automation/settings') && !canManageAutomationConfiguration) return '/automation'
  if (pathname.startsWith('/automation') && !canUseAutomation) return '/'
  if (pathname.startsWith('/team') && !organizationContextPending && !canManageMembers) return '/'
  return null
}

// Where the old rules finally left the user after following every hop.
function legacyDestination(
  pathname: string,
  accessProfile: AccessProfile,
  product: ProductManifest,
  organizationContextPending: boolean
): string | null {
  let current = pathname
  for (let hop = 0; hop < 5; hop += 1) {
    const next = legacyRedirect(current, accessProfile, product, organizationContextPending)
    if (!next || next === current) return current === pathname ? null : current
    current = next
  }
  throw new Error(`legacy redirect loop from ${pathname}`)
}

function membership(id: string, role: string, capabilities: string[]): ApplicationOrganization {
  return { id, name: id, code: id, access_role: role, capabilities }
}

function productSession(product: ProductManifest, overrides: Partial<ApplicationSession>): ApplicationSession {
  return {
    application: {
      id: `application-${product.code}`,
      code: product.code,
      name: product.identity.name,
      product_label: product.identity.productLabel,
      modules: [...product.backendModules],
      // Cafetton House is a customer portal: roots act as members there.
      allows_platform_admin: product.code !== 'cafettonhouse',
      is_active: true,
    },
    user: { id: 'user', email: 'user@example.test', first_name: 'Persona', last_name: 'Prueba', is_root: false, root_level: 0 },
    organizations: [],
    capabilities: [],
    ...overrides,
  } as ApplicationSession
}

const ORGANIZATION_ADMIN = ['organizations:view', 'organizations:manage', 'members:manage', 'metrics:view', 'dashboard:view']
const ROLE_CAPABILITIES: Record<string, string[]> = {
  OWNER: ORGANIZATION_ADMIN,
  Admin: ORGANIZATION_ADMIN,
  INHERITED_ADMIN: ORGANIZATION_ADMIN,
  EVENT_MANAGER: ['organizations:view', 'metrics:view', 'dashboard:view'],
  EDITOR: ['organizations:view', 'metrics:view'],
  CHECKIN: ['organizations:view'],
  ANALYST: ['organizations:view', 'metrics:view'],
  MEMBER: ['organizations:view'],
  GUEST: ['organizations:view'],
}
const ROOT_CAPABILITIES = [
  'organizations:view', 'organizations:manage', 'platform:users:view', 'platform:users:manage', 'metrics:view',
  'members:manage', 'audit:view', 'automation:view', 'automation:manage',
]

type State = {
  name: string
  session: ApplicationSession | null
  mode: WorkspaceMode
  organizationId?: string
  pending: boolean
}

function states(product: ProductManifest): State[] {
  const result: State[] = [{ name: 'no session', session: null, mode: 'organization', pending: false }]

  for (const [rootLevel, capabilities] of [
    [1, ROOT_CAPABILITIES],
    [2, ['organizations:view', 'platform:users:view', 'metrics:view', 'members:manage']],
    [1, ['organizations:view']], // Root 1 without automation capabilities
  ] as const) {
    const session = productSession(product, {
      user: { id: `root-${rootLevel}`, email: 'root@example.test', is_root: true, root_level: rootLevel } as ApplicationSession['user'],
      organizations: [membership('org-a', 'OWNER', ORGANIZATION_ADMIN)],
      capabilities: [...capabilities],
    })
    result.push({ name: `root_${rootLevel} platform`, session, mode: 'platform', pending: false })
    result.push({ name: `root_${rootLevel} in org`, session, mode: 'organization', organizationId: 'org-a', pending: false })
  }

  for (const [role, capabilities] of Object.entries(ROLE_CAPABILITIES)) {
    const single = productSession(product, { organizations: [membership('org-a', role, capabilities)], capabilities })
    const multiple = productSession(product, {
      organizations: [membership('org-a', role, capabilities), membership('org-b', 'MEMBER', ['organizations:view'])],
      capabilities,
    })
    result.push({ name: `${role} in org`, session: single, mode: 'organization', organizationId: 'org-a', pending: false })
    result.push({ name: `${role} pending`, session: single, mode: 'organization', pending: true })
    result.push({ name: `${role} of two orgs`, session: multiple, mode: 'organization', organizationId: 'org-a', pending: false })
  }
  return result
}

const PATHS = [
  '/', '/events', '/events/event-1', '/events/event-1/studio', '/metrics', '/team', '/audit', '/users', '/users/u-1/access',
  '/clients', '/automation', '/automation/projects', '/automation/settings', '/settings/profile', '/orders', '/unknown',
]

describe('route policy parity for products without a shell', () => {
  for (const code of ['cafettonhouse', 'itbem'] as const) {
    const product = getProductManifest(code)

    it(`${code} sends every role to the same destination as before`, () => {
      expect(product.shell).toBeUndefined()
      let redirects = 0

      for (const state of states(product)) {
        const accessProfile = createAccessProfile({
          session: state.session,
          requestedMode: state.mode,
          organizationId: state.organizationId,
          shell: product.shell,
        })
        // Once the profile is loaded, the layout routes with session semantics
        // (a missing session grants nothing), exactly as the old rules did.
        const navigation = createApplicationNavigation({
          accessProfile,
          hasApplicationSession: true,
          isRoot: Boolean(state.session?.user.is_root),
          modules: state.session?.application.modules ?? product.backendModules,
          product,
        })

        for (const pathname of PATHS) {
          const redirect = resolveApplicationRouteRedirect({
            pathname,
            navigation,
            product,
            organizationContextPending: state.pending,
          })
          expect({ state: state.name, pathname, redirect }).toEqual({
            state: state.name,
            pathname,
            redirect: legacyDestination(pathname, accessProfile, product, state.pending),
          })
          if (redirect) {
            redirects += 1
            expect(
              resolveApplicationRouteRedirect({ pathname: redirect, navigation, product, organizationContextPending: state.pending }),
              `${state.name}: ${pathname} -> ${redirect} redirects again`
            ).toBeNull()
          }
        }

        expect(navigation.showHome).toBe(true)
        expect(navigation.landingPath).toBe('/')
        expect(navigation.showWorkspaceBlock).toBe(true)
        expect(navigation.eventsLabel).toBe('Eventos')
      }

      // The matrix must exercise real denials, not only allowed routes.
      expect(redirects).toBeGreaterThan(100)
    })
  }
})
