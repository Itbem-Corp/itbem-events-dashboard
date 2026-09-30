import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeliveryWorkSummary, deliverySignalLabel } from '@/features/automation/delivery-work-summary'
import type { DeliveryWorkItem } from '@/features/automation/delivery-types'

const baseItem: DeliveryWorkItem = {
  id: 'work-1', project_id: 'project-1', title: 'Work', description: '', expected_outcome: 'Result',
  state: 'implementation', created_at: '2026-09-21T11:00:00Z', updated_at: '2026-09-21T11:05:00Z',
}

describe('delivery work summary signal freshness', () => {
  it('formats durable signal age without confusing channel state with progress', () => {
    const now = Date.parse('2026-09-21T12:00:00Z')
    expect(deliverySignalLabel('2026-09-21T11:59:40Z', now)).toBe('hace menos de 1 min')
    expect(deliverySignalLabel('2026-09-21T11:42:00Z', now)).toBe('hace 18 min')
    expect(deliverySignalLabel(undefined, now)).toBe('Sin señal verificable')
  })

  it('shows the last durable signal and keeps stale state explicit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T12:00:00Z'))
    try {
      render(<DeliveryWorkSummary
        item={{
          ...baseItem,
          workflow_projection: {
            schema_version: 2, stage: 'build', state_kind: 'active', summary: 'Construyendo', detail: 'Trabajo activo', state: 'implementation',
            actor: { type: 'agent', model: 'MiniMax-M3' }, last_activity_at: '2026-09-21T11:42:00Z', stale_after_seconds: 60, stale: true,
            evidence: { total: 0, validations: 0, has_result: false, has_changes: true, has_human_gate: false }, available_actions: [], can_continue: false,
          },
        }}
        connection="live"
        onOpen={vi.fn()}
      />)
      expect(screen.getByText('Señal obsoleta · revisar actividad')).toBeInTheDocument()
      expect(screen.getByText(/^hace \d+ min$/)).toBeInTheDocument()
      expect(screen.getByText('Construyendo')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the repository and file for a detected branch conflict', () => {
    render(<DeliveryWorkSummary
      item={{
        ...baseItem,
        state: 'blocked',
        agent_progress: 'blocked',
        blocked_reason: 'Conflicto de cambios en repo-a (src/app.ts) con otra rama del mismo DAG; reconcilia las ramas antes de continuar.',
      }}
      connection="live"
      onOpen={vi.fn()}
    />)
    expect(screen.getAllByText('Conflicto entre ramas')).toHaveLength(2)
    expect(screen.getByText('repo-a')).toBeInTheDocument()
    expect(screen.getByText('src/app.ts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisar ramas y actividad' })).toBeInTheDocument()
  })

  it('sends a human review gate to its decision surface instead of implying missing context', () => {
    const onOpen = vi.fn()
    render(<DeliveryWorkSummary
      item={{
        ...baseItem,
        state: 'plan_review',
        agent_progress: 'waiting_for_user',
        workflow_projection: {
          schema_version: 2, stage: 'plan', state_kind: 'review', summary: 'Plan por revisar', detail: 'Revisa el alcance.', state: 'plan_review',
          waiting_category: 'human_review', actor: { type: 'human' }, last_activity_at: '2026-09-21T11:42:00Z', stale_after_seconds: 3600, stale: false,
          evidence: { total: 1, validations: 1, has_result: true, has_changes: false, has_human_gate: false },
          recovery: { mode: 'human_review', title: 'Revisa y decide el gate actual', detail: 'Puedes aprobarla o solicitar cambios.', action_id: 'open_control', requires_human_review: true },
          available_actions: [], can_continue: true,
        },
      }}
      connection="live"
      onOpen={onOpen}
    />)
    expect(screen.getByText('Revisa y decide el gate actual')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisar y decidir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir conversación' })).not.toBeInTheDocument()
  })

  it('does not report an intentional human gate as a stale worker signal', () => {
    render(<DeliveryWorkSummary
      item={{
        ...baseItem,
        state: 'plan_review',
        workflow_projection: {
          schema_version: 2, stage: 'plan', state_kind: 'review', summary: 'Plan por revisar', detail: 'Revisión humana pendiente.', state: 'plan_review',
          actor: { type: 'human' }, last_activity_at: '2026-09-21T11:42:00Z', stale_after_seconds: 60, stale: true,
          evidence: { total: 1, validations: 1, has_result: true, has_changes: false, has_human_gate: true },
          recovery: { mode: 'human_review', title: 'Revisa y decide el gate actual', detail: 'Puedes aprobarla o solicitar cambios.', action_id: 'open_control', requires_human_review: true },
          available_actions: [], can_continue: true,
        },
      }}
      connection="live"
      onOpen={vi.fn()}
    />)
    expect(screen.getByText('En espera de tu decisión')).toBeInTheDocument()
    expect(screen.queryByText('Señal obsoleta · revisar actividad')).not.toBeInTheDocument()
  })

  it('opens the conversation for operator input and never exposes the raw recovery code', () => {
    const onOpen = vi.fn()
    const onOpenConversation = vi.fn()
    render(<DeliveryWorkSummary
      item={{
        ...baseItem,
        state: 'planning',
        workflow_projection: {
          schema_version: 2, stage: 'plan', state_kind: 'blocked', summary: 'Necesita contexto', detail: 'Falta un dato.', state: 'planning',
          actor: { type: 'human' }, last_activity_at: '2026-09-21T11:42:00Z', stale_after_seconds: 3600, stale: false,
          evidence: { total: 0, validations: 0, has_result: false, has_changes: false, has_human_gate: false },
          recovery: { mode: 'operator_input', title: 'Envía el contexto que falta', detail: 'El agente espera tu respuesta.', action_id: 'open_control', requires_human_review: false },
          available_actions: [], can_continue: true,
        },
      }}
      connection="offline"
      onOpen={onOpen}
      onOpenConversation={onOpenConversation}
    />)
    expect(screen.getByText('Necesita tu contexto')).toBeInTheDocument()
    expect(screen.queryByText('operator_input')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir conversación' }))
    expect(onOpenConversation).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })
})
