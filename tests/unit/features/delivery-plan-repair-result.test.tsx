import { DeliveryResultPanel } from '@/features/automation/delivery-result-panel'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: { get: mocks.apiGet },
}))

describe('DeliveryResultPanel harness repairs', () => {
  it('explains bounded shape repairs without presenting them as agent authority', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      data: {
        status: 200,
        message: 'Automation result',
        data: {
          structured_result: {
            summary: 'Plan local revisable.',
            estimate: '10 minutos',
            confidence: 0.8,
            goal_interpretation: 'Validar el worker local.',
            autonomy_boundary: 'Sólo planificación; requiere gate humano.',
            context_reviewed: ['workspace://repo'],
            assumptions: [],
            implementation_steps: ['Observar el worker.'],
            files_impacted: [],
            risks: ['Revisar la salud del worker.'],
            qa_plan: ['Comprobar heartbeat.'],
            evidence_plan: ['Guardar run_id.'],
            acceptance_criteria: ['No modificar código.'],
            repository_impact: [{
              name: 'Backend', reference: 'workspace://repo', revision: 'deadbeef', role: 'primary', impact: 'consulted', notes: 'Sólo contexto.',
            }],
            questions: [],
            _harness_repairs: ['risks missing: inserted an explicit human-review warning'],
          },
        },
      },
    })

    render(<DeliveryResultPanel taskId="11111111-1111-1111-1111-111111111111" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Normalizaciones del harness')).toBeInTheDocument())
    expect(screen.getByText(/El runtime ajustó sólo la forma/)).toBeInTheDocument()
    expect(screen.getByText(/risks missing: inserted an explicit human-review warning/)).toBeInTheDocument()
    expect(screen.getByText(/no amplió el alcance/)).toBeInTheDocument()
  })
})
