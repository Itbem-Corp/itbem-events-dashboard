import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeliveryReviewBrief } from '@/features/automation/delivery-review-brief'
import type { DeliveryWorkItem } from '@/features/automation/delivery-types'

const mocked = vi.hoisted(() => ({ result: {} as Record<string, unknown>, key: null as unknown }))
vi.mock('swr', () => ({ default: (key: unknown) => { mocked.key = key; return mocked.result } }))
const item: DeliveryWorkItem = { id: 'w', project_id: 'p', title: 'Change', description: '', expected_outcome: '', state: 'code_review', created_at: '2026-01-01', updated_at: '2026-01-02', automation_tasks: [{ id: 'task', operation: 'delivery.implementation', status: 'completed', created_at: '2026-01-02' }] }
describe('review brief', () => {
  beforeEach(() => { mocked.result = {}; mocked.key = null })
  it('renders legacy single-repository validations alongside the result', () => {
    mocked.result = { data: { artifacts: { implementation: { workspace: 'workspace://api', worktree: 'workspace://api#branch', branch: 'branch', summary: 'Changed the comment', validations: [{ command: ['go', 'test'], passed: true }], diff_stat: '1 file changed' } } } }
    render(<DeliveryReviewBrief item={item} onInspect={vi.fn()} />)
    expect(screen.getByText('Pasó · go test')).toBeInTheDocument()
    expect(screen.getByText(/no sustituye la evidencia/)).toBeInTheDocument()
  })
  it('does not silently show an earlier success when the newest attempt failed', () => {
    render(<DeliveryReviewBrief item={{ ...item, automation_tasks: [...item.automation_tasks!, { id: 'new', operation: 'delivery.implementation', status: 'failed', created_at: '2026-01-03' }] }} onInspect={vi.fn()} />)
    expect(mocked.key).toBeNull()
    expect(screen.getByText(/No hay un resumen verificable/)).toBeInTheDocument()
  })
  it('makes unreadable private evidence explicit', () => {
    mocked.result = { error: new Error('denied') }
    render(<DeliveryReviewBrief item={item} onInspect={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No asumas que está verificado')
  })
  it('shows authoritative task usage in review and opens the detailed usage panel', () => {
    const onOpenUsage = vi.fn()
    const totals = { executions: 2, input_tokens: 1250, output_tokens: 320, cached_input_tokens: 90, cache_write_tokens: 0, reasoning_tokens: 40, total_tokens: 1570, input_cost_microusd: 80, output_cost_microusd: 43, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 123 }
    render(<DeliveryReviewBrief item={{ ...item, cost_summary: { ...totals, conversation: totals, steps: [] } }} onInspect={vi.fn()} onOpenUsage={onOpenUsage} />)

    const usage = screen.getByRole('region', { name: 'Consumo de IA de esta tarea' })
    expect(usage).toHaveTextContent('$0.000123')
    expect(usage).toHaveTextContent('1,250 tokens')
    expect(usage).toHaveTextContent('320 tokens')
    fireEvent.click(screen.getByRole('button', { name: 'Ver límites y llamadas' }))
    expect(onOpenUsage).toHaveBeenCalledOnce()
  })

  it('does not present missing ledger usage as a confirmed zero-cost run', () => {
    const emptyTotals = { executions: 0, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 0, input_cost_microusd: 0, output_cost_microusd: 0, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 0 }
    render(<DeliveryReviewBrief item={{ ...item, cost_summary: { ...emptyTotals, conversation: emptyTotals, steps: [] } }} onInspect={vi.fn()} />)

    expect(screen.getByText(/Aún no hay ejecuciones registradas/)).toBeInTheDocument()
    expect(screen.queryByText('$0.000000')).not.toBeInTheDocument()
  })
  it('does not present narrated QA success as an executed check', () => {
    mocked.result = { data: { structured_result: { summary: 'Looks good', verdict: 'passed', checks: [{ name: 'Login', status: 'passed', detail: 'Agent conclusion' }], coverage_gaps: ['No browser execution'] } } }
    render(<DeliveryReviewBrief item={{ ...item, state: 'qa_review', automation_tasks: [{ id: 'qa', operation: 'delivery.qa', status: 'completed', created_at: '2026-01-03' }] }} onInspect={vi.fn()} />)
    expect(screen.getByText('Reporta éxito · Login: Agent conclusion')).toBeInTheDocument()
    expect(screen.getByText('No browser execution')).toBeInTheDocument()
    expect(screen.getByText('No hay comandos de QA ejecutados registrados en este resultado.')).toBeInTheDocument()
    expect(screen.queryByText('Pasó · Login')).not.toBeInTheDocument()
  })

  it('presents a structured plan beside its decision instead of reducing it to raw summary text', () => {
    mocked.result = { data: { structured_result: {
      summary: 'Proponer un contrato pequeño para el backend y su pantalla dependiente.',
      estimate: '2 días',
      confidence: 0.7,
      goal_interpretation: 'Crear una integración verificable entre los repositorios.',
      autonomy_boundary: 'No editar código hasta recibir aprobación humana.',
      context_reviewed: ['Backend local', 'Frontend local'],
      assumptions: ['El contrato inicial será de lectura.'],
      implementation_steps: ['Definir el contrato HTTP.', 'Crear la pantalla que consuma la API.'],
      files_impacted: ['api/agents'],
      risks: ['El contrato puede cambiar después de la primera revisión.'],
      qa_plan: ['Validar el contrato en backend y frontend.'],
      evidence_plan: ['Conservar salida de pruebas de contrato.'],
      acceptance_criteria: ['La pantalla muestra carga, éxito y error.'],
      questions: ['¿Se requiere autenticación?'],
      repository_impact: [{
        name: 'Backend local editable',
        reference: 'workspace://backend',
        revision: 'abc123def4567890',
        role: 'primary',
        impact: 'changes',
        notes: 'Añadir el contrato HTTP y su prueba.',
      }],
      context_gaps: ['No hay decisión sobre autenticación.'],
      human_decisions: ['Confirmar el esquema HTTP.'],
      rollback_plan: ['Descartar la rama sin merge.'],
    } } }
    render(<DeliveryReviewBrief item={{ ...item, state: 'plan_review', automation_tasks: [{ id: 'plan', operation: 'delivery.plan', status: 'completed', created_at: '2026-01-03' }] }} onInspect={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Plan para revisar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Repositorios y alcance' })).toBeInTheDocument()
    expect(screen.getByText('Propuesta del agente · sin aprobar')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de tu decisión')).toBeInTheDocument()
    const quickRead = screen.getByRole('article', { name: 'Lectura rápida del plan' })
    expect(Array.from(quickRead.querySelectorAll('dd')).map((value) => value.textContent)).toEqual(['1', '2', '3'])
    expect(screen.getByRole('link', { name: 'Revisar 3 puntos abiertos' })).toHaveAttribute('href', '#plan-review-open-points')
    expect(screen.getByRole('link', { name: 'Ver referencias' })).toHaveAttribute('href', '#plan-review-repositories')
    expect(screen.getByRole('link', { name: 'Ver la ruta' })).toHaveAttribute('href', '#plan-review-steps')
    const openPoints = screen.getByRole('article', { name: 'Puntos abiertos del plan' })
    expect(openPoints).toBeVisible()
    expect(screen.getByText('No hay decisión sobre autenticación.')).toBeVisible()
    expect(screen.getByText('Confirmar el esquema HTTP.')).toBeVisible()
    expect(screen.getByText('¿Se requiere autenticación?')).toBeVisible()
    expect(screen.getAllByText('Confirmar el esquema HTTP.')).toHaveLength(1)
    expect(screen.getByText('Definir el contrato HTTP.')).toBeInTheDocument()
    expect(screen.getByText('La pantalla muestra carga, éxito y error.')).toBeInTheDocument()
    expect(screen.getByText('workspace://backend')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir actividad y trazabilidad' })).toBeInTheDocument()
  })
})
