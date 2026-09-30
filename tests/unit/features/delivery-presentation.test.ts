import { describe, expect, it } from 'vitest'
import { deliveryPresentation, deliveryStageIndex } from '@/features/automation/delivery-presentation'

describe('shared delivery presentation', () => {
  it('does not move code review back to the planning stage just because it needs attention', () => {
    expect(deliveryStageIndex('code_review')).toBe(2)
    expect(deliveryStageIndex('plan_review')).toBe(1)
    expect(deliveryStageIndex('released')).toBe(3)
    expect(deliveryStageIndex()).toBe(0)
  })
  it('separates code review from CI and explains preview authorization', () => {
    const state = deliveryPresentation({ state: 'code_review' })
    expect(state.title).toBe('Cambio por revisar')
    expect(state.detail).toContain('preview controlado')
    expect(state.destination).toBe('control')
  })
  it('does not present recovered failures as current blockers', () => {
    expect(deliveryPresentation({ state: 'code_review', automation_tasks: [
      { id: 'old', operation: 'delivery.implementation', status: 'failed', created_at: '2026-01-01', error_message: 'uncertain' },
      { id: 'new', operation: 'delivery.implementation', status: 'completed', created_at: '2026-01-02' },
    ] }).title).toBe('Cambio por revisar')
  })
  it('never suggests retrying uncertain outcomes', () => {
    const state = deliveryPresentation({ state: 'implementation', automation_tasks: [
      { id: 'x', operation: 'delivery.implementation', status: 'failed', created_at: '2026-01-01', error_message: 'outcome uncertain' },
    ] })
    expect(state.action).toBe('Inspeccionar resultado')
  })
  it('prioritizes durable blocking over a review stage', () => {
    expect(deliveryPresentation({ state: 'release_review', agent_progress: 'blocked', blocked_reason: 'Presupuesto insuficiente' }).detail).toBe('Presupuesto insuficiente')
  })
  it('names an overlapping branch conflict instead of presenting it as a generic failure', () => {
    const state = deliveryPresentation({
      state: 'blocked',
      agent_progress: 'blocked',
      blocked_reason: 'Conflicto de cambios en repo-a (src/app.ts) con otra rama del mismo DAG; reconcilia las ramas antes de continuar.',
      automation_tasks: [],
    })
    expect(state.title).toBe('Conflicto entre ramas')
    expect(state.action).toBe('Revisar ramas')
  })
  it.each(['released', 'cancelled'])('keeps terminal %s out of pending work', state => {
    expect(deliveryPresentation({ state, agent_progress: 'queued' }).tone).not.toBe('active')
  })
  it('prefers the server projection when one is present', () => {
    const state = deliveryPresentation({
      state: 'implementation',
      workflow_projection: {
        schema_version: 1,
        stage: 'build',
        state_kind: 'uncertain',
        summary: 'Resultado por confirmar',
        detail: 'Inspecciona la evidencia antes de repetir.',
        state: 'implementation',
        actor: { type: 'system' },
        last_activity_at: '2026-09-20T12:00:00Z',
        stale_after_seconds: 900,
        stale: false,
        evidence: { total: 0, validations: 0, has_result: false, has_changes: false, has_human_gate: false },
        available_actions: [{ id: 'open_activity', kind: 'navigation', label: 'Ver actividad' }],
        can_continue: false,
      },
    })
    expect(state.title).toBe('Resultado por confirmar')
    expect(state.detail).toContain('Inspecciona')
    expect(state.tone).toBe('attention')
  })
  it('never presents a mutating transition label as if the summary card executed it', () => {
    const state = deliveryPresentation({
      state: 'plan_review',
      workflow_projection: {
        schema_version: 1,
        stage: 'plan',
        state_kind: 'review',
        summary: 'Plan por revisar',
        detail: 'La decisión humana mantiene el control.',
        state: 'plan_review',
        actor: { type: 'human' },
        last_activity_at: '2026-09-20T12:00:00Z',
        stale_after_seconds: 900,
        stale: false,
        evidence: { total: 0, validations: 0, has_result: false, has_changes: false, has_human_gate: true },
        available_actions: [{ id: 'approve_plan', kind: 'transition', label: 'Aprobar plan' }],
        can_continue: false,
      },
    })
    expect(state.action).toBe('Abrir controles')
    expect(state.destination).toBe('control')
  })

  it.each([
    ['planning', 'Preparando el plan', 'control', 'neutral'],
    ['plan_review', 'Plan por revisar', 'control', 'attention'],
    ['implementation', 'Construyendo el cambio', 'control', 'neutral'],
    ['code_review', 'Cambio por revisar', 'control', 'attention'],
    ['preview_pending', 'Esperando preview', 'control', 'attention'],
    ['qa_running', 'Verificando el resultado', 'control', 'neutral'],
    ['qa_review', 'Validación por revisar', 'control', 'attention'],
    ['release_review', 'Entrega por autorizar', 'control', 'attention'],
    ['released', 'Entregado', 'evidence', 'complete'],
    ['cancelled', 'Cancelado', 'activity', 'neutral'],
    ['blocked', 'Necesita atención', 'activity', 'attention'],
  ])('maps lifecycle state %s to an actionable presentation', (state, title, destination, tone) => {
    const presentation = deliveryPresentation({ state })
    expect(presentation).toMatchObject({ title, destination, tone })
    expect(presentation.action).toBeTruthy()
    expect(presentation.detail).toBeTruthy()
  })
})
