import {
  DELIVERY_PLAN_ASSIGNMENT_EVENTS_PAGE_SIZE,
  deliveryPlanAssignmentEventsPath,
  parseDeliveryPlanAssignmentEvents,
  type DeliveryPlanAssignmentEvent,
  type DeliveryPlanAssignmentEventsPage,
} from '@/features/automation/delivery-plan-assignment-events'
import { DeliveryPlanAssignmentEventTimeline } from '@/features/automation/delivery-plan-assignment-event-timeline'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetcher: vi.fn() }))

vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))

const planId = '10000000-0000-4000-8000-000000000001'
const stepId = '20000000-0000-4000-8000-000000000001'
const assignmentId = '30000000-0000-4000-8000-000000000001'
const executionId = '40000000-0000-4000-8000-000000000001'
const parentTaskId = '50000000-0000-4000-8000-000000000001'
const taskId = '60000000-0000-4000-8000-000000000001'
const machineId = '70000000-0000-4000-8000-000000000001'

const event: DeliveryPlanAssignmentEvent = {
  id: '80000000-0000-4000-8000-000000000001',
  assignment_id: assignmentId,
  execution_id: executionId,
  step_id: stepId,
  parent_task_id: parentTaskId,
  task_id: taskId,
  event_type: 'assignment_created',
  previous_status: '',
  status: 'queued',
  previous_target_agent_key: '',
  target_agent_key: 'builder',
  previous_target_machine_id: '',
  target_machine_id: machineId,
  occurred_at: '2026-09-24T10:15:00Z',
}

function page(overrides: Partial<DeliveryPlanAssignmentEventsPage> = {}): DeliveryPlanAssignmentEventsPage {
  return {
    plan_id: planId,
    plan_version: 2,
    items: [event],
    next_cursor: null,
    ...overrides,
  }
}

function renderTimeline() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
      <DeliveryPlanAssignmentEventTimeline planId={planId} planVersion={2} />
    </SWRConfig>,
  )
}

describe('delivery plan assignment event timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetcher.mockResolvedValue(page())
  })

  it('builds a stable endpoint URL with cursor and supported filters', () => {
    expect(DELIVERY_PLAN_ASSIGNMENT_EVENTS_PAGE_SIZE).toBe(25)
    expect(deliveryPlanAssignmentEventsPath(planId, 'opaque cursor', {
      step_id: stepId,
      assignment_id: assignmentId,
      task_id: taskId,
      status: 'running',
      agent_key: 'builder',
      machine_id: machineId,
    })).toBe(
      `/automation/plans/${planId}/assignment-events?limit=25&cursor=opaque+cursor&step_id=${stepId}&assignment_id=${assignmentId}&task_id=${taskId}&status=running&agent_key=builder&machine_id=${machineId}`,
    )
  })

  it('parses only the DTO allowlist and normalizes the endpoint empty cursor', () => {
    expect(parseDeliveryPlanAssignmentEvents(
      { ...page(), next_cursor: '' },
      { planId, planVersion: 2 },
    ).next_cursor).toBeNull()
    expect(() => parseDeliveryPlanAssignmentEvents(
      { ...page(), items: [{ ...event, reasoning: 'do not expose' }] },
      { planId, planVersion: 2 },
    )).toThrow('formato permitido')
    expect(() => parseDeliveryPlanAssignmentEvents(page(), { planId, planVersion: 3 })).toThrow('no corresponde')
  })

  it('does not fetch until opened and renders only assignment metadata', async () => {
    renderTimeline()
    expect(mocks.fetcher).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ver historial de asignaciones' }))
    expect(await screen.findByText('Asignación creada')).toBeInTheDocument()
    expect(screen.getByText(/builder ·/)).toBeInTheDocument()
    expect(screen.getByText(taskId)).toBeInTheDocument()
    expect(screen.getByText(/builder · 70000000-/)).toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledWith(`/automation/plans/${planId}/assignment-events?limit=25`)
    expect(screen.queryByText(/private-reasoning-canary|secret-output-canary/i)).not.toBeInTheDocument()
  })

  it('applies all supported filters and resets the cursor history', async () => {
    mocks.fetcher.mockImplementation((path: string) => Promise.resolve(page({ next_cursor: path.includes('status=') ? null : 'older-cursor' })))
    renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial de asignaciones' }))
    expect(await screen.findByText('Asignación creada')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining('cursor=older-cursor')))

    fireEvent.change(screen.getByLabelText('ID del paso'), { target: { value: stepId } })
    fireEvent.change(screen.getByLabelText('ID de asignación'), { target: { value: assignmentId } })
    fireEvent.change(screen.getByLabelText('ID de tarea'), { target: { value: taskId } })
    fireEvent.change(screen.getByLabelText('Clave de agente'), { target: { value: 'builder' } })
    fireEvent.change(screen.getByLabelText('ID del equipo'), { target: { value: machineId } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'running' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(mocks.fetcher).toHaveBeenLastCalledWith(
      `/automation/plans/${planId}/assignment-events?limit=25&step_id=${stepId}&assignment_id=${assignmentId}&task_id=${taskId}&status=running&agent_key=builder&machine_id=${machineId}`,
    ))
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })

  it('validates UUID filters locally and provides previous/next cursor navigation', async () => {
    mocks.fetcher.mockImplementation((path: string) => Promise.resolve(
      page({
        items: [{ ...event, id: path.includes('cursor=') ? '80000000-0000-4000-8000-000000000002' : event.id }],
        next_cursor: path.includes('cursor=') ? null : 'older-cursor',
      }),
    ))
    renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial de asignaciones' }))
    expect(await screen.findByText('Asignación creada')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('ID del paso'), { target: { value: 'not-a-uuid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('debe ser un UUID válido')
    expect(mocks.fetcher).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('ID del paso'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith(expect.stringContaining('cursor=older-cursor')))
    expect(await screen.findByText(/Página 2 ·/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
    expect(await screen.findByText(/Página 1 ·/)).toBeInTheDocument()
  })

  it('shows empty and recoverable error states', async () => {
    mocks.fetcher.mockRejectedValueOnce(new Error('fallo temporal')).mockResolvedValueOnce(page({ items: [] }))
    renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial de asignaciones' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('fallo temporal')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('status', { name: 'Historial de asignaciones vacío' })).toHaveTextContent(
      'No hay movimientos para este plan con los filtros seleccionados.',
    )
  })
})
