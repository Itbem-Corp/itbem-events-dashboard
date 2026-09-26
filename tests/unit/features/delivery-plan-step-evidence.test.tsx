import {
  deliveryPlanStepEvidenceContentPath,
  deliveryPlanStepEvidencePath,
  parseDeliveryPlanStepEvidence,
  type DeliveryPlanStepEvidenceItem,
  type DeliveryPlanStepEvidencePage,
} from '@/features/automation/delivery-plan-step-evidence'
import { DeliveryPlanStepEvidencePanel } from '@/features/automation/delivery-plan-step-evidence-panel'
import type { DeliveryPlanStepEvidenceRequirement } from '@/features/automation/delivery-plan-steps'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get: mocks.get } }))

const item: DeliveryPlanStepEvidenceItem = {
  id: 'a6ab5c1d-7b1a-4f62-81e9-4449de675222',
  requirement_key: 'test_report',
  file_name: 'reporte.md',
  content_type: 'text/markdown',
  size_bytes: 2048,
  sha256: 'a'.repeat(64),
  source: 'agent',
  automation_task_id: 'd05ea55c-1724-4192-a1e1-6d841c7d9356',
  run_id: 'fe053ea8-eb4e-4b04-b927-a64884bc5a00',
  agent_key: 'qa-agent',
  agent_instance_id: 'a2f6f1a7-a8ba-4d88-ab6f-0bef3997ba8c',
  fencing_token: 7,
  created_at: '2026-09-24T15:00:00Z',
}

const requirements: DeliveryPlanStepEvidenceRequirement[] = [
  {
    key: 'test_report',
    title: 'Reporte de pruebas',
    description: 'Resultado de pruebas integradas.',
    required: true,
    content_types: ['text/markdown', 'application/json'],
    max_bytes: 1024 * 1024,
  },
  {
    key: 'screenshot',
    title: 'Captura de pantalla',
    required: false,
    content_types: ['image/png'],
    max_bytes: 1024 * 1024,
  },
]

function page(overrides: Partial<DeliveryPlanStepEvidencePage> = {}): DeliveryPlanStepEvidencePage {
  return { plan_id: 'plan-1', plan_version: 4, step_id: 'step-1', items: [item], next_cursor: null, ...overrides }
}

function apiResponse(data: unknown) {
  return { data: { status: 200, message: 'ok', data } }
}

function renderPanel() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>
      <DeliveryPlanStepEvidencePanel
        planId="plan-1"
        planVersion={4}
        stepId="step-1"
        stepTitle="Ejecutar pruebas"
        requirements={requirements}
      />
    </SWRConfig>
  )
}

describe('delivery plan step evidence contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(apiResponse(page()))
  })

  it('builds scoped list and authorized content proxy paths without storage coordinates', () => {
    expect(deliveryPlanStepEvidencePath('plan/one', 'step/one')).toBe(
      '/automation/plans/plan%2Fone/steps/step%2Fone/evidence?limit=25'
    )
    expect(
      deliveryPlanStepEvidencePath('plan-1', 'step-1', {
        cursor: 'older cursor',
        requirementKey: 'test_report',
        runId: 'run-1',
      })
    ).toBe(
      '/automation/plans/plan-1/steps/step-1/evidence?limit=25&cursor=older+cursor&requirement_key=test_report&run_id=run-1'
    )
    expect(deliveryPlanStepEvidenceContentPath('plan-1', 'step/one', 'evidence/one')).toBe(
      '/automation/plans/plan-1/steps/step%2Fone/evidence/evidence%2Fone/content'
    )
  })

  it('parses safe evidence metadata and binds it to the expected plan version and step', () => {
    expect(parseDeliveryPlanStepEvidence(page(), { planId: 'plan-1', planVersion: 4, stepId: 'step-1' })).toEqual(
      page()
    )
    expect(() => parseDeliveryPlanStepEvidence(page(), { planId: 'plan-1', planVersion: 3, stepId: 'step-1' })).toThrow(
      'no corresponde a este plan y paso'
    )
  })

  it('rejects raw storage references and unknown private item fields', () => {
    for (const privateField of ['bucket', 'object_key', 'storage_url', 'presigned_url']) {
      expect(() =>
        parseDeliveryPlanStepEvidence(page({ items: [{ ...item, [privateField]: 'private/value' }] }), {
          planId: 'plan-1',
          planVersion: 4,
          stepId: 'step-1',
        })
      ).toThrow('metadatos privados no permitidos')
    }
  })
})

describe('DeliveryPlanStepEvidencePanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(apiResponse(page()))
  })

  it('shows requirement status, safe execution metadata, and a content-proxy download only', async () => {
    renderPanel()

    expect(await screen.findByText('1 registro')).toBeInTheDocument()
    expect(screen.getByText('Reporte de pruebas')).toBeInTheDocument()
    expect(screen.getByText('Requerida')).toBeInTheDocument()
    const download = await screen.findByRole('button', { name: 'Descargar evidencia reporte.md' })
    expect(screen.queryByRole('button', { name: /agregar evidencia/i })).not.toBeInTheDocument()

    const createObjectURL = vi.fn(() => 'blob:evidence')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mocks.get.mockImplementation((path: string, config?: { responseType?: string }) =>
      Promise.resolve(config?.responseType === 'blob' ? { data: new Blob(['verified evidence']) } : apiResponse(page()))
    )
    fireEvent.click(download)
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith(deliveryPlanStepEvidenceContentPath('plan-1', 'step-1', item.id), {
        responseType: 'blob',
      })
    )
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchorClick).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Contexto seguro de ejecución'))
    expect(screen.getByText(item.automation_task_id)).toBeInTheDocument()
    expect(screen.getByText(item.run_id)).toBeInTheDocument()
    expect(screen.getByText(item.agent_instance_id)).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.queryByText(/bucket|object_key|presigned/i)).not.toBeInTheDocument()
  })

  it('shows a required item as missing only after the complete cursor history is exhausted', async () => {
    mocks.get.mockResolvedValueOnce(apiResponse(page({ items: [], next_cursor: null })))
    renderPanel()

    expect(await screen.findByText('Falta evidencia')).toBeInTheDocument()
    expect(screen.getAllByText('Opcional')).toHaveLength(2)
  })

  it('keeps status inconclusive while older pages remain, then updates it from the next page', async () => {
    mocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        apiResponse(
          path.includes('cursor=')
            ? page({ items: [item], next_cursor: null })
            : page({ items: [], next_cursor: 'older-cursor' })
        )
      )
    )
    renderPanel()

    expect(await screen.findByText('Sin evidencia visible')).toBeInTheDocument()
    expect(screen.queryByText('Falta evidencia')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar evidencia anterior' }))
    expect(await screen.findByRole('button', { name: 'Descargar evidencia reporte.md' })).toBeInTheDocument()
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith(
        '/automation/plans/plan-1/steps/step-1/evidence?limit=25&cursor=older-cursor'
      )
    )
    expect(screen.getByText('1 registro')).toBeInTheDocument()
  })
})
