import { ApprovedPlanRoadmap } from '@/features/automation/approved-plan-roadmap'
import type { DeliveryPlanStepEventsPage } from '@/features/automation/delivery-plan-step-events'
import type { DeliveryPlanStepsSnapshot } from '@/features/automation/delivery-plan-steps'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get: mocks.get } }))

const snapshot: DeliveryPlanStepsSnapshot = {
  plan_id: 'plan-1',
  plan_version: 3,
  items: [
    {
      id: 'step/one',
      plan_id: 'plan-1',
      plan_version: 3,
      step_key: 'implement',
      order: 0,
      title: 'Implementar cambio',
      objective: 'Ejecutar el cambio con seguridad.',
      acceptance_criteria: [],
      depends_on: [],
      status: 'running',
      created_at: '2026-09-23T10:00:00Z',
      updated_at: '2026-09-23T10:10:00Z',
    },
  ],
  total: 1,
}

const recentEvent: DeliveryPlanStepEventsPage['items'][number] = {
  id: 'event-1',
  event_type: 'status_transitioned',
  from_status: 'ready',
  to_status: 'running',
  automation_task_id: 'd4a4b837-2e18-43af-9f58-6d59629db2bb',
  run_id: '9f5d9d66-e58d-4357-8869-83f09bca8222',
  agent_key: 'backend-engineer',
  machine_id: 'b69b7f51-58b9-4f0e-aef3-1fbc23f79827',
  worker_id: 'f9e53a6f-9cda-4e84-88d4-bbac93addd11',
  summary: 'Step status changed',
  occurred_at: '2026-09-23T10:11:00Z',
}

function apiResponse(data: unknown) {
  return { data: { status: 200, message: 'ok', data } }
}

function page(overrides: Partial<DeliveryPlanStepEventsPage> = {}): DeliveryPlanStepEventsPage {
  return {
    plan_id: 'plan-1',
    plan_version: 3,
    step_id: 'step/one',
    items: [recentEvent],
    next_cursor: null,
    ...overrides,
  }
}

function renderRoadmap() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
      <ApprovedPlanRoadmap planId="plan-1" version={3} steps={['Implementar cambio']} qa={[]} evidence={[]} />
    </SWRConfig>
  )
}

