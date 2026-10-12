import { describe, expect, it } from 'vitest'
import { createAccessProfile } from '@/lib/access-profile'
import { canListOrganizations } from '@/lib/access-profile'
import { resolveRouteAccess, routeNeedsAccessDecision } from '@/lib/route-access'
import { getProductManifest } from '@/products/registry'
import type { ApplicationSession } from '@/models/ApplicationSession'

const ORG = 'org-1'

function session(capabilities: string[], options: { code?: string; root?: boolean; rootLevel?: number } = {}) {
  return {
    application: {
      id: 'app',
      code: options.code ?? 'eventiapp',
      name: 'App',
      product_label: 'App',
      modules: ['home', 'events', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    user: { id: 'u', email: 'u@example.test', is_root: Boolean(options.root), root_level: options.rootLevel },
    organizations: [{ id: ORG, name: 'Org', code: 'org', capabilities }],
    capabilities,
  } as unknown as ApplicationSession
}

function decide(pathname: string, capabilities: string[], options: { code?: 'eventiapp' | 'itbem' | 'cafettonhouse' } = {}) {
  const s = session(capabilities, options)
  return resolveRouteAccess({
    pathname,
    product: getProductManifest(options.code ?? 'eventiapp'),
    accessProfile: createAccessProfile(s, 'organization', ORG),
    organizationContextPending: false,
  })
}

describe('resolveRouteAccess', () => {
  it('lets an authorized role open event routes, including Studio and check-in deep links', () => {
    for (const path of ['/events', '/events/e1', '/events/e1/studio', '/events/e1/checkin']) {
      expect(decide(path, ['events:view', 'events:manage'])).toEqual({ kind: 'allow' })
    }
  })

  it('denies (without redirecting) routes the role cannot use, so the page never mounts', () => {
    expect(decide('/users', ['events:view'])).toMatchObject({ kind: 'deny' })
    expect(decide('/audit', ['events:view'])).toMatchObject({ kind: 'deny' })
    expect(decide('/metrics', ['events:view', 'checkin:run'])).toEqual({ kind: 'deny', reason: 'role' })
    expect(decide('/team', ['events:view'])).toEqual({ kind: 'deny', reason: 'role' })
  })

  it('reserves user access policies to Root 1 without mounting the page for Root 2 (ROLES-98)', () => {
    const platformRoute = (rootLevel: number, pathname: string) =>
      resolveRouteAccess({
        pathname,
        product: getProductManifest('itbem'),
        accessProfile: createAccessProfile(
          session(['platform:users:view'], { code: 'itbem', root: true, rootLevel }),
          'platform'
        ),
        organizationContextPending: false,
      })
    expect(platformRoute(1, '/users/u-2/access')).toEqual({ kind: 'allow' })
    expect(platformRoute(2, '/users/u-2/access')).toEqual({ kind: 'deny', reason: 'role' })
    expect(platformRoute(2, '/users/u-2')).toEqual({ kind: 'allow' })
    expect(platformRoute(2, '/users')).toEqual({ kind: 'allow' })
  })

  it('explains product boundaries separately from role denials', () => {
    expect(decide('/events', ['events:view'], { code: 'itbem' })).toEqual({ kind: 'deny', reason: 'product' })
    expect(decide('/automation', ['events:view'], { code: 'eventiapp' })).toEqual({ kind: 'deny', reason: 'product' })
  })

  it('keeps event and team routes mounted while a member organization is still being selected', () => {
    const s = session(['events:view'])
    const input = {
      product: getProductManifest('eventiapp'),
      accessProfile: createAccessProfile(s, 'organization', null),
      organizationContextPending: true,
    }
    expect(resolveRouteAccess({ ...input, pathname: '/events/e1' })).toEqual({ kind: 'allow' })
    expect(resolveRouteAccess({ ...input, pathname: '/team' })).toEqual({ kind: 'allow' })
  })

  it('never gates home or personal settings', () => {
    expect(routeNeedsAccessDecision('/')).toBe(false)
    expect(routeNeedsAccessDecision('/settings/profile')).toBe(false)
    expect(routeNeedsAccessDecision('/events')).toBe(true)
  })
})

describe('canListOrganizations', () => {
  it('mirrors the backend surface rule for GET /clients', () => {
    expect(canListOrganizations(null)).toBe(false)
    expect(canListOrganizations(session(['events:view', 'checkin:run']))).toBe(false)
    expect(canListOrganizations(session(['events:view']))).toBe(false)
    expect(canListOrganizations(session(['events:manage']))).toBe(true)
    expect(canListOrganizations(session(['members:manage']))).toBe(true)
    expect(canListOrganizations(session(['organizations:view']))).toBe(true)
    expect(canListOrganizations(session([], { root: true }))).toBe(true)
  })
})
