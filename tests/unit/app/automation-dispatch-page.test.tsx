import AutomationDispatchPage from '@/app/(app)/automation/dispatch/page'
import { automationAgentDirectoryPath } from '@/features/automation/agent-directory'
import { automationDispatchQueuePath } from '@/lib/api-paths'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store/useStore'

const mocks = vi.hoisted(() => ({ useSWR: vi.fn(), useSWRInfinite: vi.fn(), fetcher: vi.fn(), setSize: vi.fn(), mutate: vi.fn() }))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('swr/infinite', () => ({ default: mocks.useSWRInfinite }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('@/features/automation/use-agent-directory-stream', () => ({ useAgentDirectoryStream: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))

const item = {
  assignment_id: 'assignment-1', execution_id: 'execution-1', step_id: 'step-1', step_key: 'implement_api', step_title: 'Implementar API',
  step_status: 'ready', assignment_status: 'queued', work_item_id: 'work-1', work_item_title: 'Panel de agentes', work_item_state: 'in_progress',
  project_id: 'project-1', project_name: 'Agent Studio', client_id: 'client-1', client_name: 'ITBEM', target_agent_key: 'backend-specialist',
  target_machine_id: 'machine-1', target_availability: 'working', target_concurrency: 3, target_active_runs: 1,
  target_available_slots: 2, target_last_seen_at: '2026-09-24T14:59:45Z', queued_at: '2026-09-24T15:00:00Z', dispatched_at: null, started_at: null,
  created_at: '2026-09-24T14:59:00Z', is_ready: true,
}
const page = {
  schema_version: 1,
  generated_at: '2026-09-24T15:00:00Z',
  blocked_assignments: 2,
  expired_plan_step_leases: 1,
  items: [item],
  next_cursor: 'opaque-cursor',
}
const directorySnapshot = {
  schema_version: 1,
  generated_at: '2026-09-24T15:00:00Z',
  summary: { profile_count: 2, live_instances: 2, active_runs: 1, available_slots: 4, queued_tasks: 4, spend_30d_microusd: 0 },
  agents: [
    {
      agent_key: 'backend-specialist', name: 'Atlas', specialty: 'Ingeniería', description: 'Implementación y desarrollo', capabilities: ['delivery.implementation'],
      status: 'working', instance_count: 1, active_run_count: 1, total_runs_30d: 0, spend_30d_microusd: 0,
      instances: [{
        worker_id: 'worker-1', machine_id: 'machine-1', protocols: ['delivery.plan_steps.v1'], status: 'working', provider: 'openrouter', model: 'cheap-model',
        concurrency: 3, draining: false, started_at: '2026-09-24T14:00:00Z', last_seen_at: '2026-09-24T14:59:45Z',
        active_runs: [{ task_id: 'work-1', run_id: 'run-1', operation: 'delivery.implementation', status: 'running', client_id: 'client-1', client_name: 'ITBEM', project_id: 'project-1', project_name: 'Agent Studio', work_item_id: 'work-1', work_item_title: 'Panel de agentes', step_key: 'implement_api' }],
      }],
    },
    {
      agent_key: 'qa-specialist', name: 'Lía', specialty: 'QA', description: 'Pruebas', capabilities: ['delivery.qa'],
      status: 'available', instance_count: 1, active_run_count: 0, total_runs_30d: 0, spend_30d_microusd: 0,
      instances: [{
        worker_id: 'worker-2', machine_id: 'machine-2', protocols: [], status: 'available', provider: 'openrouter', model: 'cheap-model',
        concurrency: 2, draining: false, started_at: '2026-09-24T14:00:00Z', last_seen_at: '2026-09-24T14:59:50Z', active_runs: [],
      }],
    },
  ],
  queue_lanes: [{ operation: 'delivery.implementation', queued_tasks: 4 }],
}

describe('Automation dispatch page', () => {
  beforeEach(() => {
    // Other page tests persistently switch the global Zustand workspace. Keep
    // this platform-wide queue test independent of the suite execution order.
    useStore.setState({ workspaceMode: 'platform', currentClient: null })
    mocks.useSWR.mockReset().mockImplementation((key) => {
      const path = Array.isArray(key) ? key[0] : key
      if (typeof path === 'string' && path.startsWith('/automation/agents')) {
        return { data: directorySnapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutate }
      }
      return {
        data: [{ id: 'project-1', client_id: 'client-1', name: 'Agent Studio', client: { id: 'client-1', name: 'ITBEM' } }],
        error: undefined,
        isLoading: false,
        mutate: mocks.mutate,
      }
    })
    mocks.useSWRInfinite.mockReset().mockReturnValue({ data: [page], error: undefined, isLoading: false, isValidating: false, size: 1, setSize: mocks.setSize, mutate: mocks.mutate })
    mocks.fetcher.mockReset()
    mocks.setSize.mockReset()
    mocks.mutate.mockReset()
  })

  it('shows server-assigned steps grouped by local agent and machine without fake reassignment controls', () => {
    render(<AutomationDispatchPage />)
    expect(screen.getByRole('heading', { name: 'Colas y despacho' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Secciones de agentes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Recurrentes' })).toHaveAttribute('href', '/automation/recurrences')
    expect(screen.getByRole('region', { name: 'Resumen del despacho' })).toHaveTextContent('Snapshot operativo de agentes')
    expect(screen.getByRole('region', { name: 'Salud de asignaciones' })).toHaveTextContent('Asignaciones bloqueadas2')
    expect(screen.getByRole('region', { name: 'Salud de asignaciones' })).toHaveTextContent('Leases de pasos vencidos1')
    expect(screen.getByRole('region', { name: 'Instancias de trabajo (workers)' })).toHaveTextContent('2 instancias en la captura')
    expect(screen.getByText(/Máquina · machine-2/)).toBeInTheDocument()
    expect(screen.getByText('Sin protocolo de pasos')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Panel de agentes' })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Agent Studio' })).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'backend-specialist · machine-1' })).toBeInTheDocument()
    expect(screen.getByText('Paso listo y dependencias resueltas')).toBeInTheDocument()
    expect(screen.getByText('Trabajando')).toBeInTheDocument()
    expect(screen.getByText('2/3 espacios libres')).toBeInTheDocument()
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /asignar|reasignar|repartir/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargar más asignaciones' })).toBeInTheDocument()
  })

  it('does not claim cross-project free capacity in an organization-scoped view', () => {
    useStore.setState({ workspaceMode: 'organization', currentClient: { id: 'client-1', name: 'ITBEM' } as never })
    render(<AutomationDispatchPage />)

    expect(screen.getByText('Slots disponibles').nextElementSibling).toHaveTextContent('—')
    expect(screen.getAllByText(/no se calcula capacidad libre entre proyectos/i)).toHaveLength(3)
    expect(screen.getByText(/instancias con actividad autorizada/i)).toBeInTheDocument()
    const directoryKey = mocks.useSWR.mock.calls.find(([key]) => Array.isArray(key) && String(key[0]).startsWith('/automation/agents'))?.[0]
    expect(directoryKey?.[0]).toBe(automationAgentDirectoryPath({ client_id: 'client-1' }))
  })

  it('sends exact server-side filters and cursor on demand', () => {
    render(<AutomationDispatchPage />)
    fireEvent.change(screen.getByLabelText('Estado de asignación'), { target: { value: 'queued' } })
    fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'project-1' } })
    fireEvent.change(screen.getByLabelText('Clave de agente'), { target: { value: ' backend-specialist ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    const [getKey] = mocks.useSWRInfinite.mock.calls.at(-1)!
    const firstPageKey = getKey(0, null)
    const nextPageKey = getKey(1, page)
    expect(firstPageKey?.[0]).toBe(automationDispatchQueuePath({ page_size: 25, status: 'queued', project_id: 'project-1', agent_key: 'backend-specialist' }))
    expect(nextPageKey?.[0]).toBe(automationDispatchQueuePath({ page_size: 25, cursor: 'opaque-cursor', status: 'queued', project_id: 'project-1', agent_key: 'backend-specialist' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más asignaciones' }))
    expect(mocks.setSize).toHaveBeenCalledWith(2)
  })

  it('renders explicit loading, API error, and empty states', () => {
    mocks.useSWRInfinite.mockReturnValueOnce({ data: undefined, error: undefined, isLoading: true, isValidating: true, size: 1, setSize: mocks.setSize, mutate: mocks.mutate })
    const loading = render(<AutomationDispatchPage />)
    expect(screen.getByRole('status')).toHaveTextContent(/cargando asignaciones/i)
    loading.unmount()

    mocks.useSWRInfinite.mockReturnValueOnce({ data: undefined, error: new Error('unavailable'), isLoading: false, isValidating: false, size: 1, setSize: mocks.setSize, mutate: mocks.mutate })
    const failure = render(<AutomationDispatchPage />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo cargar la cola/i)
    failure.unmount()

    mocks.useSWRInfinite.mockReturnValueOnce({ data: [{ ...page, items: [], next_cursor: undefined }], error: undefined, isLoading: false, isValidating: false, size: 1, setSize: mocks.setSize, mutate: mocks.mutate })
    render(<AutomationDispatchPage />)
    expect(screen.getByRole('heading', { name: 'No hay asignaciones para mostrar' })).toBeInTheDocument()
  })
})
