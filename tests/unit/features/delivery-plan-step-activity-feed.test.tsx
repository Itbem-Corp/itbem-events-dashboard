import type {
  DeliveryPlanStepActivityItem,
  DeliveryPlanStepActivityPage,
  DeliveryPlanStepInferenceAccounting,
} from '@/features/automation/delivery-plan-step-activity'
import {
  DELIVERY_PLAN_STEP_ACTIVITY_REFRESH_INTERVAL_MS,
  DeliveryPlanStepActivityFeed,
} from '@/features/automation/delivery-plan-step-activity-feed'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get: mocks.get } }))

const recentActivity: DeliveryPlanStepActivityItem = {
  id: 'activity-1',
  sequence: 21,
  action: 'tool_completed',
  phase: 'completed',
  tool_name: 'read_file',
  automation_task_id: 'task-1',
  run_id: 'run-1',
  worker_id: 'worker-1',
  agent_key: 'backend-agent',
  machine_id: 'machine-mx-1',
  agent_instance_id: 'f9e53a6f-9cda-4e84-88d4-bbac93addd11',
  details: null,
  inference: null,
  duration_ms: 1_250,
  summary: 'La lectura del archivo terminó correctamente.',
  occurred_at: '2026-09-23T10:11:00Z',
}

function apiResponse(data: unknown) {
  return { data: { status: 200, message: 'ok', data } }
}

function page(overrides: Partial<DeliveryPlanStepActivityPage> = {}): DeliveryPlanStepActivityPage {
  return {
    plan_id: 'plan-1',
    plan_version: 3,
    step_id: 'step/one',
    items: [recentActivity],
    next_cursor: null,
    ...overrides,
  }
}

const canonicalInference = {
  receipt_id: 'cbe4dfd4-57e5-48aa-8e5d-229d77d50be4',
  provider: 'deepseek',
  model: 'deepseek-chat',
  status: 'accepted',
  input_tokens: 120,
  output_tokens: 32,
  cached_input_tokens: 18,
  cache_write_tokens: 4,
  reasoning_tokens: 7,
  total_tokens: 152,
  total_cost_microusd: 243,
  currency: 'USD',
  pricing_basis: 'official_api_price',
} as const satisfies DeliveryPlanStepInferenceAccounting & { receipt_id: string }

const testSWRConfig = { provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }

function feedElement(planVersion = 3) {
  return (
    <SWRConfig value={testSWRConfig}>
      <DeliveryPlanStepActivityFeed planId="plan-1" planVersion={planVersion} stepId="step/one" stepTitle="Implementar cambio" />
    </SWRConfig>
  )
}

function renderFeed(planVersion = 3) {
  return render(
    feedElement(planVersion)
  )
}

