import TeamPage from '@/app/(app)/team/page'
import { OrganizationEventClientsPanel } from '@/components/events/organization-event-clients-panel'
import { api } from '@/lib/api'
import type { AccessProfile } from '@/lib/access-profile'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toast, swrState, profile } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  swrState: { data: undefined as unknown, error: undefined as unknown, mutate: vi.fn() },
  profile: { capabilities: ['members:manage'] as string[] },
}))

vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/api', () => ({ api: { delete: vi.fn() } }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherKey: (path: string | null) => path }))
vi.mock('swr', () => ({
  default: (key: string | null) =>
    key ? { ...swrState, isLoading: false } : { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() },
  mutate: vi.fn(),
}))
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const source = loader.toString()
    if (source.includes('organization-event-clients-panel')) {
      const Panel = (props: { organizationId: string; organizationName: string }) => (
        <div data-testid="event-clients-panel">{props.organizationName}</div>
      )
      Panel.displayName = 'OrganizationEventClientsPanelMock'
      return Panel
    }
    return () => null
  },
}))
vi.mock('@/lib/use-access-profile', () => ({
  useAccessProfile: () => ({ capabilities: profile.capabilities }) as unknown as AccessProfile,
}))
vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ currentClient: { id: 'org-1', name: 'Bodas Lupita' } }),
}))

const grant = {
  grant_id: 'g-1',
  event_id: 'evt-1',
  event_name: 'Boda Ana y Luis',
  event_date_time: '2026-12-01T00:00:00Z',
  client: { user_id: 'u-ana', email: 'ana@ejemplo.mx', first_name: 'Ana', last_name: 'López' },
  granted_by: { user_id: 'u-mgr', email: 'gestor@ejemplo.mx', first_name: 'Gestora', last_name: 'Ruiz' },
  granted_at: '2026-10-01T12:00:00Z',
}

describe('OrganizationEventClientsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrState.data = { data: [grant], total: 1, page: 1, page_size: 20, total_pages: 1 }
    swrState.error = undefined
    swrState.mutate = vi.fn().mockResolvedValue(undefined)
    profile.capabilities = ['members:manage']
  })

  it('lists client, event, assigner and date', () => {
    render(<OrganizationEventClientsPanel organizationId="org-1" organizationName="Bodas Lupita" />)
    expect(screen.getByRole('heading', { name: 'Clientes de eventos' })).toBeTruthy()
    expect(screen.getByText('Ana López')).toBeTruthy()
    expect(screen.getByText('Boda Ana y Luis')).toBeTruthy()
    expect(screen.getByText('Gestora Ruiz')).toBeTruthy()
  })

  it('confirms then revokes every access of the person', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { status: 200, message: 'ok', data: { revoked: 3 } } })
    render(<OrganizationEventClientsPanel organizationId="org-1" organizationName="Bodas Lupita" />)

    fireEvent.click(screen.getByRole('button', { name: 'Quitar todos sus accesos' }))
    const confirm = screen.getByRole('alertdialog')
    expect(confirm.textContent).toContain('¿Quitar a Ana López de todos los eventos de Bodas Lupita?')
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Quitar todos sus accesos' }))
    })

    expect(api.delete).toHaveBeenCalledWith('/clients/org-1/members/event-clients/u-ana')
    expect(toast.success).toHaveBeenCalledWith('Ana López ya no tiene acceso a 3 eventos de Bodas Lupita.')
    expect(swrState.mutate).toHaveBeenCalled()
  })

  it('shows the empty state', () => {
    swrState.data = { data: [], total: 0, page: 1, page_size: 20, total_pages: 0 }
    render(<OrganizationEventClientsPanel organizationId="org-1" organizationName="Bodas Lupita" />)
    expect(screen.getByText('Nadie tiene acceso como cliente en esta organización.')).toBeTruthy()
  })

  it('renders nothing when the feature is off', () => {
    swrState.data = undefined
    swrState.error = { response: { status: 404, data: { status: 404, message: 'Función no disponible', error: 'event_client_access_disabled' } } }
    const { container } = render(<OrganizationEventClientsPanel organizationId="org-1" organizationName="Bodas Lupita" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('/team mounts the oversight panel', () => {
  beforeEach(() => {
    profile.capabilities = ['members:manage']
  })

  it('for EventiApp admins with members:manage', () => {
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <TeamPage />
      </ProductProvider>
    )
    expect(screen.getByTestId('event-clients-panel')).toBeTruthy()
  })

  it('not without members:manage', () => {
    profile.capabilities = ['events:view']
    render(
      <ProductProvider product={getProductManifest('eventiapp')}>
        <TeamPage />
      </ProductProvider>
    )
    expect(screen.queryByTestId('event-clients-panel')).toBeNull()
  })

  it('not on Cafetton House', () => {
    render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <TeamPage />
      </ProductProvider>
    )
    expect(screen.queryByTestId('event-clients-panel')).toBeNull()
  })
})
