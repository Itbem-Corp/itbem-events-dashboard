import { ApprovedPlanRoadmap } from '@/features/automation/approved-plan-roadmap'
import type { DeliveryPlanStepsSnapshot } from '@/features/automation/delivery-plan-steps'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get: mocks.get, post: mocks.post } }))

const snapshot: DeliveryPlanStepsSnapshot = {
  plan_id: 'plan-1',
  plan_version: 2,
  items: [
    {
      id: 'step-1',
      plan_id: 'plan-1',
      plan_version: 2,
      step_key: 'define-api',
      order: 0,
      title: 'Definir contrato API',
      objective: 'Acordar rutas y respuestas.',
      acceptance_criteria: ['El contrato tiene pruebas.'],
      depends_on: [],
      status: 'completed',
      started_at: '2026-09-23T15:00:00Z',
      completed_at: '2026-09-23T16:00:00Z',
      created_at: '2026-09-23T14:00:00Z',
      updated_at: '2026-09-23T16:00:00Z',
    },
    {
      id: 'step-2',
      plan_id: 'plan-1',
      plan_version: 2,
      step_key: 'build-ui',
      order: 1,
      title: 'Construir interfaz',
      objective: 'Renderizar el resumen de pasos.',
      acceptance_criteria: [],
      depends_on: ['define-api'],
      status: 'ready',
      created_at: '2026-09-23T14:05:00Z',
      updated_at: '2026-09-23T16:00:00Z',
    },
  ],
  total: 2,
}

function apiResponse(data: unknown) {
  return { data: { status: 200, message: 'ok', data } }
}

function renderRoadmap(props: Partial<Parameters<typeof ApprovedPlanRoadmap>[0]> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
      <ApprovedPlanRoadmap
        planId="plan-1"
        version={2}
        steps={['Definir contrato API', 'Construir interfaz']}
        qa={['Probar endpoint']}
        evidence={['Captura de la vista']}
        {...props}
      />
    </SWRConfig>
  )
}

