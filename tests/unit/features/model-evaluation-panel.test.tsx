import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EVALUATION_CORPUS_VERSION, evaluationEvidence, evaluationFinalAnswer, ModelEvaluationPanel, parseEvaluation } from '@/features/automation/model-evaluation-panel'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get, post } }))
const id = 'f8e8321b-18e5-451f-8d40-0e7765e944b3'
function fixture(status = 'active') {
  return { batch: { id, status, corpus_version: EVALUATION_CORPUS_VERSION, budget_microusd: 1_000_000, reservation_microusd: 400_000 }, calls: Array.from({ length: 60 }, (_, i) => ({ task_id: `task-${i}`, case_id: `case-${i}`, candidate: 'minimax-m3', status: 'pending', receipt_status: '', actual_provider: '', actual_model: '', total_cost_microusd: 0, result_available: false })) }
}
describe('isolated evaluation controls', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); get.mockResolvedValue({ data: { status: 200, data: fixture() } }); post.mockResolvedValue({ data: {} }) })
  it('admits only the published corpus and preserves the ID after an unknown outcome', async () => {
    post.mockRejectedValue(new Error('unknown response'))
    render(<ModelEvaluationPanel />)
    fireEvent.change(screen.getByLabelText('ID de evaluación'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: 'Admitir evaluación' }))
    await screen.findByRole('alert')
    expect(post).toHaveBeenCalledExactlyOnceWith('/automation/model-evaluations', { id, corpus_version: EVALUATION_CORPUS_VERSION })
    expect(localStorage.getItem('itbem.synthetic-evaluation.id')).toBe(id)
    expect(get).not.toHaveBeenCalled()
  })
  it('stops after a rejected dispatch without automatically retrying', async () => {
    render(<ModelEvaluationPanel />)
    fireEvent.change(screen.getByLabelText('ID de evaluación'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar evaluación' }))
    await screen.findByRole('status')
    post.mockRejectedValue(new Error('ambiguous'))
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar evaluación' }))
    await screen.findByRole('alert')
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(`/automation/model-evaluations/${id}/dispatch-next`, {})
  })
  it('rejects partial or over-budget provenance', () => {
    expect(() => parseEvaluation({ status: 200, data: { ...fixture(), calls: [] } })).toThrow()
    const value = fixture(); value.batch.budget_microusd = 1_000_001
    expect(() => parseEvaluation({ status: 200, data: value })).toThrow()
  })
  it('exports final content and approved provenance while excluding private reasoning', () => {
    expect(evaluationFinalAnswer({ status: 200, data: { content: '{"ok":true}', reasoning: 'private', usage: { arbitrary: 'private' } } })).toBe('{"ok":true}')
    expect(evaluationEvidence({ ...fixture().calls[0], reasoning: 'private', arbitrary_extension: 'private', reasoning_tokens: 20 })).toEqual(expect.objectContaining({ reasoning_tokens: 20 }))
    expect(evaluationEvidence({ ...fixture().calls[0], reasoning: 'private' })).not.toHaveProperty('reasoning')
  })
})
