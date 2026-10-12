import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationSession } from '@/models/ApplicationSession'

const pathname = vi.hoisted(() => ({ value: '/users' }))
const replace = vi.hoisted(() => vi.fn())
const pageMounted = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/components/application-layout', () => ({
  ApplicationLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/session/SessionBootstrap', () => ({ default: () => null }))
vi.mock('@/components/ui/navigation-progress', () => ({ NavigationProgress: () => null }))
vi.mock('@/components/ui/connection-status-banner', () => ({ ConnectionStatusBanner: () => null }))
vi.mock('@/hooks/useStoreHydration', () => ({ useStoreHydration: () => true }))

import { AppLayoutClient } from '@/app/(app)/app-layout-client'
import { getProductManifest } from '@/products/registry'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import { useStore } from '@/store/useStore'

const ORG = 'org-1'
const checkinSession = {
  application: {
    id: 'app',
    code: 'eventiapp',
    name: 'EventiApp',
    product_label: 'EventiApp',
    modules: ['home', 'events'],
    allows_platform_admin: true,
    is_active: true,
  },
  user: { id: 'u', email: 'checkin@example.test', is_root: false },
  organizations: [{ id: ORG, name: 'Org', code: 'org', capabilities: ['events:view', 'checkin:run'] }],
  capabilities: ['events:view', 'checkin:run'],
} as unknown as ApplicationSession

function Page() {
  pageMounted()
  return <p>Contenido de la página</p>
}

function renderShell() {
  const tenant = tenantPresentationForHostname('dashboard.eventiapp.localhost')
  return render(
    <AppLayoutClient product={getProductManifest('eventiapp')} tenant={tenant}>
      <Page />
    </AppLayoutClient>
  )
}

describe('AppLayoutClient route access', () => {
  let initialState: ReturnType<typeof useStore.getState>

  beforeEach(() => {
    initialState = useStore.getState()
    useStore.setState({
      applicationSession: checkinSession,
      profileLoaded: true,
      workspaceMode: 'organization',
      currentClient: { id: ORG, name: 'Org', code: 'org', client_type: { code: '' } } as never,
    })
  })

  afterEach(() => {
    useStore.setState(initialState, true)
    vi.clearAllMocks()
  })

  it('shows a Spanish "Sin acceso" screen and never mounts a denied page', () => {
    pathname.value = '/users'
    renderShell()

    expect(screen.getByRole('heading', { name: 'Sin acceso' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/')
    expect(pageMounted).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('mounts an allowed deep link such as check-in', () => {
    pathname.value = '/events/e1/checkin'
    renderShell()

    expect(screen.getByText('Contenido de la página')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sin acceso' })).not.toBeInTheDocument()
  })

  it('waits for the verified session before mounting a role-dependent page', () => {
    pathname.value = '/metrics'
    useStore.setState({ applicationSession: null, profileLoaded: false })
    renderShell()

    expect(pageMounted).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Sin acceso' })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Preparando dashboard' })).toBeInTheDocument()
  })
})
