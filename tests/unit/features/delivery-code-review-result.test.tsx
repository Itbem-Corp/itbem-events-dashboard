import { DeliveryResultPanel } from '@/features/automation/delivery-result-panel'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: { get: mocks.apiGet },
}))

describe('DeliveryResultPanel code review result', () => {
  it('renders a structured PR decision without exposing the frozen patch', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      data: {
        status: 200,
        message: 'Automation result',
        data: {
          structured_result: {
            summary: 'La mutación necesita conservar la autorización.',
            verdict: 'request_changes',
            review_scope: ['handler', 'authorization'],
            findings: [{
              id: 'missing-owner-check', severity: 'high', category: 'security', title: 'Falta la validación de propietario',
              file: 'controllers/orders.go', side: 'head', line_start: 42, line_end: 45,
              evidence: 'La mutación se ejecuta sin comprobar al solicitante.', evidence_quote: 'update order',
              recommendation: 'Verifica la propiedad antes de actualizar.', confidence: 0.96,
            }],
            test_plan: ['Comprueba que un usuario ajeno recibe rechazo.'],
            coverage_gaps: ['No existe una regresión de autorización.'],
          },
        },
      },
    })

    render(<DeliveryResultPanel taskId="11111111-1111-1111-1111-111111111111" onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Cambios requeridos')).toBeInTheDocument())
    expect(screen.getByText('Falta la validación de propietario')).toBeInTheDocument()
    expect(screen.getByText('controllers/orders.go:42–45 · línea añadida')).toBeInTheDocument()
    expect(screen.getByText('Verifica la propiedad antes de actualizar.')).toBeInTheDocument()
    expect(screen.getByText(/Comprueba que un usuario ajeno recibe rechazo/)).toBeInTheDocument()
    expect(screen.getByText(/No existe una regresión de autorización/)).toBeInTheDocument()
    expect(screen.queryByText('update order')).not.toBeInTheDocument()
  })
})
