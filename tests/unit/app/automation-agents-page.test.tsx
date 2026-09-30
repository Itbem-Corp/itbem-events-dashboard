import AutomationAgentsPage from '@/app/(app)/automation/agents/page'
import type { AutomationAgentDirectorySnapshot, AutomationAgentHistoryPage } from '@/features/automation/agent-directory'
import { automationAgentsPath } from '@/lib/api-paths'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  useSWRInfinite: vi.fn(),
  useAgentDirectoryStream: vi.fn(),
  fetcher: vi.fn(),
  mutateDirectory: vi.fn(),
  setHistorySize: vi.fn(),
  mutateHistory: vi.fn(),
  query: '',
  pathname: '/automation/agents',
  push: vi.fn(),
  replace: vi.fn(),
  workspaceMode: 'platform' as 'platform' | 'organization',
  currentClient: null as null | { id: string; name: string },
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('swr/infinite', () => ({ default: mocks.useSWRInfinite }))
vi.mock('@/features/automation/use-agent-directory-stream', () => ({ useAgentDirectoryStream: mocks.useAgentDirectoryStream }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherScope: () => (path: string) => path }))
vi.mock('@/store/useStore', () => ({ useStore: (selector: (state: unknown) => unknown) => selector({ workspaceMode: mocks.workspaceMode, currentClient: mocks.currentClient }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}))
vi.mock('@/components/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div role="dialog">{children}</div> : null,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const mockResponse: AutomationAgentDirectorySnapshot = {
  schema_version: 1,
  generated_at: '2026-09-23T18:20:00Z',
  summary: { profile_count: 2, live_instances: 1, active_runs: 1, available_slots: 2, queued_tasks: 1, spend_30d_microusd: 42_000 },
  agents: [
    {
      agent_key: 'frontend-specialist',
      name: 'Ada',
      specialty: 'Frontend',
      description: 'Implementa interfaces accesibles.',
      capabilities: ['React', 'Pruebas'],
      status: 'working',
      instance_count: 1,
      active_run_count: 1,
      total_runs_30d: 12,
      spend_30d_microusd: 42_000,
      instances: [{
        worker_id: 'worker-a',
        machine_id: 'equipo-mex-01',
        status: 'working',
        provider: 'openrouter',
        model: 'small-model',
        concurrency: 2,
        draining: false,
        started_at: '2026-09-22T10:00:00Z',
        last_seen_at: '2026-09-23T18:19:55Z',
        active_runs: [{
          task_id: 'task-1', run_id: 'run-1', operation: 'delivery.implementation', status: 'running',
          client_name: 'ITBEM', project_name: 'Agent Studio', work_item_id: 'work-1', work_item_title: 'Roster visual',
          step_key: 'build', started_at: '2026-09-23T18:00:00Z',
        }],
      }],
    },
    {
      agent_key: 'backend-specialist',
      name: 'Grace',
      specialty: 'Backend',
      description: 'Diseña APIs y servicios.',
      capabilities: ['Go', 'API'],
      status: 'available',
      instance_count: 0,
      active_run_count: 0,
      total_runs_30d: 0,
      spend_30d_microusd: 0,
      instances: [],
    },
  ],
  queue_lanes: [{ operation: 'delivery.qa', queued_tasks: 1, oldest_queued_at: '2026-09-23T17:00:00Z' }],
}

const mockProjects = [{
  id: 'project-1', client_id: 'client-1', name: 'Agent Studio', slug: 'agent-studio', summary: '', status: 'active',
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-23T00:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
}]

const mockHistoryResponse: AutomationAgentHistoryPage = {
  agent_key: 'frontend-specialist',
  items: [{
    id: 'history-event-1',
    kind: 'inference',
    occurred_at: '2026-09-23T18:05:00Z',
    task_id: 'task-1',
    run_id: 'run-1',
    worker_id: '11111111-2222-4333-8444-555555555555',
    machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    agent_instance_id: 'cccccccc-dddd-4eee-8fff-000000000001',
    operation: 'delivery.implementation',
    status: 'completed',
    client_id: 'client-1',
    client_name: 'ITBEM',
    project_id: 'project-1',
    project_name: 'Agent Studio',
    work_item_id: 'work-1',
    work_item_title: 'Roster visual',
    step_key: 'build',
    provider: 'openrouter',
    model: 'small-model',
    input_tokens: 240,
    output_tokens: 120,
    total_cost_microusd: 3_500,
    summary: 'Resumen permitido del evento.',
    prompt: 'NO MOSTRAR: prompt privado',
    output: 'NO MOSTRAR: salida privada',
    reasoning: 'NO MOSTRAR: razonamiento privado',
  } as AutomationAgentHistoryPage['items'][number] & { prompt: string; output: string; reasoning: string }],
  limit: 50,
  has_more: true,
  next_cursor: 'cursor / página 2',
}

function historyHookResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [mockHistoryResponse],
    error: undefined,
    isLoading: false,
    isValidating: false,
    size: 1,
    setSize: mocks.setHistorySize,
    mutate: mocks.mutateHistory,
    ...overrides,
  }
}

