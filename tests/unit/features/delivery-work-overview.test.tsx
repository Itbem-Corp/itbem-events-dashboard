import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DeliveryEvidencePreview,
  DeliveryWorkUsage,
  deliveryWorkExecutionCountLabel,
  deliveryWorkProviderLabel,
} from '@/features/automation/delivery-work-overview'

const zeroTotals = {
  executions: 0,
  input_tokens: 0,
  output_tokens: 0,
  cached_input_tokens: 0,
  cache_write_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: 0,
  input_cost_microusd: 0,
  output_cost_microusd: 0,
  cached_cost_microusd: 0,
  cache_write_cost_microusd: 0,
  total_cost_microusd: 0,
}

describe('delivery work overview', () => {
  it('uses readable provider names and correct Spanish execution plurals', () => {
    expect(deliveryWorkProviderLabel('minimax')).toBe('MiniMax')
    expect(deliveryWorkProviderLabel('openrouter')).toBe('OpenRouter')
    expect(deliveryWorkExecutionCountLabel(1)).toBe('1 ejecución')
    expect(deliveryWorkExecutionCountLabel(2)).toBe('2 ejecuciones')
  })

  it('shows confirmed totals and keeps chat separate from phase usage', () => {
    const conversation = { ...zeroTotals, executions: 1, input_tokens: 300, output_tokens: 80, total_tokens: 380, total_cost_microusd: 20 }
    const onOpenUsage = vi.fn()
    render(<DeliveryWorkUsage summary={{
      ...zeroTotals,
      executions: 2,
      input_tokens: 1250,
      output_tokens: 320,
      cached_input_tokens: 90,
      reasoning_tokens: 40,
      total_tokens: 1570,
      total_cost_microusd: 123,
      conversation,
      steps: [{ ...zeroTotals, step_key: 'delivery.plan', execution_kind: 'agent', executions: 1, input_tokens: 950, output_tokens: 240, total_tokens: 1190, total_cost_microusd: 103 }],
    }} onOpenUsage={onOpenUsage} />)

    const usage = screen.getByRole('region', { name: 'Consumo de IA de esta tarea' })
    expect(usage).toHaveTextContent('$0.000123')
    expect(usage).toHaveTextContent('Planeación')
    expect(usage).toHaveTextContent('Conversación')
    expect(usage).toHaveTextContent('Agrupado por fase operativa')
    fireEvent.click(screen.getByRole('button', { name: 'Ver límites y llamadas' }))
    expect(onOpenUsage).toHaveBeenCalledOnce()
  })

  it('does not show a confirmed zero when no call exists', () => {
    render(<DeliveryWorkUsage summary={{ ...zeroTotals, conversation: zeroTotals, steps: [] }} />)

    expect(screen.getByText(/no se muestra un costo como si fuera un consumo confirmado/)).toBeInTheDocument()
    expect(screen.queryByText('$0.000000')).not.toBeInTheDocument()
  })

  it('marks plan evidence as a proposal instead of execution proof', () => {
    const onOpen = vi.fn()
    render(<DeliveryEvidencePreview evidence={[{
      id: 'plan-proof',
      kind: 'report',
      phase: 'plan',
      title: 'Resultado del agente: plan',
      reference: 'private://result',
      captured_at: '2026-09-23T16:22:00Z',
      metadata: {},
    }]} onOpen={onOpen} />)

    const preview = screen.getByRole('region', { name: 'Evidencia de esta tarea' })
    expect(preview).toHaveTextContent('Plan propuesto · no es prueba de ejecución')
    expect(preview).toHaveTextContent('Propuesta de plan')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir evidencia' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
