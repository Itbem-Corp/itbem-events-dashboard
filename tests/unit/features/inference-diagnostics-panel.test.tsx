import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi, describe, beforeEach, it, expect } from 'vitest'
import { InferenceDiagnosticsPanel } from '@/features/automation/inference-diagnostics-panel'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: mocks }))
const row = { receipt_id: 'receipt-1', call_id: 'call-1', run_id: 'run-1', status: 'ambiguous', diagnostics: { request_hash: 'sealed-hash', request_bytes: 20, message_count: 1, max_completion_tokens: 4096, duration_ms: 120001, gateway_status: 502, failure_code: 'provider_timeout', request_capture: 'available', response_capture: 'not_observed', attempts: [{ index: 0, provider: 'deepseek', model: 'deepseek-flash', reasoning_enabled: true, reasoning_effort: 'high', duration_ms: 120000 }] } }
describe('Inference inspection', () => {
 beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ data: { status: 200, data: [row, { ...row, receipt_id: 'other', run_id: 'other' }] } }); mocks.post.mockResolvedValue({ data: { status: 200, data: { request_available: true, response_available: true, request: { messages: [{ role: 'user', content: 'synthetic input' }] }, response: { final_answer: 'synthetic final' }, reasoning: 'must not render' } } }) })
 it('loads on demand, binds to the event run and audits content separately', async () => {
  render(<InferenceDiagnosticsPanel taskId="task-1" runId="run-1" />)
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Consultar llamadas' }))
  await screen.findByText(/provider_timeout/)
  expect(screen.queryByText('Receipt: other')).not.toBeInTheDocument()
  expect(mocks.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Abrir contenido privado y registrar acceso' }))
  await screen.findByText('synthetic final')
  expect(mocks.post).toHaveBeenCalledWith('/automation/tasks/task-1/inference-receipts/receipt-1/inspect-content')
  expect(screen.queryByText('must not render')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar contenido' }))
  expect(screen.queryByText('synthetic final')).not.toBeInTheDocument()
 })
 it('clears content when refreshing and reports failed authorization', async () => {
  mocks.get.mockRejectedValue(new Error('private raw detail'))
  render(<InferenceDiagnosticsPanel taskId="task-1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Consultar llamadas' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar'))
  expect(screen.queryByText('private raw detail')).not.toBeInTheDocument()
 })
})
