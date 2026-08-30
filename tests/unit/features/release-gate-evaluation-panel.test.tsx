import { ReleaseGateEvaluationPanel } from '@/features/automation/release-gate-evaluation-panel'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('ReleaseGateEvaluationPanel', () => {
  it('keeps missing evidence fail-closed and refreshable', () => {
    const refresh = vi.fn()
    render(<ReleaseGateEvaluationPanel workItemId="work-1" onRefresh={refresh} />)

    expect(screen.getByText('Sin evaluación registrada')).toBeInTheDocument()
    expect(screen.getByText(/no existe evidencia determinista para autorizar/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar evaluaciones del Gatekeeper' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('describes an allowed evaluation as evidence instead of execution authority', () => {
    render(
      <ReleaseGateEvaluationPanel
        workItemId="work-1"
        onRefresh={() => undefined}
        snapshot={{
          schema_version: 1,
          work_item_id: 'work-1',
          truncated: false,
          evaluations: [{
            event_id: 'event-1', sequence: 1, action: 'release', change_set_id: 'change-1', state: 'allowed', reasons: [],
            matrix_digest: 'a'.repeat(64), policy_digest: 'b'.repeat(64), vault_digest: 'c'.repeat(64), requirements_digest: 'd'.repeat(64), subject_digest: 'e'.repeat(64), occurred_at: '2026-08-30T12:00:00Z',
          }],
        }}
      />,
    )

    expect(screen.getByText('Evidencia completa')).toBeInTheDocument()
    expect(screen.getByText('Política')).toBeInTheDocument()
    expect(screen.getByText('Vault')).toBeInTheDocument()
    expect(screen.getByText('Requisitos de branch')).toBeInTheDocument()
    expect(screen.getByText(/nunca ejecuta ni sustituye la aprobación humana/i)).toBeInTheDocument()
    expect(screen.queryByText(/mergeado|desplegado/i)).not.toBeInTheDocument()
  })

  it('keeps an unavailable read model blocked', () => {
    render(<ReleaseGateEvaluationPanel workItemId="work-1" unavailable onRefresh={() => undefined} />)

    expect(screen.getByText('No se pudo verificar el Gatekeeper')).toBeInTheDocument()
    expect(screen.getByText(/autoridad de merge y release permanece bloqueada/i)).toBeInTheDocument()
  })
})