describe('DeliveryPlanStepActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        apiResponse(
          path.includes('cursor=')
            ? page({
                items: [
                  { ...recentActivity, id: 'activity-older', sequence: 20, summary: 'El agente revisó el cambio.' },
                  recentActivity,
                ],
              })
            : page({ next_cursor: 'older-cursor' })
        )
      )
    )
  })

  afterEach(() => vi.useRealTimers())

  it('loads only when opened and displays safe activity labels and identifiers', async () => {
    renderFeed()

    expect(mocks.get).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByText(recentActivity.summary)).toBeInTheDocument()
    expect(screen.getByText('Herramienta completada')).toBeInTheDocument()
    expect(screen.getByText('Completada')).toBeInTheDocument()
    expect(screen.getByText('read_file')).toBeInTheDocument()
    expect(screen.getByText('backend-agent')).toBeInTheDocument()
    expect(screen.getByText('Identidad de instancia:')).toBeInTheDocument()
    expect(screen.getByText('f9e53a6f-9cda-4e84-88d4-bbac93addd11')).toBeInTheDocument()
    expect(screen.getByText('Equipo:')).toBeInTheDocument()
    expect(screen.getByText('1.3 s')).toBeInTheDocument()
    expect(screen.getByText('#21')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('/automation/plans/plan-1/steps/step%2Fone/activity?limit=25')
  })

  it('opens and focuses the linked step while marking matching run events without filtering the feed', async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
        <DeliveryPlanStepActivityFeed
          planId="plan-1"
          planVersion={3}
          stepId="step/one"
          stepTitle="Implementar cambio"
          openWhenFocused
          originRunId="run-1"
        />
      </SWRConfig>
    )

    expect(screen.getByRole('button', { name: 'Ocultar actividad' })).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText(recentActivity.summary)).toBeInTheDocument()
    expect(screen.getByText(/Ejecución de origen:/)).toBeInTheDocument()
    expect(screen.getByText('Ejecución enlazada')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('/automation/plans/plan-1/steps/step%2Fone/activity?limit=25')
    expect(mocks.get.mock.calls[0][0]).not.toContain('run=')
  })

  it('shows an empty state and supports retry after a failed first load', async () => {
    mocks.get
      .mockRejectedValueOnce(new Error('conexión temporal'))
      .mockResolvedValueOnce(apiResponse(page({ items: [] })))
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('conexión temporal')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('status', { name: 'Diario de actividad vacío' })).toHaveTextContent(
      'Aún no hay actividad registrada para este paso.'
    )
  })

  it('loads cursor pages on demand and deduplicates records by id', async () => {
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))
    expect(await screen.findByText(recentActivity.summary)).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cargar actividad anterior' }))

    expect(await screen.findByText('El agente revisó el cambio.')).toBeInTheDocument()
    expect(screen.getAllByText(recentActivity.summary)).toHaveLength(1)
    expect(mocks.get).toHaveBeenCalledWith(
      '/automation/plans/plan-1/steps/step%2Fone/activity?limit=25&cursor=older-cursor'
    )
    expect(screen.getByText('2 registros')).toBeInTheDocument()
  })

  it('shows canonical inference accounting but never the opaque receipt ID or private provider details', async () => {
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            {
              ...recentActivity,
              action: 'inference',
              phase: 'completed',
              summary: 'Inferencia completada',
              inference: canonicalInference,
            },
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByRole('region', { name: 'Contabilidad de inferencia' })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek')).toBeInTheDocument()
    expect(screen.getByText('deepseek-chat')).toBeInTheDocument()
    expect(screen.getByText('Aceptada')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('152')).toBeInTheDocument()
    expect(screen.getByText('$0.000243 USD')).toBeInTheDocument()
    expect(screen.getByText('Precio oficial de API')).toBeInTheDocument()
    expect(screen.queryByText(canonicalInference.receipt_id)).not.toBeInTheDocument()
    expect(screen.queryByText(/private prompt canary|private completion canary|private reasoning canary/i)).not.toBeInTheDocument()
  })

  it('shows unavailable accounting rather than fabricating zero for a missing or unpriced receipt', async () => {
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            { ...recentActivity, action: 'inference', phase: 'completed', inference: null },
            {
              ...recentActivity,
              id: 'inference-unpriced',
              sequence: 22,
              action: 'inference',
              phase: 'failed',
              inference: { ...canonicalInference, pricing_basis: 'unpriced', total_cost_microusd: 0 },
            },
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByText(/Contabilidad canónica de inferencia:/)).toHaveTextContent('No disponible')
    expect(screen.getAllByText('No disponible').length).toBeGreaterThan(0)
    expect(screen.queryByText('$0.000000 USD')).not.toBeInTheDocument()
    expect(screen.getByText('Sin precio disponible')).toBeInTheDocument()
  })

  it('uses a separate SWR cache when the approved plan version changes', async () => {
    const updatedActivity = {
      ...recentActivity,
      id: 'activity-version-4',
      sequence: 22,
      summary: 'La versión nueva del plan ya tiene actividad.',
    }
    mocks.get
      .mockResolvedValueOnce(apiResponse(page()))
      .mockResolvedValueOnce(apiResponse(page({ plan_version: 4, items: [updatedActivity] })))

    const view = renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))
    expect(await screen.findByText(recentActivity.summary)).toBeInTheDocument()

    view.rerender(feedElement(4))

    expect(await screen.findByText(updatedActivity.summary)).toBeInTheDocument()
    expect(screen.queryByText(recentActivity.summary)).not.toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('rejects unexpected fields instead of rendering private or non-allowlisted content', async () => {
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            {
              ...recentActivity,
              prompt: 'private-reasoning-canary',
              command: 'secret-command-canary',
            } as unknown as DeliveryPlanStepActivityItem,
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('campos no permitidos')
    expect(screen.queryByText('private-reasoning-canary')).not.toBeInTheDocument()
    expect(screen.queryByText('secret-command-canary')).not.toBeInTheDocument()
  })

  it('shows only abbreviated acceptance and review hashes for completed evidence', async () => {
    const criterionHash = 'a'.repeat(64)
    const reviewHash = 'b'.repeat(64)
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            {
              ...recentActivity,
              action: 'evidence',
              phase: 'completed',
              details: {
                acceptance_checks: [
                  { criterion_sha256: criterionHash, passed: true },
                  { criterion_sha256: 'c'.repeat(64), passed: false },
                ],
                review_diff_sha256: reviewHash,
              },
            },
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByText('sha256:aaaaaaaaaaaa…')).toBeInTheDocument()
    expect(screen.getByText('Check de aceptación 1:')).toBeInTheDocument()
    expect(screen.getByText('Check de aceptación 2:')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.getByText('Fallido')).toBeInTheDocument()
    expect(screen.getByText('Diff revisado:')).toBeInTheDocument()
    expect(screen.getByText('sha256:bbbbbbbbbbbb…')).toBeInTheDocument()
    expect(screen.queryByText(criterionHash)).not.toBeInTheDocument()
    expect(screen.queryByText(reviewHash)).not.toBeInTheDocument()
  })

  it('shows safe verified patch metadata without storage locations or patch contents', async () => {
    const patchHash = 'e'.repeat(64)
    const baseSHA = 'a'.repeat(40)
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            {
              ...recentActivity,
              action: 'evidence',
              phase: 'completed',
              details: {
                patch_artifacts: [
                  {
                    repository_ref: 'workspace://frontend',
                    base_sha: baseSHA,
                    sha256: patchHash,
                    size_bytes: 1_572_864,
                  },
                ],
              },
            },
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByText('Parche verificado 1')).toBeInTheDocument()
    expect(screen.getByText('Repositorio:')).toBeInTheDocument()
    expect(screen.getByText('workspace://frontend')).toBeInTheDocument()
    expect(screen.getByText('Base:')).toBeInTheDocument()
    expect(screen.getByText(baseSHA)).toBeInTheDocument()
    expect(screen.getByText('sha256:eeeeeeeeeeee…')).toBeInTheDocument()
    expect(screen.getByText('1.5 MiB')).toBeInTheDocument()
    expect(screen.queryByText(patchHash)).not.toBeInTheDocument()
    expect(screen.queryByText(/bucket|object.key|https?:\/\//i)).not.toBeInTheDocument()
  })

  it('shows command result metadata in a keyboard-accessible collapsed disclosure', async () => {
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            {
              ...recentActivity,
              action: 'validation',
              details: {
                executable_name: 'go',
                argument_count: 3,
                exit_code: 0,
                captured_output_bytes: 147,
                resource_references: ['workspace://repo-main'],
              },
            },
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))

    expect(await screen.findByText('Ver metadatos seguros', { selector: 'summary' })).toBeInTheDocument()
    const disclosure = screen.getByText('Ver metadatos seguros', { selector: 'summary' })
    const details = disclosure.closest('details')
    expect(disclosure.tagName).toBe('SUMMARY')
    expect(details).not.toHaveAttribute('open')

    fireEvent.click(disclosure)

    expect(details).toHaveAttribute('open')
    expect(screen.getByText('go')).toBeInTheDocument()
    expect(screen.getByText('Cantidad de argumentos:')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Código de salida:')).toBeInTheDocument()
    expect(screen.getByText('Bytes de salida capturados:')).toBeInTheDocument()
    expect(screen.getByText('147')).toBeInTheDocument()
    expect(screen.getByText('workspace://repo-main')).toBeInTheDocument()
    expect(screen.queryByText(/stdout|stderr|private argument|private prompt|reasoning/i)).not.toBeInTheDocument()
  })

  it('shows only contract-safe changed paths and workspace references when expanded', async () => {
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            {
              ...recentActivity,
              action: 'file_change',
              tool_name: null,
              details: {
                changed_files: ['src/orders.ts', 'tests/orders.test.ts'],
                resource_references: ['workspace://repo-main'],
              },
            },
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))
    fireEvent.click(await screen.findByText('Ver metadatos seguros', { selector: 'summary' }))

    expect(screen.getByText('Archivos modificados:')).toBeInTheDocument()
    expect(screen.getByText('src/orders.ts')).toBeInTheDocument()
    expect(screen.getByText('tests/orders.test.ts')).toBeInTheDocument()
    expect(screen.getByText('Referencias de recursos:')).toBeInTheDocument()
    expect(screen.getByText('workspace://repo-main')).toBeInTheDocument()
    expect(screen.queryByText(/\.env|\.pem|private_key|token|https?:\/\//i)).not.toBeInTheDocument()
  })

  it('abbreviates the safe dependency manifest digest inside the disclosure', async () => {
    const manifestSHA256 = 'c'.repeat(64)
    mocks.get.mockResolvedValueOnce(
      apiResponse(
        page({
          items: [
            {
              ...recentActivity,
              action: 'evidence',
              details: {
                applied_dependency_manifest_sha256: manifestSHA256,
                applied_dependency_patch_count: 2,
              },
            },
          ],
        })
      )
    )
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))
    fireEvent.click(await screen.findByText('Ver metadatos seguros', { selector: 'summary' }))

    expect(screen.getByText('Manifiesto de dependencias aplicado:')).toBeInTheDocument()
    expect(screen.getByText('sha256:cccccccccccc…')).toBeInTheDocument()
    expect(screen.getByText('Parches de dependencias aplicados:')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText(manifestSHA256)).not.toBeInTheDocument()
  })

  it('refreshes only the first page on the sensible interval while retaining loaded cursor pages', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    expect(DELIVERY_PLAN_STEP_ACTIVITY_REFRESH_INTERVAL_MS).toBe(30_000)
    const pageReads: string[] = []
    mocks.get.mockImplementation((path: string) => {
      pageReads.push(path)
      return Promise.resolve(
        apiResponse(
          path.includes('cursor=')
            ? page({
                items: [{ ...recentActivity, id: 'activity-older', sequence: 20, summary: 'Registro anterior.' }],
                next_cursor: null,
              })
            : page({ next_cursor: 'older-cursor' })
        )
      )
    })
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Ver diario de actividad' }))
    expect(await screen.findByText(recentActivity.summary)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar actividad anterior' }))
    expect(await screen.findByText('Registro anterior.')).toBeInTheDocument()
    await waitFor(() => expect(pageReads.filter((path) => path.includes('cursor=')).length).toBe(1))
    const readsBeforeRefresh = pageReads.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELIVERY_PLAN_STEP_ACTIVITY_REFRESH_INTERVAL_MS)
    })

    await waitFor(() => expect(pageReads.length).toBeGreaterThan(readsBeforeRefresh))
    expect(pageReads.slice(readsBeforeRefresh).every((path) => !path.includes('cursor='))).toBe(true)
    expect(screen.getByText('Registro anterior.')).toBeInTheDocument()
  })
})
