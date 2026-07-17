import { expect, test, type BrowserContext, type Page } from '@playwright/test'

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

interface Persona {
  name: PersonaName
  rootLevel: 0 | 1 | 2
  role?: string
  capabilities: string[]
  expectedHeading: string
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
  },
  {
    name: 'root_2',
    rootLevel: 2,
    capabilities: [
      'dashboard:view', 'organizations:view', 'platform:users:view', 'platform:users:support',
      'metrics:view', 'members:manage', 'events:view', 'guests:manage', 'checkin:run', 'analytics:view',
    ],
    expectedHeading: 'Centro de soporte',
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
  },
  {
    name: 'event_manager',
    rootLevel: 0,
    role: 'EVENT_MANAGER',
    capabilities: [
      'dashboard:view', 'organizations:view', 'metrics:view', 'events:view', 'events:create',
      'events:manage', 'guests:manage', 'checkin:run', 'analytics:view',
    ],
    expectedHeading: 'Operación y producción',
  },
  {
    name: 'editor',
    rootLevel: 0,
    role: 'EDITOR',
    capabilities: ['dashboard:view', 'organizations:view', 'metrics:view', 'events:view', 'events:manage', 'guests:manage', 'analytics:view'],
    expectedHeading: 'Eventos listos para publicar',
  },
  {
    name: 'checkin',
    rootLevel: 0,
    role: 'CHECKIN',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view', 'checkin:run'],
    expectedHeading: 'Check-in sin fricción',
    primaryAction: 'Abrir check-in',
  },
  {
    name: 'analyst',
    rootLevel: 0,
    role: 'ANALYST',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view', 'analytics:view', 'metrics:view'],
    expectedHeading: 'Lectura de operación',
    primaryAction: 'Ver analíticas',
  },
  {
    name: 'member',
    rootLevel: 0,
    role: 'MEMBER',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view', 'guests:manage'],
    expectedHeading: 'Tus eventos asignados',
    primaryAction: 'Gestionar invitados',
  },
  {
    name: 'viewer',
    rootLevel: 0,
    role: 'VIEWER',
    capabilities: ['dashboard:view', 'organizations:view', 'events:view'],
    expectedHeading: 'Organización Persona',
  },
]

function response(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

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
    organizations: persona.rootLevel > 0 ? [] : [organizationAccess],
    capabilities: persona.capabilities,
  }

  await page.route(/\/session(?:\?.*)?$/, (route) => route.fulfill(response(session)))
  await page.route(/\/users(?:\?.*)?$/, (route) => route.fulfill(response(user)))
  await page.route(/\/clients(?:\?.*)?$/, (route) =>
    route.fulfill(response({ data: [organizationAccess], total: 1, page: 1, page_size: 50, total_pages: 1 }))
  )
  await page.route(/\/events\/dashboard(?:\?.*)?$/, (route) =>
    route.fulfill(response({
      active_events: [event],
      next_event: event,
      next_event_guest_summary: { total: 120, confirmed: 80, pending: 40 },
      metrics: { total: 1, active: 1, upcoming: 1, past_active: 0, total_capacity: 120 },
    }))
  )
  await page.route(/\/events(?:\?.*)?$/, (route) =>
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
      await page.goto('/')

      await expect(page.getByRole('heading', { name: persona.expectedHeading })).toBeVisible()

      if (persona.rootLevel === 1) {
        await expect(page.getByRole('link', { name: 'Auditoría' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Clientes', exact: true })).toBeVisible()
      } else {
        await expect(page.getByRole('link', { name: 'Auditoría' })).toHaveCount(0)
      }

      if (persona.rootLevel === 2) {
        await expect(page.getByText('Límite de soporte activo')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Eventos' })).toHaveCount(0)
      }

      if (persona.role) {
        const canCreate = persona.capabilities.includes('events:create')
        const canManageTeam = persona.capabilities.includes('members:manage')
        await expect(page.getByRole('link', { name: 'Crear evento' })).toHaveCount(canCreate ? 1 : 0)
        await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(canManageTeam ? 1 : 0)
        if (persona.primaryAction) {
          await expect(page.getByRole('link', { name: new RegExp(persona.primaryAction, 'i') })).toBeVisible()
        }
      }
    })
  }

  test('Viewer no descarga Studio ni Check-in al abrir rutas profundas', async ({ context, page }) => {
    const viewer = personas.find((persona) => persona.name === 'viewer')!
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
