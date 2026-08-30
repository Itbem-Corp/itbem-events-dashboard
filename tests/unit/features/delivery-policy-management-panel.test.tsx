import { ProjectPolicyManagementPanel } from '@/features/automation/delivery-policy-management-panel'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  mutate: vi.fn(),
  data: [] as unknown,
}))

vi.mock('@/lib/api', () => ({ api: { post: mocks.post } }))
vi.mock('swr', () => ({ default: () => ({ data: mocks.data, isLoading: false, isValidating: false, error: null, mutate: mocks.mutate }) }))

function pendingRevision() {
  return {
    id: 'revision-1', schema_version: 1, level: 'repository', project_id: 'project-1', repository: 'github://Example/service',
    patch: { mode: 'merge', allowed_target_branches: ['main'] }, reason: 'Reviewed defaults', content_sha256: 'a'.repeat(64),
    created_at: '2026-08-30T16:00:00Z', status: 'pending',
  }
}

describe('ProjectPolicyManagementPanel', () => {
  beforeEach(() => {
    mocks.post.mockReset().mockResolvedValue({})
    mocks.mutate.mockReset().mockResolvedValue([])
    mocks.data = [pendingRevision()]
  })

  it('requires explicit digest confirmation before an approval request', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<ProjectPolicyManagementPanel projectId="project-1" repository="github://Example/service" onEffectiveRefresh={refresh} />)

    const approve = screen.getByRole('button', { name: 'Aprobar digest' })
    expect(approve).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /confirmo que revisé alcance/i }))
    expect(approve).toBeEnabled()
    fireEvent.click(approve)

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/automation/projects/project-1/delivery-policy/revisions/revision-1/decisions',
      { action: 'approved', expected_digest: 'a'.repeat(64) }
    ))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it('never offers reactivation for a revoked revision', () => {
    mocks.data = [{
      ...pendingRevision(), status: 'revoked',
      latest_decision: { id: 'decision-2', action: 'revoked', reason: 'Unsafe configuration', occurred_at: '2026-08-30T17:00:00Z' },
    }]
    render(<ProjectPolicyManagementPanel projectId="project-1" repository="github://Example/service" onEffectiveRefresh={() => Promise.resolve()} />)

    expect(screen.getByText(/no reactivable/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument()
  })

  it('fails closed when the ledger projection is null or malformed', () => {
    mocks.data = null
    render(<ProjectPolicyManagementPanel projectId="project-1" repository="github://Example/service" onEffectiveRefresh={() => Promise.resolve()} />)

    expect(screen.getByText('Ledger no verificable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear propuesta' })).toBeDisabled()
  })
})
