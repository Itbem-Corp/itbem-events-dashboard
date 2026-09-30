import AutomationAgentProfilePage from '@/app/(app)/automation/agents/[agentKey]/page'
import { parseAutomationAgentDirectory, type AutomationAgentDirectorySnapshot, type AutomationAgentHistoryPage } from '@/features/automation/agent-directory'
import { automationAgentHistoryPath, automationAgentsPath } from '@/lib/api-paths'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  useSWRInfinite: vi.fn(),
  fetcher: vi.fn(),
  params: { agentKey: 'frontend-specialist' },
  mutateDirectory: vi.fn(),
  mutateHistory: vi.fn(),
  setSize: vi.fn(),
  useAgentDirectoryStream: vi.fn(),
  query: '',
  pathname: '/automation/agents/frontend-specialist',
  replace: vi.fn(),
  workspaceMode: 'platform' as 'platform' | 'organization',
  currentClient: null as null | { id: string; name: string },
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('swr/infinite', () => ({ default: mocks.useSWRInfinite }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('@/features/automation/use-agent-directory-stream', () => ({ useAgentDirectoryStream: mocks.useAgentDirectoryStream }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherScope: () => (path: string) => path }))
vi.mock('@/store/useStore', () => ({ useStore: (selector: (state: unknown) => unknown) => selector({ workspaceMode: mocks.workspaceMode, currentClient: mocks.currentClient }) }))
vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}))

const snapshot: AutomationAgentDirectorySnapshot = {
  schema_version: 1,
  generated_at: '2026-09-24T16:00:00Z',
  summary: { profile_count: 1, live_instances: 1, active_runs: 1, available_slots: 1, queued_tasks: 0, spend_30d_microusd: 2_500_000 },
  agents: [{
    agent_key: 'frontend-specialist',
    name: 'Ada',
    specialty: 'Frontend',
    description: 'Construye interfaces y pruebas.',
    capabilities: ['React', 'Pruebas'],
    operations: ['delivery.plan', 'delivery.implementation'],
    active: true,
    status: 'working',
    instance_count: 1,
    active_run_count: 1,
    total_runs_30d: 8,
    spend_30d_microusd: 2_500_000,
    instances: [Object.assign({
      worker_id: 'worker-01',
      machine_id: 'equipo-local-01',
      protocols: ['delivery.plan_steps.v1'],
      status: 'working',
      provider: 'openrouter',
      model: 'small-model',
      concurrency: 2,
      draining: false,
      started_at: '2026-09-23T15:00:00Z',
      last_seen_at: '2026-09-24T15:59:30Z',
      active_runs: [{
        task_id: 'task-01', run_id: 'run-01', operation: 'delivery.implementation', status: 'running',
        client_name: 'ITBEM', project_name: 'Agent Studio', work_item_id: 'work-item-01', work_item_title: 'Agregar perfil',
        step_key: 'frontend', started_at: '2026-09-24T15:30:00Z',
      }],
    }, { agent_instance_id: 'agent-instance-01' })],
  }],
  queue_lanes: [],
}

const historyPage: AutomationAgentHistoryPage = {
  agent_key: 'frontend-specialist',
  items: [{
    id: 'history-01',
    kind: 'step_activity',
    activity_action: 'file_change',
    occurred_at: '2026-09-24T15:30:00Z',
    run_id: 'run-01',
    operation: 'delivery.implementation',
    status: 'completed',
    client_name: 'ITBEM',
    project_name: 'Agent Studio',
    work_item_id: 'work-item-01',
    work_item_title: 'Agregar perfil',
    step_key: 'frontend',
    provider: 'openrouter',
    model: 'small-model',
    input_tokens: 300,
    output_tokens: 80,
    total_cost_microusd: 0,
    summary: 'NO MOSTRAR: prompt privado y razonamiento',
  }],
  limit: 50,
  has_more: true,
  next_cursor: 'cursor / página 2',
}

const visibleProject = {
  id: 'project-profile', client_id: 'client-profile', name: 'Agent Studio', slug: 'agent-studio', summary: '', status: 'active',
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-24T00:00:00Z',
  client: { id: 'client-profile', name: 'ITBEM Corp' },
}

function historyResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [historyPage],
    error: undefined,
    isLoading: false,
    isValidating: false,
    size: 1,
    setSize: mocks.setSize,
    mutate: mocks.mutateHistory,
    ...overrides,
  }
}

describe('Automation agent profile page', () => {
  beforeEach(() => {
    mocks.useSWR.mockReset()
    mocks.useSWRInfinite.mockReset()
    mocks.fetcher.mockReset()
    mocks.mutateDirectory.mockReset()
    mocks.mutateHistory.mockReset()
    mocks.setSize.mockReset()
    mocks.useAgentDirectoryStream.mockReset().mockReturnValue({ status: 'live' })
    mocks.params = { agentKey: 'frontend-specialist' }
    mocks.query = ''
    mocks.pathname = '/automation/agents/frontend-specialist'
    mocks.workspaceMode = 'platform'
    mocks.currentClient = null
    mocks.replace.mockReset()
    mocks.useSWR.mockReturnValue({ data: snapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })
    mocks.useSWRInfinite.mockReturnValue(historyResult())
    mocks.fetcher.mockResolvedValue(historyPage)
  })

  it('loads the authorized directory contract and renders profile, instances, current sessions and safe history', () => {
    render(<AutomationAgentProfilePage />)

    expect(mocks.useSWR).toHaveBeenCalledWith(automationAgentsPath(), expect.any(Function), expect.objectContaining({ refreshInterval: 30_000 }))
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeInTheDocument()
    expect(screen.getByText('Especialidad · Frontend')).toBeInTheDocument()
    expect(screen.getByText('Especialidad y alcance reportado')).toBeInTheDocument()
    expect(screen.getByText('Gasto · 30 días').parentElement).toHaveTextContent('2.50')
    expect(screen.getByText('Máquinas, instancias y sesiones')).toBeInTheDocument()
    expect(screen.getByText('equipo-local-01')).toBeInTheDocument()
    expect(screen.getByText('Worker / instancia').parentElement).toHaveTextContent('agent-instance-01')
    expect(screen.getByText('Slots anunciados disponibles').parentElement).toHaveTextContent('1 de 2')
    expect(screen.getByRole('progressbar', { name: 'Concurrencia ocupada reportada' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByLabelText('Capacidades declaradas')).toHaveTextContent('ReactPruebas')
    expect(screen.getByLabelText('Operaciones de routing configuradas')).toHaveTextContent('delivery.plandelivery.implementation')
    expect(screen.getByText('Configuración · Activo')).toBeInTheDocument()
    expect(screen.getByText('Operativo · Trabajando')).toBeInTheDocument()
    expect(screen.getByText('Permisos efectivos')).toBeInTheDocument()
    expect(screen.getByText('Este contrato no publica las políticas de autorización efectivas. Ni capacidades ni operaciones de routing equivalen a permisos efectivos.')).toBeInTheDocument()
    expect(screen.getByText('Plan steps v1 compatible')).toBeInTheDocument()
    expect(screen.getByText('Sesiones y trabajo actual asignado')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Abrir tarea: Agregar perfil' }).every((link) =>
      link.getAttribute('href') === '/automation/work-items/work-item-01?view=activity'
    )).toBe(true)
    expect(screen.getByRole('heading', { name: 'Historial del agente' })).toBeInTheDocument()
    expect(screen.getByText('Actualización en vivo activa · respaldo cada 30 s')).toBeInTheDocument()
    expect(screen.getByText('Costo registrado').parentElement).toHaveTextContent(/0[.,]00/)
    expect(screen.queryByText(/NO MOSTRAR/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Equipo' })).toHaveAttribute('href', '/automation/agents')
    expect(screen.getByRole('link', { name: 'Abrir historial de la tarea' })).toHaveAttribute('href', '/automation/work-items/work-item-01?view=activity')
  })

  it('distinguishes an explicit legacy worker from a worker whose protocol is not reported', () => {
    const reportedLegacyInstance = { ...snapshot.agents[0].instances[0], protocols: [] }
    const unreportedProtocolInstance = { ...snapshot.agents[0].instances[0] }
    Reflect.deleteProperty(unreportedProtocolInstance, 'protocols')
    const mixedRuntimeSnapshot: AutomationAgentDirectorySnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0], instances: [reportedLegacyInstance, unreportedProtocolInstance] }],
    }
    mocks.useSWR.mockReturnValue({ data: mixedRuntimeSnapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })

    render(<AutomationAgentProfilePage />)

    expect(screen.getByText('Legacy · sin soporte de pasos')).toBeInTheDocument()
    expect(screen.getByText('Protocolo no reportado')).toBeInTheDocument()
  })

  it('does not present capacity as assignable when the worker heartbeat is offline', () => {
    const offlineSnapshot: AutomationAgentDirectorySnapshot = {
      ...snapshot,
      generated_at: '2026-09-24T16:00:00Z',
      agents: [{
        ...snapshot.agents[0],
        instances: [{ ...snapshot.agents[0].instances[0], status: 'offline', last_seen_at: '2026-09-24T15:58:00Z' }],
      }],
    }
    mocks.useSWR.mockReturnValue({ data: offlineSnapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })

    render(<AutomationAgentProfilePage />)

    expect(screen.getByTestId('agent-instance-available-slots')).toHaveTextContent('No disponible')
    expect(screen.queryByRole('progressbar', { name: 'Concurrencia ocupada reportada' })).not.toBeInTheDocument()
  })

  it('shows configured inactivity separately from a working runtime and preserves unknown legacy fields', () => {
    const inactiveSnapshot: AutomationAgentDirectorySnapshot = {
      ...snapshot,
      agents: [{ ...snapshot.agents[0], active: false, status: 'working' }],
    }
    mocks.useSWR.mockReturnValue({ data: inactiveSnapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })

    const { rerender } = render(<AutomationAgentProfilePage />)

    expect(screen.getByText('Configuración · Inactivo')).toBeInTheDocument()
    expect(screen.getByText('Operativo · Trabajando')).toBeInTheDocument()

    const legacyAgent = { ...snapshot.agents[0] }
    Reflect.deleteProperty(legacyAgent, 'operations')
    Reflect.deleteProperty(legacyAgent, 'active')
    const legacySnapshot = parseAutomationAgentDirectory({ ...snapshot, agents: [legacyAgent] })
    expect(legacySnapshot.agents[0].operations).toBeUndefined()
    expect(legacySnapshot.agents[0].active).toBeUndefined()

    mocks.useSWR.mockReturnValue({ data: legacySnapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })
    rerender(<AutomationAgentProfilePage />)

    expect(screen.getByText('Configuración no reportada')).toBeInTheDocument()
    expect(screen.getByLabelText('Operaciones de routing configuradas')).toHaveTextContent('No reportadas por la versión anterior de la API.')
    expect(screen.queryByText('No hay operaciones de routing configuradas.')).not.toBeInTheDocument()
  })

  it('shows the epic between project and task in active work and history with a safe detail link', () => {
    const epicId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const withEpic: AutomationAgentDirectorySnapshot = {
      ...snapshot,
      agents: snapshot.agents.map((profile) => ({
        ...profile,
        instances: profile.instances.map((instance) => ({
          ...instance,
          active_runs: instance.active_runs.map((run) => ({ ...run, epic_id: epicId, epic_title: 'Consola de agentes' })),
        })),
      })),
    }
    const historyWithEpic: AutomationAgentHistoryPage = {
      ...historyPage,
      items: historyPage.items.map((item) => ({ ...item, epic_id: epicId, epic_title: 'Consola de agentes' })),
    }
    mocks.useSWR.mockReturnValue({ data: withEpic, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })
    mocks.useSWRInfinite.mockReturnValue(historyResult({ data: [historyWithEpic] }))

    render(<AutomationAgentProfilePage />)

    const epicLinks = screen.getAllByRole('link', { name: 'Consola de agentes' })
    expect(epicLinks.length).toBeGreaterThanOrEqual(2)
    expect(epicLinks.every((link) => link.getAttribute('href') === `/automation/epics/${epicId}`)).toBe(true)
    expect(screen.getAllByText('Paso frontend').length).toBeGreaterThan(0)
  })

  it('uses the encoded direct-route key and cursor page in the existing history endpoint', () => {
    mocks.params = { agentKey: 'generalist / 1' }
    const encodedSnapshot = { ...snapshot, agents: [{ ...snapshot.agents[0], agent_key: 'generalist / 1' }] }
    mocks.useSWR.mockReturnValue({ data: encodedSnapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })
    mocks.useSWRInfinite.mockImplementation(() => {
      return historyResult()
    })

    render(<AutomationAgentProfilePage />)

    const latestCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [(index: number, previous: AutomationAgentHistoryPage | null) => string | null]
    const firstPage = latestCall[0](0, null)
    const nextPage = latestCall[0](1, historyPage)
    expect(firstPage).toContain('/automation/agents/generalist%20%2F%201/history?limit=50')
    expect(new URL(`http://localhost${nextPage}`).searchParams.get('cursor')).toBe(historyPage.next_cursor)
  })

  it('applies date and hierarchy filters and preserves them on cursor pagination', async () => {
    mocks.useSWRInfinite.mockImplementation((getKey) => {
      const firstPageKey = getKey(0, null)
      if (firstPageKey) void mocks.fetcher(firstPageKey)
      return historyResult()
    })
    render(<AutomationAgentProfilePage />)

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-23' } })
    fireEvent.change(screen.getByLabelText('Proyecto ID'), { target: { value: 'project-01' } })
    fireEvent.change(screen.getByLabelText('Run ID'), { target: { value: 'run-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    expect(mocks.setSize).toHaveBeenCalledWith(1)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining('project_id=project-01')))
    const latestCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [(index: number, previous: AutomationAgentHistoryPage | null) => string | null]
    const nextPage = latestCall[0](1, historyPage)
    const params = new URL(`http://localhost${nextPage}`).searchParams
    expect(params.get('from')).toBe(new Date(2026, 8, 1).toISOString())
    expect(params.get('to')).toBe(new Date(2026, 8, 24).toISOString())
    expect(params.get('project_id')).toBe('project-01')
    expect(params.get('run_id')).toBe('run-01')
    expect(params.get('cursor')).toBe(historyPage.next_cursor)
  })

  it('shows explicit loading, failed-load and not-found states without inventing a zero-cost profile', async () => {
    mocks.useSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, isValidating: false, mutate: mocks.mutateDirectory })
    const { rerender } = render(<AutomationAgentProfilePage />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')

    mocks.useSWR.mockReturnValue({ data: undefined, error: new Error('unavailable'), isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })
    rerender(<AutomationAgentProfilePage />)
    expect(screen.getByRole('heading', { name: 'No se pudo cargar el perfil' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(mocks.mutateDirectory).toHaveBeenCalled()

    mocks.useSWR.mockReturnValue({ data: { ...snapshot, agents: [] }, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory })
    rerender(<AutomationAgentProfilePage />)
    expect(screen.getByRole('heading', { name: 'Perfil no encontrado' })).toBeInTheDocument()
    expect(screen.getByText('No hay un perfil visible para esta clave en el directorio autorizado.')).toBeInTheDocument()
  })

  it('builds filtered history queries with the shared path helper', async () => {
    render(<AutomationAgentProfilePage />)
    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: 'openrouter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await waitFor(() => {
      const lastCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [(index: number, previous: AutomationAgentHistoryPage | null) => string | null]
      expect(lastCall[0](0, null)).toBe(automationAgentHistoryPath('frontend-specialist', { limit: 50, provider: 'openrouter' }))
    })
  })

  it('invalidates only the authorized profile snapshot and visible history first page on stream events', () => {
    render(<AutomationAgentProfilePage />)

    const streamOptions = mocks.useAgentDirectoryStream.mock.calls.at(-1)?.[0] as {
      enabled: boolean
      onSnapshot: (event: { revision: string; generated_at: string }) => void
      onUpdate: (event: { revision: string; generated_at: string }) => void
    }
    expect(streamOptions.enabled).toBe(true)
    const event = { revision: 'directory-r2', generated_at: '2026-09-24T16:01:00Z' }
    streamOptions.onSnapshot(event)
    streamOptions.onUpdate(event)

    expect(mocks.mutateDirectory).toHaveBeenCalledTimes(2)
    expect(mocks.mutateHistory).toHaveBeenCalledTimes(2)
    const historyCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [
      (index: number, previous: AutomationAgentHistoryPage | null) => string | null,
    ]
    const firstPageKey = historyCall[0](0, null)
    const cursorPageKey = historyCall[0](1, historyPage)
    const [data, options] = mocks.mutateHistory.mock.calls.at(-1) as unknown as [
      unknown,
      { revalidate: (page: AutomationAgentHistoryPage, key: string) => boolean },
    ]

    expect(data).toBeUndefined()
    expect(firstPageKey).toBe(automationAgentHistoryPath('frontend-specialist', { limit: 50 }))
    expect(cursorPageKey).not.toBeNull()
    expect(options.revalidate(historyPage, firstPageKey!)).toBe(true)
    expect(options.revalidate(historyPage, cursorPageKey!)).toBe(false)
  })

  it('keeps the periodic fetch as a clear fallback while the stream reconnects', () => {
    mocks.useAgentDirectoryStream.mockReturnValue({ status: 'reconnecting' })
    render(<AutomationAgentProfilePage />)

    expect(screen.getByText('Conectando actualizaciones en vivo · respaldo cada 30 s')).toBeInTheDocument()
    expect(mocks.useSWR).toHaveBeenCalledWith(automationAgentsPath(), expect.any(Function), expect.objectContaining({ refreshInterval: 30_000 }))
  })

  it('does not load a global directory in organization context without a selected visible company', () => {
    mocks.workspaceMode = 'organization'
    mocks.currentClient = { id: 'organization-1', name: 'ITBEM Corp' }
    mocks.useSWR.mockImplementation((key: unknown) => {
      if (key === '/automation/projects') return { data: [visibleProject], error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
      return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
    })

    render(<AutomationAgentProfilePage />)

    expect(screen.getByRole('heading', { name: 'Selecciona el alcance del perfil' })).toBeInTheDocument()
    expect(mocks.useSWR.mock.calls.some(([key]) => key === '/automation/agents')).toBe(false)
    expect(mocks.useAgentDirectoryStream.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false })
  })

  it('pins current profile and every history page to the selected authorized client/project', () => {
    mocks.query = 'client_id=client-profile&project_id=project-profile'
    mocks.useSWR.mockImplementation((key: unknown) => {
      if (key === '/automation/projects') return { data: [visibleProject], error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
      return { data: snapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
    })

    render(<AutomationAgentProfilePage />)

    expect(mocks.useSWR).toHaveBeenCalledWith(
      '/automation/agents?client_id=client-profile&project_id=project-profile',
      expect.any(Function),
      expect.objectContaining({ keepPreviousData: false }),
    )
    expect(screen.getByLabelText('Empresa / cliente del alcance')).toHaveValue('client-profile')
    expect(screen.getByLabelText('Proyecto del alcance')).toHaveValue('project-profile')
    const historyCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [(index: number, previous: AutomationAgentHistoryPage | null) => string | null]
    const firstPageKey = historyCall[0](0, null)
    const nextPageKey = historyCall[0](1, historyPage)
    expect(new URL(`http://localhost${firstPageKey}`).searchParams.get('client_id')).toBe('client-profile')
    expect(new URL(`http://localhost${firstPageKey}`).searchParams.get('project_id')).toBe('project-profile')
    expect(new URL(`http://localhost${nextPageKey}`).searchParams.get('client_id')).toBe('client-profile')
    expect(new URL(`http://localhost${nextPageKey}`).searchParams.get('project_id')).toBe('project-profile')
  })
})
