import { render, screen } from '@testing-library/react'
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
  it('does not present narrated QA success as an executed check', () => {
    mocked.result = { data: { structured_result: { summary: 'Looks good', verdict: 'passed', checks: [{ name: 'Login', status: 'passed', detail: 'Agent conclusion' }], coverage_gaps: ['No browser execution'] } } }
    render(<DeliveryReviewBrief item={{ ...item, state: 'qa_review', automation_tasks: [{ id: 'qa', operation: 'delivery.qa', status: 'completed', created_at: '2026-01-03' }] }} onInspect={vi.fn()} />)
    expect(screen.getByText('Reporta éxito · Login: Agent conclusion')).toBeInTheDocument()
    expect(screen.getByText('No browser execution')).toBeInTheDocument()
    expect(screen.getByText('No hay comandos de QA ejecutados registrados en este resultado.')).toBeInTheDocument()
    expect(screen.queryByText('Pasó · Login')).not.toBeInTheDocument()
  })
})
