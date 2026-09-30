import { AutomationRecurrencesScreen } from '@/features/automation/recurrences-screen'
import { recurrenceScheduleActionPath, recurrenceSchedulesPath } from '@/features/automation/recurrence-schedules'
import { deliveryProjectPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  useSWRInfinite: vi.fn(),
  useRecurrenceHistory: vi.fn(),
  apiPost: vi.fn(),
  setSize: vi.fn(),
  mutate: vi.fn(),
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('swr/infinite', () => ({ default: mocks.useSWRInfinite }))
vi.mock('@/lib/api', () => ({ api: { post: mocks.apiPost } }))
vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }))
vi.mock('@/features/automation/use-recurrence-history', () => ({ useRecurrenceHistory: mocks.useRecurrenceHistory }))

const project = {
  id: 'project-1', client_id: 'client-1', name: 'EventiApp', slug: 'eventiapp', summary: 'Proyecto de prueba', status: 'active',
  created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-25T12:00:00Z', client: { id: 'client-1', name: 'ITBEM' },
  context: [{ id: 'source-1', kind: 'repository', name: 'Backend API', reference: 'workspace://repo-1', revision: 'main', status: 'ready' }],
}

const schedule = {
  id: 'schedule-1', project_id: 'project-1', name: 'Revisión semanal', status: 'active',
  template: {
    title: 'Revisar dependencias', description: 'Preparar revisión con evidencia.', expected_outcome: 'Propuesta en Planeación.',
    context_source_ids: ['source-1'], primary_repository_source_id: 'source-1', included_scope: ['Dependencias'], excluded_scope: ['Publicar'],
    acceptance_criteria: ['La revisión queda documentada'], budget_microusd: 50_000, budget_alert_percent: 80, max_concurrency: 1,
  },
  recurrence: { frequency: 'weekly', interval: 1, weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], local_time: '09:00', time_zone: 'America/Mexico_City', starts_on: '2026-09-28', misfire_policy: 'coalesce' },
  next_run_at: '2026-09-28T15:00:00Z', next_run_local: '2026-09-28T09:00:00-06:00', last_run_at: null, revision: 2,
  created_at: '2026-09-25T12:00:00Z', updated_at: '2026-09-25T12:00:00Z',
}

function infiniteResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [{ items: [], limit: 25, offset: 0, next_offset: undefined }], error: undefined, isLoading: false, isValidating: false,
    size: 1, setSize: mocks.setSize, mutate: mocks.mutate, ...overrides,
  }
}

function setup({ page = infiniteResult() }: { page?: Record<string, unknown> } = {}) {
  mocks.useSWR.mockImplementation((key: string) => key === deliveryProjectsPath()
    ? { data: [project], error: undefined, isLoading: false, mutate: mocks.mutate }
    : key === deliveryProjectPath(project.id)
      ? { data: project, error: undefined, isLoading: false, mutate: mocks.mutate }
      : { data: undefined, error: undefined, isLoading: false, mutate: mocks.mutate })
  mocks.useSWRInfinite.mockReturnValue(page)
  return render(<AutomationRecurrencesScreen />)
}

