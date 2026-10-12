import { expect, test, type BrowserContext, type Page, type Request, type Route } from '@playwright/test'

type PersonaName =
  | 'root_1'
  | 'root_2'
  | 'owner'
  | 'admin'
  | 'event_manager'
  | 'editor'
  | 'checkin'
  | 'analyst'
  | 'member'
  | 'viewer'
  | 'event_client'

interface Persona {
  name: PersonaName
  rootLevel: 0 | 1 | 2
  role?: string
  capabilities: string[]
  expectedHeading: string
  /** Roots and Owner/Admin land on Inicio; every other EventiApp role on the event list. */
  landing: '/' | '/events'
  /** The sidebar workspace block (switcher or assigned organization). */
  workspaceBlock: boolean
  /** Holds event grants without an organization membership. */
  eventClient?: boolean
  primaryAction?: string
}

const event = {
  id: 'event-persona',
  name: 'Evento de prueba por rol',
  identifier: 'evento-prueba-rol',
  is_active: true,
  event_date_time: '2026-12-10T18:00:00.000Z',
  timezone: 'America/Mexico_City',
  event_type_id: 'type-1',
  client_id: 'organization-1',
}

const organization = {
  id: 'organization-1',
  name: 'Organización Persona',
  code: 'eventiapp',
  is_active: true,
  client_type_id: 'type-client',
  client_type: { id: 'type-client', code: 'CUSTOMER', name: 'Cliente' },
}

const CLIENT_CAPABILITIES = ['events:view', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view']

// EventiApp sends metrics:view only to roots and Owner/Admin (backend R3).
const personas: Persona[] = [
  {
    name: 'root_1',
    rootLevel: 1,
    capabilities: [
      'dashboard:view', 'organizations:view', 'organizations:manage', 'platform:users:view',
      'platform:users:manage', 'metrics:view', 'members:manage', 'events:view', 'events:create',
      'events:manage', 'events:delete', 'guests:manage', 'checkin:run', 'analytics:view', 'audit:view',
    ],
    expectedHeading: 'Operación de plataforma',
    landing: '/',
    workspaceBlock: true,
  },
  {
    name: 'root_2',
    rootLevel: 2,
    capabilities: [
      'dashboard:view', 'organizations:view', 'platform:users:view', 'platform:users:support',
      'metrics:view', 'members:manage', 'events:view', 'guests:manage', 'checkin:run', 'analytics:view',
    ],
    expectedHeading: 'Centro de soporte',
    landing: '/',
    workspaceBlock: true,
  },
  {
    name: 'owner',
    rootLevel: 0,
    role: 'OWNER',
    capabilities: [
      'dashboard:view', 'organizations:view', 'organizations:manage', 'members:manage', 'metrics:view',
      'events:view', 'events:create', 'events:manage', 'events:delete', 'guests:manage', 'checkin:run', 'analytics:view',
    ],
    expectedHeading: 'Organización Persona',
    landing: '/',
    workspaceBlock: true,
  },
  {
    name: 'admin',
    rootLevel: 0,
    role: 'ADMIN',
    capabilities: [
      'dashboard:view', 'organizations:view', 'organizations:manage', 'members:manage', 'metrics:view',
      'events:view', 'events:create', 'events:manage', 'events:delete', 'guests:manage', 'checkin:run', 'analytics:view',
    ],
    expectedHeading: 'Organización Persona',
    landing: '/',
    workspaceBlock: true,
  },
  {
    name: 'event_manager',
    rootLevel: 0,
    role: 'EVENT_MANAGER',
    capabilities: [
      'dashboard:view', 'organizations:view', 'events:view', 'events:create',
      'events:manage', 'guests:manage', 'checkin:run', 'analytics:view',
    ],
    expectedHeading: 'Eventos',
    landing: '/events',
    workspaceBlock: false,
  },
  {
    name: 'editor',
    rootLevel: 0,
    role: 'EDITOR',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view', 'events:manage', 'guests:manage', 'analytics:view'],
    expectedHeading: 'Eventos',
    landing: '/events',
    workspaceBlock: false,
  },
  {
    name: 'checkin',
    rootLevel: 0,
    role: 'CHECKIN',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view', 'checkin:run'],
    expectedHeading: 'Eventos',
    landing: '/events',
    workspaceBlock: false,
  },
  {
    name: 'analyst',
    rootLevel: 0,
    role: 'ANALYST',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view', 'analytics:view'],
    expectedHeading: 'Eventos',
    landing: '/events',
    workspaceBlock: false,
  },
  {
    name: 'member',
    rootLevel: 0,
    role: 'MEMBER',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view', 'guests:manage'],
    expectedHeading: 'Eventos',
    landing: '/events',
    workspaceBlock: false,
  },
  {
    name: 'viewer',
    rootLevel: 0,
    role: 'VIEWER',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view'],
    expectedHeading: 'Eventos',
    landing: '/events',
    workspaceBlock: false,
  },
  {
    name: 'event_client',
    rootLevel: 0,
    capabilities: CLIENT_CAPABILITIES,
    expectedHeading: 'Eventos',
    landing: '/events',
    workspaceBlock: false,
    eventClient: true,
  },
]

function persona(name: PersonaName): Persona {
  return personas.find((candidate) => candidate.name === name)!
}

function response(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

function bffResponse(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(data) }
}

// Page navigations and React Server Component payloads share paths such as
// /events with the API. Only API calls are mocked and counted.
function isPageRequest(request: Request) {
  const url = new URL(request.url())
  return (
    request.resourceType() === 'document' ||
    url.pathname.startsWith('/_next') ||
    url.searchParams.has('_rsc') ||
    request.headers()['rsc'] !== undefined
  )
}

async function mockApi(page: Page, pattern: RegExp, handler: (route: Route) => Promise<void> | void) {
  await page.route(pattern, (route) => (isPageRequest(route.request()) ? route.fallback() : handler(route)))
}

/** API calls the dashboard makes, as seen by the browser. */
function trackApiRequests(page: Page) {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (isPageRequest(request)) return
    requests.push(request)
  })
  const matching = (pattern: RegExp) => requests.filter((request) => pattern.test(new URL(request.url()).pathname))
  return { requests, matching }
}

