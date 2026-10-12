import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const swr = vi.hoisted(() => ({ events: [] as unknown[] }))

vi.mock('swr', () => ({
  default: (key: unknown) => {
    const path = Array.isArray(key) ? String(key[0]) : String(key ?? '')
    if (path.startsWith('/events?')) {
      return {
        data: {
          data: swr.events,
          total: swr.events.length,
          page: 1,
          page_size: 12,
          total_pages: 1,
          counts: { all: swr.events.length, upcoming: swr.events.length, today: 0, past: 0 },
        },
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      }
    }
    return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
  },
  preload: () => Promise.resolve(undefined),
  mutate: vi.fn(() => Promise.resolve()),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/events',
  useSearchParams: () => new URLSearchParams(),
}))

import EventsPage from '@/app/(app)/events/page'
import type { ApplicationSession } from '@/models/ApplicationSession'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'

const application = {
  id: 'application-eventiapp',
  code: 'eventiapp',
  name: 'EventiApp',
  product_label: 'Event operations',
  modules: ['home', 'events', 'metrics'],
  allows_platform_admin: true,
  is_active: true,
}
const user = { id: 'u', email: 'u@example.test', first_name: 'Ana', last_name: 'U', is_root: false, root_level: 0 }
const grantCapabilities = ['events:view', 'events:manage', 'guests:manage', 'checkin:run', 'analytics:view']

function event(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, name, identifier: id, event_date_time: '2027-01-10T18:00:00Z', timezone: 'UTC', is_active: true, ...extra }
}

function renderAs(session: ApplicationSession, events: unknown[]) {
  swr.events = events
  useStore.getState().clearSession()
  useStore.getState().setToken('token')
  useStore.getState().setApplicationSession(session)
  useStore.getState().activateTenantWorkspace('eventiapp', { canUsePlatformMode: false, portfolio: true })
  render(
    <ProductProvider product={getProductManifest('eventiapp')}>
      <EventsPage />
    </ProductProvider>
  )
}

describe('events list per-row actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it("client-only: 'Mis eventos', no 'Crear evento', actions on assigned rows", () => {
    renderAs(
      {
        application,
        user,
        organizations: [],
        capabilities: grantCapabilities,
        event_access: { assigned_events: 1, capabilities: grantCapabilities },
      } as unknown as ApplicationSession,
      [event('e1', 'Boda Ana', { client_id: 'org-x', viewer_access: 'event_client' })]
    )
    expect(screen.getByRole('heading', { name: 'Mis eventos' })).toBeTruthy()
    expect(screen.getByText('Los eventos que tu organizador compartió contigo.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Crear evento/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Más acciones para Boda Ana' })).toBeTruthy()
  })

  it('client-only with no events: assigned-events empty state', () => {
    renderAs(
      {
        application,
        user,
        organizations: [],
        capabilities: grantCapabilities,
        event_access: { assigned_events: 1, capabilities: grantCapabilities },
      } as unknown as ApplicationSession,
      []
    )
    expect(screen.getByText('Aún no tienes eventos asignados')).toBeTruthy()
    expect(screen.getByText('Cuando tu organizador te asigne un evento, aparecerá aquí.')).toBeTruthy()
  })

  it('check-in member: the no-actions note and no kebab', () => {
    renderAs(
      {
        application,
        user,
        organizations: [
          { id: 'org-a', name: 'A', code: 'a', access_role: 'CHECKIN', capabilities: ['events:view', 'checkin:run'] },
        ],
        capabilities: ['events:view', 'checkin:run'],
      } as unknown as ApplicationSession,
      [event('e1', 'Gala', { client_id: 'org-a', viewer_access: 'organization' })]
    )
    expect(screen.getByRole('note').textContent).toContain('Tu rol permite operar el check-in.')
    expect(screen.queryByRole('button', { name: 'Más acciones para Gala' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Eventos' })).toBeTruthy()
  })

  it('mixed user: actions differ by viewer_access, and an organization missing from the session has none', () => {
    renderAs(
      {
        application,
        user,
        organizations: [
          { id: 'org-a', name: 'A', code: 'a', access_role: 'VIEWER', capabilities: ['events:view'] },
        ],
        capabilities: ['events:view', ...grantCapabilities],
        event_access: { assigned_events: 1, capabilities: grantCapabilities },
      } as unknown as ApplicationSession,
      [
        event('e1', 'Propio', { client_id: 'org-a', viewer_access: 'organization' }),
        event('e2', 'Asignado', { client_id: 'org-x', viewer_access: 'event_client' }),
        event('e3', 'Sin sesion', { client_id: 'org-gap', viewer_access: 'organization' }),
      ]
    )
    expect(screen.queryByRole('button', { name: 'Más acciones para Propio' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Más acciones para Asignado' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Más acciones para Sin sesion' })).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
  })
})
