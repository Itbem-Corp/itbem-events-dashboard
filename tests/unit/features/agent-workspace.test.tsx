import { AgentWorkspace } from '@/features/automation/agent-workspace'
import { agentWorkspaceState } from '@/features/automation/agent-workspace-state'
import type { DeliveryWorkItem } from '@/features/automation/delivery-types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const item: DeliveryWorkItem = {
  id: 'w1',
  project_id: 'p1',
  title: 'RSVP',
  description: 'Normalize',
  expected_outcome: 'Stable RSVP',
  state: 'implementation',
  agent_progress: 'blocked',
  automation_epoch: 2,
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
}
const callbacks = { onInspect: vi.fn(), onReview: vi.fn(), onStop: vi.fn() }
describe('agent workspace', () => {
  it('keeps gates, closed work, uncertainty and cancellation out of conversation retries', () => {
    for (const state of ['plan_review', 'code_review', 'qa_review', 'preview_pending', 'released', 'cancelled'])
      expect(agentWorkspaceState({ ...item, state }).canContinue).toBe(false)
    for (const status of ['queued', 'running', 'cancel_requested'] as const)
      expect(
        agentWorkspaceState({
          ...item,
          automation_tasks: [{ id: 't1', operation: 'delivery.implementation', status, created_at: item.created_at }],
        }).canContinue
      ).toBe(false)
    expect(
      agentWorkspaceState({
        ...item,
        automation_tasks: [
          {
            id: 't1',
            operation: 'delivery.implementation',
            status: 'failed',
            created_at: item.created_at,
            error_message: 'Provider outcome uncertain',
          },
        ],
      }).canContinue
    ).toBe(false)
  })
  it('uses only reported steps, not simulated completion percentages', () => {
    const state = agentWorkspaceState({
      ...item,
      automation_tasks: [
        {
          id: 't1',
          operation: 'delivery.implementation',
          status: 'running',
          progress_step: 'validating',
          created_at: item.created_at,
        },
      ],
    })
    expect(state.title).toContain('ejecutando pruebas')
  })
  it('retains text and the same idempotency key after an uncertain response', async () => {
    const onSend = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
    render(<AgentWorkspace {...callbacks} item={item} streamStatus="live" onSend={onSend} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Mensaje para el agente' }), {
      target: { value: 'Preserva el orden y no edites los tests.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y continuar' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('textbox')).toHaveValue('Preserva el orden y no edites los tests.')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar y continuar' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''))
    expect(onSend).toHaveBeenCalledTimes(2)
    expect(onSend.mock.calls[0]).toEqual(onSend.mock.calls[1])
    expect(onSend.mock.calls[0][1]).toBe(true)
  })
  it('saving context never implicitly starts another attempt', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<AgentWorkspace {...callbacks} item={item} streamStatus="offline" onSend={onSend} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Referencia de QA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar al agente' }))
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend.mock.calls[0][1]).toBe(false)
    expect(screen.getByText(/El agente clasifica tu mensaje/)).toBeInTheDocument()
    expect(screen.getByText(/La conversación no aprueba cambios ni publicación/)).toBeInTheDocument()
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument()
  })
  it('uses a failure signal for an offline channel instead of presenting it as waiting', () => {
    render(<AgentWorkspace {...callbacks} item={item} streamStatus="offline" onSend={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByTestId('agent-connection-indicator')).toHaveClass('bg-rose-500')
  })
  it('keeps every connection state visually honest, including closed history', () => {
    const states = [
      ['live', 'Canal en vivo', 'bg-emerald-500'],
      ['connecting', 'Conectando', 'bg-amber-500'],
      ['reconnecting', 'Reconectando', 'bg-amber-500'],
      ['idle', 'Actualización pausada', 'bg-zinc-400'],
      ['offline', 'Sin conexión activa', 'bg-rose-500'],
      ['error', 'Actualización interrumpida', 'bg-rose-500'],
    ] as const
    for (const [streamStatus, label, tone] of states) {
      const view = render(
        <AgentWorkspace
          {...callbacks}
          item={item}
          streamStatus={streamStatus}
          onSend={vi.fn().mockResolvedValue(undefined)}
        />
      )
      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByTestId('agent-connection-indicator')).toHaveClass(tone)
      view.unmount()
    }

    const closed = render(
      <AgentWorkspace
        {...callbacks}
        item={{ ...item, state: 'released' }}
        streamStatus="error"
        onSend={vi.fn().mockResolvedValue(undefined)}
      />
    )
    expect(screen.getByText('Historial')).toBeInTheDocument()
    expect(screen.getByTestId('agent-connection-indicator')).toHaveClass('bg-zinc-400')
    closed.unmount()
  })
  it('makes the agent interpretation visible without turning a question into an action', () => {
    render(
      <AgentWorkspace
        {...callbacks}
        item={{
          ...item,
          messages: [
            {
              id: 'm1', phase: 'implementation', author_type: 'human', body: '¿Cómo va?', intent: 'question',
              effect: 'informational', receipt: { next: 'No cambia el plan ni inicia un intento.' }, created_at: item.created_at,
            },
          ],
        }}
        streamStatus="live"
        onSend={vi.fn().mockResolvedValue(undefined)}
      />
    )
    expect(screen.getByText('Pregunta · no ejecuta')).toBeInTheDocument()
    expect(screen.getByText('No cambia el plan ni inicia un intento.')).toBeInTheDocument()
  })
  it('does not repeat a blocking reason already used as the state detail', () => {
    const blocked = 'El agente necesita una aclaración: ¿conservamos la primera confirmación cuando el correo se repite?'
    render(
      <AgentWorkspace
        {...callbacks}
        item={{ ...item, blocked_reason: blocked }}
        streamStatus="live"
        onSend={vi.fn().mockResolvedValue(undefined)}
      />
    )
    expect(screen.getAllByText(blocked)).toHaveLength(1)
  })
  it('renders an informational agent answer with bounded next steps and open questions', () => {
    render(
      <AgentWorkspace
        {...callbacks}
        item={{
          ...item,
          messages: [{
            id: 'm2', phase: 'chat', author_type: 'agent', body: 'El plan sigue esperando revisión.',
            intent: 'agent_answer', effect: 'informational',
            receipt: { status: 'answered', next_steps: ['Revisar el diff'], questions: ['¿Qué alcance confirmamos?'] },
            created_at: item.created_at,
          }],
        }}
        streamStatus="live"
        onSend={vi.fn().mockResolvedValue(undefined)}
      />
    )
    expect(screen.getByText('Respuesta informativa')).toBeInTheDocument()
    expect(screen.getByText('Revisar el diff')).toBeInTheDocument()
    expect(screen.getByText('¿Qué alcance confirmamos?')).toBeInTheDocument()
  })
  it('lets the operator attach only frozen context or evidence references', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(
      <AgentWorkspace
        {...callbacks}
        item={{
          ...item,
          context_snapshots: [{ id: 'c1', kind: 'repository', name: 'Dashboard', reference: 'workspace://dashboard', revision: 'abc123', captured_at: item.created_at }],
          evidence: [{ id: 'e1', kind: 'test_result', phase: 'qa', title: 'QA result', reference: 'evidence://qa', captured_at: item.created_at }],
        }}
        streamStatus="live"
        onSend={onSend}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Revisa estas pruebas.' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar al agente' }))
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(onSend.mock.calls[0][3]).toEqual([{ kind: 'context', id: 'c1', name: 'Dashboard', reference: 'workspace://dashboard', revision: 'abc123' }])
  })
})