describe('ApprovedPlanRoadmap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(apiResponse(snapshot))
    mocks.post.mockResolvedValue(apiResponse({ created: true }))
  })

  it('shows authoritative per-step status, dependencies, acceptance criteria, and timestamps', async () => {
    renderRoadmap()

    const roadmap = screen.getByRole('region', { name: 'Pasos del plan aprobado' })
    expect(roadmap).toHaveTextContent('plan v2')
    expect(await screen.findByRole('heading', { name: 'Definir contrato API' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Construir interfaz' })).toBeInTheDocument()
    expect(roadmap).toHaveTextContent('Completado')
    expect(roadmap).toHaveTextContent('Listo')
    expect(roadmap).toHaveTextContent('Dependencias: Definir contrato API')
    expect(roadmap).toHaveTextContent('Probar endpoint')
    expect(roadmap).toHaveTextContent('Captura de la vista')
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === 'time' && element.getAttribute('dateTime') === '2026-09-23T15:00:00Z'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === 'time' && element.getAttribute('dateTime') === '2026-09-23T16:00:00Z'
      )
    ).toBeInTheDocument()
    expect(roadmap).not.toHaveTextContent('Sin verificación individual')
    expect(mocks.get).toHaveBeenCalledWith('/automation/plans/plan-1/steps')
  })

  it('shows an accessible loading state while plan steps are being fetched', () => {
    mocks.get.mockReturnValue(new Promise(() => {}))
    renderRoadmap()

    expect(screen.getByRole('status', { name: 'Cargando pasos del plan' })).toHaveTextContent(
      'Cargando estado de los pasos'
    )
  })

  it('shows the legacy state when the API returns no normalized steps without inferring progress', async () => {
    mocks.get.mockResolvedValueOnce(apiResponse({ ...snapshot, items: [], total: 0 }))
    renderRoadmap()

    expect(await screen.findByRole('status', { name: 'Pasos sin estado estructurado' })).toHaveTextContent(
      'Sin pasos normalizados'
    )
    expect(screen.getByRole('status', { name: 'Pasos sin estado estructurado' })).toHaveTextContent(
      'Definir contrato API'
    )
    expect(screen.queryByText('Sin verificación individual')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Normalizar pasos' })).toBeInTheDocument()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('materializes legacy steps only after an explicit click and revalidates only the steps query', async () => {
    mocks.get
      .mockResolvedValueOnce(apiResponse({ ...snapshot, items: [], total: 0 }))
      .mockResolvedValueOnce(apiResponse(snapshot))
    renderRoadmap()

    const materialize = await screen.findByRole('button', { name: 'Normalizar pasos' })
    expect(mocks.post).not.toHaveBeenCalled()
    fireEvent.click(materialize)

    expect(mocks.post).toHaveBeenCalledWith('/automation/plans/plan-1/steps/materialize')
    expect(await screen.findByRole('heading', { name: 'Definir contrato API' })).toBeInTheDocument()
    expect(
      await screen.findByText('Los pasos heredados ya están normalizados y su estado viene del registro del plan.')
    ).toBeInTheDocument()
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
  })

  it('does not offer materialization without inherited steps or when normalized rows already exist', async () => {
    mocks.get.mockResolvedValueOnce(apiResponse({ ...snapshot, items: [], total: 0 }))
    const { unmount } = renderRoadmap({ steps: [] })
    await screen.findByRole('status', { name: 'Pasos sin estado estructurado' })
    expect(screen.queryByRole('button', { name: 'Normalizar pasos' })).not.toBeInTheDocument()
    unmount()

    mocks.get.mockResolvedValueOnce(apiResponse(snapshot))
    renderRoadmap()
    await screen.findByRole('heading', { name: 'Definir contrato API' })
    expect(screen.queryByRole('button', { name: 'Normalizar pasos' })).not.toBeInTheDocument()
  })

  it('explains the project-manager permission boundary when the backend rejects materialization', async () => {
    const forbidden = Object.assign(new Error('forbidden'), { response: { status: 403 } })
    mocks.get.mockResolvedValueOnce(apiResponse({ ...snapshot, items: [], total: 0 }))
    mocks.post.mockRejectedValueOnce(forbidden)
    renderRoadmap()

    fireEvent.click(await screen.findByRole('button', { name: 'Normalizar pasos' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Pide a un project manager')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })

  it('offers retry on read failure and recovers from a subsequent successful GET', async () => {
    mocks.get.mockRejectedValueOnce(new Error('fallo de lectura')).mockResolvedValueOnce(apiResponse(snapshot))
    renderRoadmap()

    const retry = await screen.findByRole('button', { name: 'Reintentar' })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(retry)

    expect(await screen.findByRole('heading', { name: 'Definir contrato API' })).toBeInTheDocument()
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
  })

  it('keeps the existing implementation summary without declaring the plan complete', async () => {
    renderRoadmap({
      implementationTask: {
        id: 'run-1',
        operation: 'delivery.implementation',
        status: 'running',
        progress_step: 'validating',
        progress_call: 2,
        created_at: '2026-09-23T15:00:00Z',
      },
    })

    expect(screen.getByRole('status', { name: 'Estado de la implementación' })).toHaveTextContent('En curso')
    expect(screen.getByRole('status', { name: 'Estado de la implementación' })).toHaveTextContent(
      'Aplicando y validando · 2 llamadas'
    )
    expect(await screen.findByRole('heading', { name: 'Definir contrato API' })).toBeInTheDocument()
  })

  it('loads normalized steps even when legacy plan text does not contain a step list', async () => {
    renderRoadmap({ steps: [], qa: [], evidence: [] })

    expect(await screen.findByRole('heading', { name: 'Definir contrato API' })).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('/automation/plans/plan-1/steps')
  })

  it('loads the evidence checklist only for steps with declared requirements', async () => {
    const stepsWithEvidence: DeliveryPlanStepsSnapshot = {
      ...snapshot,
      items: [
        {
          ...snapshot.items[0],
          evidence_requirements: [
            {
              key: 'test_report',
              title: 'Reporte de pruebas',
              required: true,
              content_types: ['text/plain'],
              max_bytes: 2048,
            },
          ],
        },
        snapshot.items[1],
      ],
    }
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        apiResponse(
          path.includes('/evidence?')
            ? {
                plan_id: 'plan-1',
                plan_version: 2,
                step_id: 'step-1',
                next_cursor: null,
                items: [
                  {
                    id: 'evidence-1',
                    requirement_key: 'test_report',
                    file_name: 'tests.txt',
                    content_type: 'text/plain',
                    size_bytes: 12,
                    sha256: 'a'.repeat(64),
                    source: 'agent',
                    automation_task_id: 'd05ea55c-1724-4192-a1e1-6d841c7d9356',
                    run_id: 'fe053ea8-eb4e-4b04-b927-a64884bc5a00',
                    agent_key: 'qa',
                    agent_instance_id: 'a2f6f1a7-a8ba-4d88-ab6f-0bef3997ba8c',
                    fencing_token: 3,
                    created_at: '2026-09-23T16:00:00Z',
                  },
                ],
              }
            : stepsWithEvidence
        )
      )
    )
    renderRoadmap()

    expect(await screen.findByRole('heading', { name: 'Reporte de pruebas' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Descargar evidencia tests.txt' })).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('/automation/plans/plan-1/steps/step-1/evidence?limit=25')
    expect(mocks.get).not.toHaveBeenCalledWith('/automation/plans/plan-1/steps/step-2/evidence?limit=25')
  })

  it('resolves an exact agent step key, opens its activity feed, and carries run only as highlighted context', async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        apiResponse(
          path.includes('/activity?')
            ? {
                plan_id: 'plan-1',
                plan_version: 2,
                step_id: 'step-2',
                next_cursor: null,
                items: [
                  {
                    id: 'activity-1',
                    sequence: 1,
                    action: 'agent_started',
                    phase: 'started',
                    tool_name: null,
                    automation_task_id: 'task-1',
                    run_id: 'run-1',
                    worker_id: 'worker-1',
                    agent_key: 'frontend-agent',
                    machine_id: null,
                    duration_ms: null,
                    summary: 'El agente inició el paso.',
                    occurred_at: '2026-09-23T17:00:00Z',
                  },
                ],
              }
            : snapshot
        )
      )
    )
    const onFocusResolution = vi.fn()
    renderRoadmap({ focusStepKey: 'build-ui', focusRunId: 'run-1', onFocusResolution })

    expect(await screen.findByRole('heading', { name: 'Construir interfaz' })).toBeInTheDocument()
    const focusedStep = screen.getByRole('heading', { name: 'Construir interfaz' }).closest('li')
    expect(focusedStep).toHaveAttribute('aria-current', 'step')
    expect(await screen.findByRole('button', { name: 'Ocultar actividad' })).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('El agente inició el paso.')).toBeInTheDocument()
    expect(screen.getByText('Ejecución enlazada')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('/automation/plans/plan-1/steps/step-2/activity?limit=25')
    expect(mocks.get.mock.calls.some(([path]) => String(path).includes('run=run-1'))).toBe(false)
    await waitFor(() =>
      expect(onFocusResolution).toHaveBeenCalledWith({
        status: 'matched',
        stepKey: 'build-ui',
        stepId: 'step-2',
        title: 'Construir interfaz',
      })
    )
  })

  it('reports an unknown agent step key and never opens an unrelated step activity feed', async () => {
    const onFocusResolution = vi.fn()
    renderRoadmap({ focusStepKey: 'not-in-this-plan', focusRunId: 'run-unknown', onFocusResolution })

    await screen.findByRole('heading', { name: 'Definir contrato API' })
    await waitFor(() =>
      expect(onFocusResolution).toHaveBeenCalledWith({ status: 'not_found', stepKey: 'not-in-this-plan' })
    )
    expect(screen.queryByRole('button', { name: 'Ocultar actividad' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Ver diario de actividad' })).toHaveLength(2)
  })
})