describe('AutomationRecurrencesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutate.mockResolvedValue(undefined)
    mocks.setSize.mockResolvedValue(undefined)
    mocks.apiPost.mockResolvedValue({ data: { status: 201, message: 'created', data: schedule } })
    mocks.useRecurrenceHistory.mockReturnValue({
      occurrences: { items: [], isLoading: false, isValidating: false, hasMore: false, offsetLimitReached: false, loadMore: vi.fn(), refresh: vi.fn() },
      events: { items: [], isLoading: false, isValidating: false, hasMore: false, offsetLimitReached: false, loadMore: vi.fn(), refresh: vi.fn() },
    })
  })

  it('explains planning and human gates and shows a truthful empty state', () => {
    setup()
    expect(screen.getByText(/Cada ocurrencia crea trabajo en Planeación/)).toBeInTheDocument()
    expect(screen.getByText(/Los gates humanos siguen vigentes/)).toBeInTheDocument()
    expect(screen.getByText(/no se seleccionan aquí/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Este proyecto aún no tiene recurrencias' })).toBeInTheDocument()
  })

  it('uses project-scoped offset pagination and server data', async () => {
    setup({ page: infiniteResult({ data: [{ items: [schedule], limit: 25, offset: 0, next_offset: 25 }] }) })

    expect(await screen.findByRole('heading', { name: 'Revisión semanal' })).toBeInTheDocument()
    expect(screen.getByText(/Lunes|lun\./i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más recurrencias' }))
    await waitFor(() => expect(mocks.setSize).toHaveBeenCalledWith(2))

    const [getKey] = mocks.useSWRInfinite.mock.calls.at(-1) as unknown as [(index: number, previous: { next_offset?: number } | null) => string | null]
    expect(getKey(0, null)).toBe(recurrenceSchedulesPath(project.id))
    expect(getKey(1, { next_offset: 25 })).toBe(recurrenceSchedulesPath(project.id, 25))
  })

  it('loads and shows the schedule history only after expansion, including statuses, failure and work-item link', async () => {
    mocks.useRecurrenceHistory.mockReturnValue({
      occurrences: {
        items: [{
          id: 'occurrence-1', schedule_id: schedule.id, schedule_revision: 2,
          scheduled_for: '2026-09-28T15:00:00Z', local_occurrence: '2026-09-28T09:00', time_zone: 'America/Mexico_City',
          status: 'blocked', work_item_id: null, failure_code: 'context_not_ready', created_at: '2026-09-28T15:00:01Z', materialized_at: null,
        }],
        isLoading: false, isValidating: false, hasMore: false, offsetLimitReached: false, loadMore: vi.fn(), refresh: vi.fn(),
      },
      events: {
        items: [{
          id: 'event-1', schedule_id: schedule.id, occurrence_id: null, work_item_id: '123e4567-e89b-42d3-a456-426614174000',
          event_type: 'occurrence_materialized', occurred_at: '2026-09-28T15:00:01Z',
        }],
        isLoading: false, isValidating: false, hasMore: false, offsetLimitReached: false, loadMore: vi.fn(), refresh: vi.fn(),
      },
    })
    setup({ page: infiniteResult({ data: [{ items: [schedule], limit: 25, offset: 0 }] }) })

    expect(mocks.useRecurrenceHistory).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver historial' }))

    expect(await screen.findByText('Bloqueada')).toBeInTheDocument()
    expect(screen.getByText(/El contexto del proyecto no estaba listo/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir tarea en Planeación' })).toHaveAttribute('href', '/automation/work-items/123e4567-e89b-42d3-a456-426614174000')
    expect(screen.getByText(/Eso no significa que un agente la haya ejecutado o completado/)).toBeInTheDocument()
    expect(mocks.useRecurrenceHistory).toHaveBeenCalledWith('project-1', schedule.id)
  })

  it('creates a recurrence from the form and revalidates the server list', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Nueva recurrencia' }))
    fireEvent.change(screen.getByLabelText('Nombre de la recurrencia'), { target: { value: 'Revisión semanal' } })
    fireEvent.change(screen.getByLabelText('Título de la tarea que aparecerá en Planeación'), { target: { value: 'Revisar dependencias' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Preparar revisión con evidencia.' } })
    fireEvent.change(screen.getByLabelText('Resultado esperado'), { target: { value: 'Propuesta en Planeación.' } })
    fireEvent.click(screen.getByLabelText(/Backend API/))
    fireEvent.change(screen.getByLabelText(/Repositorio principal/), { target: { value: 'source-1' } })
    fireEvent.change(screen.getByLabelText('Zona horaria'), { target: { value: 'America/Mexico_City' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear recurrencia' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('/automation/projects/project-1/schedules', expect.objectContaining({
      name: 'Revisión semanal',
      template: expect.objectContaining({ context_source_ids: ['source-1'], primary_repository_source_id: 'source-1', budget_microusd: 50_000 }),
      recurrence: expect.objectContaining({ frequency: 'weekly', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], misfire_policy: 'coalesce', time_zone: 'America/Mexico_City' }),
    })))
    expect(await screen.findByRole('status')).toHaveTextContent('El servidor creó “Revisión semanal”')
    expect(mocks.mutate).toHaveBeenCalled()
    expect(screen.queryByLabelText('Descripción')).not.toBeInTheDocument()
  })

  it('does not claim creation when the API denies the request', async () => {
    mocks.apiPost.mockRejectedValueOnce({ response: { status: 403 } })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Nueva recurrencia' }))
    fireEvent.change(screen.getByLabelText('Nombre de la recurrencia'), { target: { value: 'No autorizada' } })
    fireEvent.change(screen.getByLabelText('Título de la tarea que aparecerá en Planeación'), { target: { value: 'Revisión' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Descripción.' } })
    fireEvent.change(screen.getByLabelText('Resultado esperado'), { target: { value: 'Resultado.' } })
    fireEvent.click(screen.getByLabelText(/Backend API/))
    fireEvent.click(screen.getByRole('button', { name: 'Crear recurrencia' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no tiene autorización')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('submits the backend monthly cadence using month_day', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Nueva recurrencia' }))
    fireEvent.change(screen.getByLabelText('Nombre de la recurrencia'), { target: { value: 'Revisión mensual' } })
    fireEvent.change(screen.getByLabelText('Título de la tarea que aparecerá en Planeación'), { target: { value: 'Revisar el proyecto' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Revisión mensual.' } })
    fireEvent.change(screen.getByLabelText('Resultado esperado'), { target: { value: 'Hallazgos en Planeación.' } })
    fireEvent.click(screen.getByLabelText(/Backend API/))
    fireEvent.change(screen.getByLabelText('Frecuencia'), { target: { value: 'monthly' } })
    fireEvent.change(screen.getByLabelText('Día del mes'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear recurrencia' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('/automation/projects/project-1/schedules', expect.objectContaining({
      recurrence: expect.objectContaining({ frequency: 'monthly', month_day: 15, misfire_policy: 'coalesce' }),
    })))
    // Select the monthly submission explicitly, independent of earlier submits.
    const body = mocks.apiPost.mock.calls.findLast(([, body]) => body?.recurrence?.frequency === 'monthly')?.[1] as { recurrence: Record<string, unknown> }
    expect(body.recurrence).not.toHaveProperty('weekdays')
  })

  it('pauses active schedules through the project action endpoint and then revalidates', async () => {
    setup({ page: infiniteResult({ data: [{ items: [schedule] }] }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(recurrenceScheduleActionPath(project.id, schedule.id, 'pause'), {}))
    expect(await screen.findByRole('status')).toHaveTextContent('El servidor aceptó la solicitud de pausa')
    expect(mocks.mutate).toHaveBeenCalled()
  })

  it('shows loading and API errors without replacing them with empty data', () => {
    const loading = setup({ page: infiniteResult({ data: undefined, isLoading: true }) })
    expect(screen.getByRole('status')).toHaveTextContent('Cargando recurrencias autorizadas')
    loading.unmount()
    setup({ page: infiniteResult({ data: undefined, error: { response: { status: 404 } }, isLoading: false }) })
    expect(screen.getByRole('alert')).toHaveTextContent('API de recurrencias todavía no está disponible')
  })
})
