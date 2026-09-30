import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVALUATION_CORPUS_VERSION, evaluationEvidence, evaluationFinalAnswer, ModelEvaluationPanel, parseEvaluation } from '@/features/automation/model-evaluation-panel'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get, post } }))
const id = 'f8e8321b-18e5-451f-8d40-0e7765e944b3'
function fixture(status = 'active') {
  return { batch: { id, status, corpus_version: EVALUATION_CORPUS_VERSION, budget_microusd: 1_000_000, reservation_microusd: 400_000 }, calls: Array.from({ length: 60 }, (_, i) => ({ task_id: `task-${i}`, case_id: `case-${i}`, candidate: 'minimax-m3', status: 'pending', receipt_status: '', actual_provider: '', actual_model: '', total_cost_microusd: 0, result_available: false })) }
}
describe('isolated evaluation controls', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
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
  it.each([50_000_000, -1, NaN, Infinity, 0.5, '400000', undefined])('rejects an invalid reservation: %s', reservation => {
    const value = fixture()
    expect(() => parseEvaluation({ status: 200, data: { ...value, batch: { ...value.batch, reservation_microusd: reservation } } })).toThrow()
  })
  it('rejects a reservation exceeding the actual smaller budget', () => {
    const value = fixture(); value.batch.budget_microusd = 300_000
    expect(() => parseEvaluation({ status: 200, data: value })).toThrow()
  })
  it('paces a successful dispatch and stops if the server reports no progress', async () => {
    render(<ModelEvaluationPanel />)
    fireEvent.change(screen.getByLabelText('ID de evaluación'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar evaluación' }))
    await screen.findByRole('status')
    expect(screen.getAllByRole('row')).toHaveLength(61)
    vi.useFakeTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ejecutar evaluación' })) })
    expect(post).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
    expect(get).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.getByRole('alert')).toBeVisible()
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(post).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(3)
  })
  it('stops after the in-flight polling interval without dispatching another call', async () => {
    const value = fixture(); value.calls[0].status = 'running'
    get.mockResolvedValue({ data: { status: 200, data: value } })
    render(<ModelEvaluationPanel />)
    fireEvent.change(screen.getByLabelText('ID de evaluación'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar evaluación' }))
    await screen.findByRole('status')
    vi.useFakeTimers()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ejecutar evaluación' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Detener después de esta llamada' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(post).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Detener después de esta llamada' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ejecutar evaluación' })).toBeEnabled()
  })
  it('downloads final evidence through a connected anchor and records unavailable results', async () => {
    const value = fixture('completed')
    value.calls[0].result_available = true; value.calls[1].result_available = true
    let evidenceBlob: Blob | undefined
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn((blob: Blob) => { evidenceBlob = blob; return 'blob:fixture' }), revokeObjectURL: revoke })
    let connected = false, filename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { connected = this.isConnected; filename = this.download })
    get.mockImplementation(async (path: string) => {
      if (path.includes('task-0')) return { data: { status: 200, data: { content: '{"ok":true}', reasoning: 'private-marker' } } }
      if (path.includes('task-1')) throw new Error('unavailable')
      return { data: { status: 200, data: value } }
    })
    render(<ModelEvaluationPanel />)
    fireEvent.change(screen.getByLabelText('ID de evaluación'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar evaluación' }))
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Descargar evidencia final' }))
    await waitFor(() => expect(evidenceBlob).toBeDefined())
    expect(connected).toBe(true)
    expect(filename).toBe(`itbem-evaluation-${id}.json`)
    expect(document.querySelector('a[download]')).toBeNull()
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(evidenceBlob!)
    })
    const report = JSON.parse(text)
    expect(report.calls).toHaveLength(60)
    expect(report.calls[0].final_answer).toBe('{"ok":true}')
    expect(report.calls[1].result_error).toBe('final_result_unavailable')
    expect(text).not.toContain('private-marker')
    expect(report.screening_only).toBe(true)
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:fixture'), { timeout: 1500 })
  })
})