describe('Automation agents page', () => {
  beforeEach(() => {
    mocks.useSWR.mockReset()
    mocks.useSWRInfinite.mockReset()
    mocks.useAgentDirectoryStream.mockReset().mockReturnValue({ status: 'live' })
    mocks.fetcher.mockReset()
    mocks.mutateDirectory.mockReset()
    mocks.setHistorySize.mockReset()
    mocks.mutateHistory.mockReset()
    mocks.query = ''
    mocks.workspaceMode = 'platform'
    mocks.currentClient = null
    mocks.pathname = '/automation/agents'
    mocks.push.mockReset().mockImplementation((url: string) => {
      mocks.query = new URL(url, 'http://localhost').searchParams.toString()
    })
    mocks.replace.mockReset().mockImplementation((url: string) => {
      mocks.query = new URL(url, 'http://localhost').searchParams.toString()
    })
    window.history.replaceState({}, '', '/automation/agents')
    mocks.useSWR.mockImplementation((key: unknown) => {
      const path = Array.isArray(key) ? key[0] : key
      if (typeof path === 'string' && path.startsWith('/automation/projects')) {
        return { data: mockProjects, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
      }
      return { data: mockResponse, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
    })
    mocks.useSWRInfinite.mockReturnValue(historyHookResult())
    mocks.fetcher.mockResolvedValue(mockHistoryResponse)
  })

  it('loads the v1 read model and shows profile details without turning shared queue work into an agent assignment', () => {
    render(<AutomationAgentsPage />)

    expect(mocks.useSWR).toHaveBeenCalledWith(automationAgentsPath(), expect.any(Function), expect.objectContaining({ refreshInterval: 60_000 }))
    expect(screen.getByRole('heading', { name: 'Equipo de agentes' })).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Páginas individuales de agentes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ada · Frontend' })).toHaveAttribute('href', '/automation/agents/frontend-specialist')
    expect(screen.getByText('Cola compartida')).toBeInTheDocument()
    expect(screen.getByText(/Aún no asignadas a un perfil/)).toBeInTheDocument()
    expect(screen.getByText('Validación')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Ada' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeInTheDocument()
    expect(screen.getByText('Worker · worker-a')).toBeInTheDocument()
    expect(screen.getByText('Máquina · equipo-mex-01')).toBeInTheDocument()
    expect(screen.getByText('Slots ocupados / concurrencia')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('Slots libres efectivos')).toBeInTheDocument()
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.getByText('No reportado por API v1')).toBeInTheDocument()
    expect(screen.getByText('La cola se reporta compartida por operación; la API no asigna tareas en espera a esta máquina.')).toBeInTheDocument()
    expect(screen.getByText('Viva')).toBeInTheDocument()
    expect(screen.getByText(/umbral 90 s/)).toBeInTheDocument()
    expect(screen.getAllByText(/Roster visual/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('link', { name: 'Abrir paso y diario' })).toHaveAttribute('href', '/automation/work-items/work-1?view=overview&step=build&run=run-1')
    expect(screen.getByRole('heading', { name: 'Historial de actividad' })).toBeInTheDocument()
    expect(screen.queryByText('Resumen permitido del evento.')).not.toBeInTheDocument()
    expect(screen.getByText('Ejecución: run-1')).toBeInTheDocument()
    expect(screen.getAllByText('openrouter · small-model').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('link', { name: 'ITBEM' })).toHaveAttribute('href', '/clients/client-1')
    expect(screen.getByRole('link', { name: 'Agent Studio' })).toHaveAttribute('href', '/automation/projects/project-1')
    const taskContextLinks = screen.getAllByRole('link', { name: 'Roster visual · abrir diario de build' })
    expect(taskContextLinks).toHaveLength(2)
    expect(taskContextLinks.every((link) => link.getAttribute('href') === '/automation/work-items/work-1?view=overview&step=build&run=run-1')).toBe(true)
    expect(screen.queryByText(/NO MOSTRAR/)).not.toBeInTheDocument()
    expect(screen.getByText(/No se muestran prompts, salidas ni razonamiento/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(mocks.setHistorySize).toHaveBeenCalledWith(2)
  })

  it('deep-links an allowlisted profile and closing removes only the agent parameter', () => {
    mocks.query = 'tab=roster&source=sidebar'
    window.history.replaceState({}, '', '/automation/agents?tab=roster&source=sidebar#profiles')
    render(<AutomationAgentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Ada' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.push).toHaveBeenCalledWith(
      '/automation/agents?tab=roster&source=sidebar&agent=frontend-specialist#profiles',
      { scroll: false },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle del agente' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.replace).toHaveBeenCalledWith('/automation/agents?tab=roster&source=sidebar#profiles', { scroll: false })
  })

  it('opens a direct link only after resolving its agent key against the loaded snapshot', async () => {
    mocks.query = 'tab=roster&agent=backend-specialist'
    window.history.replaceState({}, '', '/automation/agents?tab=roster&agent=backend-specialist')
    render(<AutomationAgentsPage />)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Grace' })).toBeInTheDocument()
    const latestCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [
      (index: number, previousPage: AutomationAgentHistoryPage | null) => string | null,
    ]
    expect(latestCall[0](0, null)).toContain('/automation/agents/backend-specialist/history?limit=50')
  })

  it('drops unknown or ambiguous agent query values without opening a profile', async () => {
    mocks.query = 'tab=roster&agent=not-in-snapshot'
    window.history.replaceState({}, '', '/automation/agents?tab=roster&agent=not-in-snapshot')
    render(<AutomationAgentsPage />)

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/automation/agents?tab=roster', { scroll: false }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.useSWRInfinite.mock.calls.at(-1)?.[0](0, null)).toBeNull()
  })

  it('invokes the response parser in the SWR loader for the mocked API contract', async () => {
    mocks.useSWR.mockImplementation((key: string | null, loader: (key: string) => Promise<unknown>) => {
      if (key && key === '/automation/agents') void loader(key)
      return { data: key === '/automation/projects' ? mockProjects : mockResponse, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
    })
    mocks.fetcher.mockResolvedValue(mockResponse)

    render(<AutomationAgentsPage />)
    await vi.waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(automationAgentsPath()))
  })

  it('filters the current snapshot locally by profile text and status without changing global queue metrics', () => {
    render(<AutomationAgentsPage />)

    expect(screen.getByText(/Mostrando 2 de 2 perfiles/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar en esta captura'), { target: { value: 'react' } })

    expect(screen.getByRole('button', { name: 'Ver perfil de Ada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver perfil de Grace' })).not.toBeInTheDocument()
    expect(screen.getByText(/Mostrando 1 de 2 perfiles/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar en esta captura'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Estado del perfil'), { target: { value: 'available' } })

    expect(screen.queryByRole('button', { name: 'Ver perfil de Ada' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver perfil de Grace' })).toBeInTheDocument()
    expect(screen.getByText('Cola compartida')).toBeInTheDocument()
    expect(screen.getByText(/alcance autorizado seleccionado/)).toBeInTheDocument()
  })

  it('offers a clear action when local filters have no matching profiles', () => {
    render(<AutomationAgentsPage />)
    fireEvent.change(screen.getByLabelText('Estado del perfil'), { target: { value: 'offline' } })

    expect(screen.getByText('No hay perfiles que coincidan')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByRole('button', { name: 'Ver perfil de Ada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver perfil de Grace' })).toBeInTheDocument()
  })

  it('applies the full history filter set and preserves it when building the next cursor page', async () => {
    mocks.useSWRInfinite.mockImplementation((getKey, loader) => {
      const key = getKey(0, null)
      if (key) void loader(key)
      return historyHookResult()
    })
    render(<AutomationAgentsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Ada' }))
    await vi.waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining('/automation/agents/frontend-specialist/history?limit=50')))

    const historyClientFilter = screen.getByLabelText('Cliente')
    await within(historyClientFilter).findByRole('option', { name: /ITBEM/ })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-23' } })
    fireEvent.change(historyClientFilter, { target: { value: 'client-1' } })
    fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'project-1' } })
    fireEvent.change(screen.getByLabelText('Tarea'), { target: { value: 'work-1' } })
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'delivery.implementation' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'completed' } })
    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: 'openrouter' } })
    fireEvent.change(screen.getByLabelText('Worker'), { target: { value: '11111111-2222-4333-8444-555555555555' } })
    fireEvent.change(screen.getByLabelText('Máquina'), { target: { value: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } })
    fireEvent.change(screen.getByLabelText('Instancia de agente'), { target: { value: 'cccccccc-dddd-4eee-8fff-000000000001' } })
    fireEvent.change(screen.getByLabelText('Ejecución (run)'), { target: { value: 'run-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(mocks.setHistorySize).toHaveBeenCalledWith(1)
    await vi.waitFor(() => expect(mocks.fetcher.mock.calls.some(([path]) => String(path).includes('from=2026-09-01T') && String(path).includes('to=2026-09-24T') && String(path).includes('client_id=client-1'))).toBe(true))
    const filteredRequest = mocks.fetcher.mock.calls.map(([path]) => String(path)).find((path) => path.includes('from=2026-09-01T') && path.includes('to=2026-09-24T'))
    expect(filteredRequest).toBeDefined()
    const filteredParams = new URL(`http://localhost${filteredRequest}`).searchParams
    expect(filteredParams.get('from')).toBe(new Date(2026, 8, 1).toISOString())
    expect(filteredParams.get('to')).toBe(new Date(2026, 8, 24).toISOString())
    expect(filteredParams.get('client_id')).toBe('client-1')
    expect(filteredParams.get('project_id')).toBe('project-1')
    expect(filteredParams.get('work_item_id')).toBe('work-1')
    expect(filteredParams.get('operation')).toBe('delivery.implementation')
    expect(filteredParams.get('status')).toBe('completed')
    expect(filteredParams.get('provider')).toBe('openrouter')
    expect(filteredParams.get('worker_id')).toBe('11111111-2222-4333-8444-555555555555')
    expect(filteredParams.get('machine_id')).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(filteredParams.get('agent_instance_id')).toBe('cccccccc-dddd-4eee-8fff-000000000001')
    expect(filteredParams.get('run_id')).toBe('run-1')

    const latestCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [
      (index: number, previousPage: AutomationAgentHistoryPage | null) => string | null,
    ]
    const nextPageKey = latestCall[0](1, mockHistoryResponse)
    expect(nextPageKey).toContain('cursor=cursor+%2F+p%C3%A1gina+2')
    const nextPageParams = new URL(`http://localhost${nextPageKey}`).searchParams
    expect(nextPageParams.get('from')).toBe(new Date(2026, 8, 1).toISOString())
    expect(nextPageParams.get('to')).toBe(new Date(2026, 8, 24).toISOString())
    expect(nextPageParams.get('client_id')).toBe('client-1')
    expect(nextPageParams.get('project_id')).toBe('project-1')
    expect(nextPageParams.get('work_item_id')).toBe('work-1')
    expect(nextPageParams.get('operation')).toBe('delivery.implementation')
    expect(nextPageParams.get('status')).toBe('completed')
    expect(nextPageParams.get('provider')).toBe('openrouter')
    expect(nextPageParams.get('worker_id')).toBe('11111111-2222-4333-8444-555555555555')
    expect(nextPageParams.get('machine_id')).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(nextPageParams.get('agent_instance_id')).toBe('cccccccc-dddd-4eee-8fff-000000000001')
    expect(nextPageParams.get('run_id')).toBe('run-1')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(mocks.setHistorySize).toHaveBeenCalledWith(2)
  })

  it('refreshes only the latest history page on the active profile and focus', () => {
    render(<AutomationAgentsPage />)
    type HistoryKeyBuilder = (index: number, previousPage: AutomationAgentHistoryPage | null) => string | null
    type HistoryHookCall = [HistoryKeyBuilder, unknown, Record<string, unknown>]
    const callsWhenClosed = mocks.useSWRInfinite.mock.calls as unknown as HistoryHookCall[]
    expect(callsWhenClosed.at(-1)?.[0](0, null)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Ada' }))
    const activeCall = (mocks.useSWRInfinite.mock.calls as unknown as HistoryHookCall[]).at(-1)
    expect(activeCall).toBeDefined()
    const [getHistoryKey, , config] = activeCall!
    expect(config).toMatchObject({
      refreshInterval: 60_000,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
    })
    expect(config.refreshWhenHidden).toBe(false)

    const latestPageKey = getHistoryKey(0, null)
    const cursorPageKey = getHistoryKey(1, mockHistoryResponse)
    expect(latestPageKey).not.toBeNull()
    expect(new URL(`http://localhost${latestPageKey!}`).searchParams.has('cursor')).toBe(false)
    expect(new URL(`http://localhost${cursorPageKey!}`).searchParams.get('cursor')).toBe(mockHistoryResponse.next_cursor)
  })

  it('revalidates the directory on stream events and only the selected profile history first page on updates', async () => {
    mocks.query = 'agent=frontend-specialist'
    window.history.replaceState({}, '', '/automation/agents?agent=frontend-specialist')
    render(<AutomationAgentsPage />)

    await waitFor(() => {
      const call = mocks.useSWRInfinite.mock.calls.at(-1)
      expect(call?.[0](0, null)).not.toBeNull()
    })
    const streamOptions = mocks.useAgentDirectoryStream.mock.calls.at(-1)?.[0] as {
      onSnapshot: (event: { revision: string; generated_at: string }) => void
      onUpdate: (event: { revision: string; generated_at: string }) => void
    }
    const event = { revision: 'directory-r2', generated_at: '2026-09-23T18:20:00Z' }

    streamOptions.onSnapshot(event)
    expect(mocks.mutateDirectory).toHaveBeenCalledTimes(1)
    streamOptions.onUpdate(event)
    expect(mocks.mutateDirectory).toHaveBeenCalledTimes(2)

    const historyMutation = mocks.mutateHistory.mock.calls.at(-1)
    expect(historyMutation?.[0]).toBeUndefined()
    const options = historyMutation?.[1] as { revalidate: (page: AutomationAgentHistoryPage, key: string) => boolean }
    const historyCall = mocks.useSWRInfinite.mock.calls.at(-1)!
    const firstPageKey = historyCall[0](0, null) as string
    const cursorPageKey = historyCall[0](1, mockHistoryResponse) as string
    expect(options.revalidate(mockHistoryResponse, firstPageKey)).toBe(true)
    expect(options.revalidate(mockHistoryResponse, cursorPageKey)).toBe(false)
    expect(mocks.useSWRInfinite.mock.calls.at(-1)?.[2]).toMatchObject({ refreshInterval: 60_000, revalidateAll: false })
  })

  it('keeps organization workspaces off the global directory and requests only a selected visible company', () => {
    mocks.workspaceMode = 'organization'
    mocks.currentClient = { id: 'organization-1', name: 'ITBEM Corp' }
    mocks.useSWR.mockImplementation((key: unknown) => {
      const path = Array.isArray(key) ? key[0] : key
      if (path === '/automation/projects') return { data: mockProjects, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
      if (typeof path === 'string' && path.startsWith('/automation/agents?')) return { data: mockResponse, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
      return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
    })

    const { rerender } = render(<AutomationAgentsPage />)

    expect(screen.getByRole('heading', { name: 'Equipo de agentes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Empresa / cliente del alcance')).toHaveValue('')
    expect(mocks.useSWR.mock.calls.some(([key]) => key === '/automation/agents')).toBe(false)
    expect(mocks.useAgentDirectoryStream.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false })

    fireEvent.change(screen.getByLabelText('Empresa / cliente del alcance'), { target: { value: 'client-1' } })
    expect(mocks.replace).toHaveBeenCalledWith('/automation/agents?client_id=client-1', { scroll: false })
    rerender(<AutomationAgentsPage />)
    expect(mocks.useSWR).toHaveBeenCalledWith('/automation/agents?client_id=client-1', expect.any(Function), expect.any(Object))
    expect(screen.getByRole('button', { name: 'Ver perfil de Ada' })).toBeInTheDocument()
    expect(mocks.useSWR.mock.calls.some(([key]) => key === '/automation/agents')).toBe(false)
    expect(mocks.useAgentDirectoryStream.mock.calls.at(-1)?.[0]).toMatchObject({
      enabled: true,
      client_id: 'client-1',
      project_id: '',
    })
  })

  it('includes selected client/project in roster, profile link, and bounded history keys', () => {
    mocks.query = 'client_id=client-1&project_id=project-1'
    window.history.replaceState({}, '', '/automation/agents?client_id=client-1&project_id=project-1')
    render(<AutomationAgentsPage />)

    expect(mocks.useSWR).toHaveBeenCalledWith('/automation/agents?client_id=client-1&project_id=project-1', expect.any(Function), expect.any(Object))
    expect(mocks.useAgentDirectoryStream.mock.calls.at(-1)?.[0]).toMatchObject({
      enabled: true,
      client_id: 'client-1',
      project_id: 'project-1',
    })
    expect(screen.getByLabelText('Proyecto del alcance')).toHaveValue('project-1')
    expect(screen.getByRole('link', { name: 'Ada · Frontend' })).toHaveAttribute('href', '/automation/agents/frontend-specialist?client_id=client-1&project_id=project-1')
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Ada' }))

    const latestCall = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [(index: number, previousPage: AutomationAgentHistoryPage | null) => string | null]
    const key = latestCall[0](0, null)
    const filters = new URL(`http://localhost${key}`).searchParams
    expect(filters.get('client_id')).toBe('client-1')
    expect(filters.get('project_id')).toBe('project-1')
  })

  it('does not keep rendering a prior-scope roster while the newly selected scope loads', () => {
    const secondProject = {
      ...mockProjects[0],
      id: 'project-2',
      client_id: 'client-2',
      name: 'Second project',
      slug: 'second-project',
      client: { id: 'client-2', name: 'Second client' },
    }
    mocks.query = 'client_id=client-1&project_id=project-1'
    window.history.replaceState({}, '', '/automation/agents?client_id=client-1&project_id=project-1')
    mocks.useSWR.mockImplementation((key: unknown) => {
      const path = Array.isArray(key) ? key[0] : key
      if (path === '/automation/projects') {
        return { data: [...mockProjects, secondProject], error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
      }
      if (path === '/automation/agents?client_id=client-1&project_id=project-1') {
        return { data: mockResponse, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
      }
      if (path === '/automation/agents?client_id=client-2&project_id=project-2') {
        return { data: undefined, error: undefined, isLoading: true, isValidating: false, mutate: mocks.mutateDirectory }
      }
      return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutateDirectory }
    })

    const { rerender } = render(<AutomationAgentsPage />)
    expect(screen.getByText('Ada')).toBeInTheDocument()

    mocks.query = 'client_id=client-2&project_id=project-2'
    window.history.replaceState({}, '', '/automation/agents?client_id=client-2&project_id=project-2')
    rerender(<AutomationAgentsPage />)

    expect(screen.queryByText('Ada')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Cargando equipo de agentes' })).toBeInTheDocument()
    const latestDirectoryRequest = mocks.useSWR.mock.calls.at(-1)
    expect(latestDirectoryRequest?.[0]).toBe('/automation/agents?client_id=client-2&project_id=project-2')
    expect(latestDirectoryRequest?.[2]).toMatchObject({ keepPreviousData: false })
    expect(mocks.useAgentDirectoryStream.mock.calls.at(-1)?.[0]).toMatchObject({
      client_id: 'client-2',
      project_id: 'project-2',
    })
  })
})