describe('ApprovedPlanRoadmap step event history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation((path: string) =>
      path.endsWith('/steps') ? Promise.resolve(apiResponse(snapshot)) : Promise.resolve(apiResponse(page()))
    )
  })

  it('fetches activity only after a step history is opened and shows the safe actor summary and timestamp', async () => {
    renderRoadmap()

    expect(await screen.findByRole('heading', { name: 'Implementar cambio' })).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(recentEvent.summary)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver historial del paso' }))

    expect(await screen.findByText(recentEvent.summary)).toBeInTheDocument()
    expect(screen.getByText('backend-engineer')).toBeInTheDocument()
    expect(screen.getByText('b69b7f51-58b9-4f0e-aef3-1fbc23f79827')).toBeInTheDocument()
    expect(screen.getByText('f9e53a6f-9cda-4e84-88d4-bbac93addd11')).toBeInTheDocument()
    expect(screen.getByText('9f5d9d66-e58d-4357-8869-83f09bca8222')).toBeInTheDocument()
    expect(screen.getByText('Estado: ready → running')).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === 'time' && element.getAttribute('dateTime') === recentEvent.occurred_at
      )
    ).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('/automation/plans/plan-1/steps/step%2Fone/events?limit=25')
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('fails closed instead of rendering events with non-allowlisted or private fields', async () => {
    mocks.get.mockImplementation((path: string) =>
      path.endsWith('/steps')
        ? Promise.resolve(apiResponse(snapshot))
        : Promise.resolve(
            apiResponse(
              page({
                items: [
                  {
                    ...recentEvent,
                    fencing_token: 'fencing-canary',
                    private_reasoning: 'reasoning-canary',
                    api_key: 'sk-canary-secret',
                    arbitrary_debug_text: 'arbitrary-text-canary',
                  } as DeliveryPlanStepEventsPage['items'][number],
                ],
              })
            )
          )
    )
    renderRoadmap()

    await screen.findByRole('heading', { name: 'Implementar cambio' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial del paso' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('formato esperado')
    expect(screen.queryByText(recentEvent.summary)).not.toBeInTheDocument()
    expect(screen.queryByText('reasoning-canary')).not.toBeInTheDocument()
    expect(screen.queryByText('sk-canary-secret')).not.toBeInTheDocument()
    expect(screen.queryByText('arbitrary-text-canary')).not.toBeInTheDocument()
  })

  it('loads older events only when the cursor button is activated', async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/steps')) return Promise.resolve(apiResponse(snapshot))
      if (path.includes('cursor=opaque%2Bcursor'))
        return Promise.resolve(
          apiResponse(
            page({
              items: [{ ...recentEvent, id: 'event-older', event_type: 'step_ready', summary: 'Step ready' }],
              next_cursor: null,
            })
          )
        )
      return Promise.resolve(apiResponse(page({ next_cursor: 'opaque+cursor' })))
    })
    renderRoadmap()

    await screen.findByRole('heading', { name: 'Implementar cambio' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial del paso' }))
    expect(await screen.findByText(recentEvent.summary)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargar anteriores' })).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Cargar anteriores' }))

    expect(await screen.findByText('Step ready')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith(
      '/automation/plans/plan-1/steps/step%2Fone/events?limit=25&cursor=opaque%2Bcursor'
    )
  })

  it.each([
    ['plan', { plan_id: 'another-plan' }],
    ['version', { plan_version: 2 }],
    ['step', { step_id: 'another-step' }],
  ] as const)('rejects a response for a different %s instead of displaying its events', async (_identity, mismatch) => {
    mocks.get.mockImplementation((path: string) =>
      path.endsWith('/steps') ? Promise.resolve(apiResponse(snapshot)) : Promise.resolve(apiResponse(page(mismatch)))
    )
    renderRoadmap()

    await screen.findByRole('heading', { name: 'Implementar cambio' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial del paso' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no corresponde a este plan y paso')
    expect(screen.queryByText(recentEvent.summary)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('keeps the first page and recovers when loading an older page fails', async () => {
    let olderPageAttempts = 0
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/steps')) return Promise.resolve(apiResponse(snapshot))
      if (path.includes('cursor=older-cursor')) {
        olderPageAttempts += 1
        return olderPageAttempts === 1
          ? Promise.reject(new Error('falló la página anterior'))
          : Promise.resolve(
              apiResponse(
                page({
                  items: [{ ...recentEvent, id: 'event-older', summary: 'Evento histórico recuperado.' }],
                  next_cursor: null,
                })
              )
            )
      }
      return Promise.resolve(apiResponse(page({ next_cursor: 'older-cursor' })))
    })
    renderRoadmap()

    await screen.findByRole('heading', { name: 'Implementar cambio' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial del paso' }))
    expect(await screen.findByText(recentEvent.summary)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar anteriores' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('falló la página anterior')
    expect(screen.getByText(recentEvent.summary)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Evento histórico recuperado.')).toBeInTheDocument()
    expect(olderPageAttempts).toBe(2)
  })

  it('shows the empty state when there are no step events', async () => {
    mocks.get.mockImplementation((path: string) =>
      path.endsWith('/steps')
        ? Promise.resolve(apiResponse(snapshot))
        : Promise.resolve(apiResponse(page({ items: [] })))
    )
    renderRoadmap()

    await screen.findByRole('heading', { name: 'Implementar cambio' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial del paso' }))

    expect(await screen.findByRole('status', { name: 'Historial vacío' })).toHaveTextContent(
      'Aún no hay eventos para este paso.'
    )
  })

  it('supports retry after the event endpoint fails', async () => {
    mocks.get
      .mockImplementationOnce(() => Promise.resolve(apiResponse(snapshot)))
      .mockRejectedValueOnce(new Error('error de red'))
      .mockResolvedValueOnce(apiResponse(page()))
    renderRoadmap()

    await screen.findByRole('heading', { name: 'Implementar cambio' })
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial del paso' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText(recentEvent.summary)).toBeInTheDocument()
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(3))
  })
})