const CLIENTS_API = /\/clients$/
const ORGANIZATION_CONTEXT_API = /\/session\/organization-context$/
const AUDIT_API = /\/audit-logs$/
const METRICS_API = /\/metrics\//

async function installPersonaSession(context: BrowserContext, page: Page, persona: Persona) {
  const baseURL = String(test.info().project.use.baseURL ?? 'http://localhost:3000')
  await context.addCookies([{ name: 'session', value: `persona-${persona.name}`, url: baseURL, httpOnly: true }])
  await page.addInitScript(() => window.localStorage.removeItem('eventi-storage'))

  const user = {
    id: `user-${persona.name}`,
    email: `${persona.name}@example.test`,
    first_name: persona.name === 'root_1' ? 'Root' : 'Persona',
    last_name: persona.name,
    is_active: true,
    is_root: persona.rootLevel > 0,
    root_level: persona.rootLevel,
  }
  const organizationAccess = {
    ...organization,
    access_role: persona.role,
    capabilities: persona.capabilities,
  }
  const session = {
    application: {
      id: 'application-eventiapp',
      code: 'eventiapp',
      name: 'EventiApp',
      product_label: 'Event operations',
      modules: ['home', 'events', 'users', 'organizations', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    user,
    organizations: persona.rootLevel > 0 || persona.eventClient ? [] : [organizationAccess],
    capabilities: persona.capabilities,
    ...(persona.eventClient ? { event_access: { assigned_events: 1, capabilities: persona.capabilities } } : {}),
  }

  // SessionBootstrap validates the HttpOnly browser session through the BFF
  // before any dashboard request. Keep this test hermetic while exercising
  // the same bootstrap path as the application.
  await mockApi(page, /\/api\/auth\/token(?:\?.*)?$/, (route) =>
    route.fulfill(bffResponse({ token: `persona-token-${persona.name}`, session }))
  )
  await mockApi(page, /\/session(?:\?.*)?$/, (route) => route.fulfill(response(session)))
  await mockApi(page, /\/session\/organization-context(?:\?.*)?$/, async (route) => {
    // A five-minute credential, as the API issues it, measured on the page clock.
    const now = await page.evaluate(() => Date.now())
    const body = route.request().postDataJSON() as { organization_id?: string } | null
    await route.fulfill(response({
      token: `context-${persona.name}`,
      organization_id: body?.organization_id ?? organization.id,
      expires_at: new Date(now + 5 * 60_000).toISOString(),
    }))
  })
  await mockApi(page, /\/users(?:\?.*)?$/, (route) => route.fulfill(response(user)))
  await mockApi(page, /\/clients(?:\?.*)?$/, (route) =>
    route.fulfill(response({ data: [organizationAccess], total: 1, page: 1, page_size: 50, total_pages: 1 }))
  )
  await mockApi(page, /\/events\/dashboard(?:\?.*)?$/, (route) =>
    route.fulfill(response({
      active_events: [event],
      next_event: event,
      next_event_guest_summary: { total: 120, confirmed: 80, pending: 40 },
      metrics: { total: 1, active: 1, upcoming: 1, past_active: 0, total_capacity: 120 },
    }))
  )
  await mockApi(page, /\/events(?:\?.*)?$/, (route) =>
    route.fulfill(response({
      data: [event], total: 1, page: 1, page_size: 12, total_pages: 1,
      counts: { all: 1, upcoming: 1, today: 0, past: 0 },
    }))
  )
}

test.describe('Matriz E2E de personas', () => {
  for (const persona of personas) {
    test(`${persona.name} recibe su espacio y únicamente sus acciones`, async ({ context, page }) => {
      await installPersonaSession(context, page, persona)
      const api = trackApiRequests(page)
      await page.goto('/')

      await expect(page.getByRole('heading', { name: persona.expectedHeading, exact: true })).toBeVisible()
      await expect(page).toHaveURL(persona.landing === '/' ? /\/$/ : /\/events$/)
      await expect(page.getByText('Espacio de trabajo', { exact: true })).toHaveCount(persona.workspaceBlock ? 1 : 0)
      await expect(page.getByRole('link', { name: 'Inicio', exact: true })).toHaveCount(persona.landing === '/' ? 1 : 0)

      if (persona.rootLevel === 1) {
        await expect(page.getByRole('link', { name: 'Auditoría', exact: true })).toBeVisible()
        // EventiApp keeps platform governance but does not expose the CRM surface
        // reserved for ITBEM and Cafetton House.
        await expect(page.getByRole('link', { name: 'Clientes', exact: true })).toHaveCount(0)
      } else {
        await expect(page.getByRole('link', { name: 'Auditoría', exact: true })).toHaveCount(0)
      }

      if (persona.rootLevel === 2) {
        await expect(page.getByText('Límite de soporte activo')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Eventos' })).toHaveCount(0)
      }

      if (persona.role && persona.landing === '/') {
        const canCreate = persona.capabilities.includes('events:create')
        const canManageTeam = persona.capabilities.includes('members:manage')
        await expect(page.getByRole('link', { name: 'Crear evento' })).toHaveCount(canCreate ? 1 : 0)
        await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(canManageTeam ? 1 : 0)
        await expect(page.getByRole('link', { name: 'Métricas' })).toHaveCount(1)
        if (persona.primaryAction) {
          await expect(page.getByRole('link', { name: new RegExp(persona.primaryAction, 'i') })).toBeVisible()
        }
      }

      if (persona.landing === '/events') {
        // Non-admin roles see only Events: no Inicio, Métricas or Equipo, and
        // they never ask for the organization list or an organization credential.
        await expect(page.getByRole('link', { name: persona.eventClient ? 'Mis eventos' : 'Eventos', exact: true })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Métricas' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0)
        expect(api.matching(CLIENTS_API)).toEqual([])
        expect(api.matching(ORGANIZATION_CONTEXT_API)).toEqual([])
        expect(api.matching(AUDIT_API)).toEqual([])
        expect(api.matching(METRICS_API)).toEqual([])
      }
    })
  }

  test('event_client trabaja solo con Mis eventos y sin datos de organización', async ({ context, page }) => {
    await installPersonaSession(context, page, persona('event_client'))
    const api = trackApiRequests(page)

    await page.goto('/')
    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByRole('link', { name: 'Mis eventos', exact: true })).toBeVisible()
    await expect(page.getByText('Evento de prueba por rol').first()).toBeVisible()

    const firstEvents = api.matching(/\/events$/)[0]
    expect(new URL(firstEvents.url()).search).toBe('?page=1&page_size=12&filter=all')
    expect(await firstEvents.headerValue('x-organization-id')).toBeNull()
    expect(api.matching(CLIENTS_API)).toEqual([])
    expect(api.matching(ORGANIZATION_CONTEXT_API)).toEqual([])
    expect(api.matching(AUDIT_API)).toEqual([])
    expect(api.matching(METRICS_API)).toEqual([])
  })

  test('event_manager no puede abrir Auditoría ni Métricas por URL', async ({ context, page }) => {
    await installPersonaSession(context, page, persona('event_manager'))
    const api = trackApiRequests(page)

    await page.goto('/audit')
    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()

    await page.goto('/metrics')
    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()

    expect(api.matching(AUDIT_API)).toEqual([])
    expect(api.matching(METRICS_API)).toEqual([])
  })

  test('un miembro que regresa con una organización guardada no envía contexto de organización', async ({ context, page }) => {
    await installPersonaSession(context, page, persona('member'))
    // Registered after the session fixture, so it runs after its cleanup.
    await page.addInitScript((saved) => {
      window.localStorage.setItem('eventi-storage', JSON.stringify({ state: saved, version: 2 }))
    }, { workspaceContexts: { eventiapp: { mode: 'organization', organization: { ...organization, access_role: 'MEMBER' } } } })
    const api = trackApiRequests(page)

    await page.goto('/')
    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByText('Evento de prueba por rol').first()).toBeVisible()

    const eventRequests = api.matching(/\/events$/)
    expect(eventRequests.length).toBeGreaterThan(0)
    for (const request of api.requests) {
      expect(await request.headerValue('x-organization-id'), request.url()).toBeNull()
    }
    expect(api.matching(ORGANIZATION_CONTEXT_API)).toEqual([])
    expect(api.matching(CLIENTS_API)).toEqual([])
  })

  for (const [name, maximum] of [['owner', 2], ['member', 0]] as const) {
    test(`${name}: una pestaña inactiva seis minutos pide a lo más ${maximum} contextos de organización`, async ({ context, page }) => {
      await page.clock.install({ time: new Date('2026-10-12T15:00:00.000Z') })
      await installPersonaSession(context, page, persona(name))
      const api = trackApiRequests(page)

      await page.goto('/')
      await expect(page.getByRole('heading', { name: persona(name).expectedHeading, exact: true })).toBeVisible()

      // Fast-forward through two session revalidations (every five minutes)
      // and the credential renewal window (45 s before its expiry).
      for (let minute = 0; minute < 6; minute += 1) {
        await page.clock.runFor(60_000)
      }
      await page.waitForLoadState('networkidle')

      const issued = api.matching(ORGANIZATION_CONTEXT_API).filter((request) => request.method() === 'POST')
      test.info().annotations.push({ type: 'organization-context POSTs', description: String(issued.length) })
      expect(issued.length).toBeLessThanOrEqual(maximum)
      if (name === 'owner') expect(issued.length).toBeGreaterThan(0)
    })
  }

  test('Viewer no descarga Studio ni Check-in al abrir rutas profundas', async ({ context, page }) => {
    const viewer = persona('viewer')
    await installPersonaSession(context, page, viewer)
    let studioWorkspaceRequests = 0
    let checkinWorkspaceRequests = 0

    await page.route(/\/events\/event-persona\/capabilities$/, (route) =>
      route.fulfill(response({
        'event:manage': false,
        'event:delete': false,
        'guest:manage': false,
        'checkin:run': false,
        'analytics:view': false,
        'members:manage': false,
      }))
    )
    await page.route(/\/events\/event-persona\/studio-workspace$/, (route) => {
      studioWorkspaceRequests += 1
      return route.fulfill(response({}))
    })
    await page.route(/\/events\/event-persona\/checkin-workspace$/, (route) => {
      checkinWorkspaceRequests += 1
      return route.fulfill(response({}))
    })

    await page.goto('/events/event-persona/studio')
    await expect(page.getByRole('heading', { name: 'Studio no disponible' })).toBeVisible()
    await expect.poll(() => studioWorkspaceRequests).toBe(0)

    await page.goto('/events/event-persona/checkin')
    await expect(page.getByRole('heading', { name: 'Check-in no disponible' })).toBeVisible()
    await expect.poll(() => checkinWorkspaceRequests).toBe(0)
  })
})
