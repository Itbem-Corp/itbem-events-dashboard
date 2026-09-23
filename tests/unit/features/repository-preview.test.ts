import { describe, expect, it } from 'vitest'

import { evaluateRepositoryPreviewGate, isTrustedLocalReview, reviewedPreviewMatches } from '@/features/automation/repository-preview'

const reviewedChange = {
  id: 'review',
  work_item_id: 'work',
  repository_ref: 'workspace://web',
  branch: 'itbem-agent/work',
  review_type: 'local_worktree' as const,
  ci_status: 'passed' as const,
  created_by: 'itbem-local-agent',
  created_at: '2026-09-21T12:00:00.000Z',
  metadata: {
    verification_source: 'itbem-local-agent',
    automation_task_id: 'task-1',
    worktree: 'workspace://web#itbem-agent/work',
    review_diff_sha256: 'ABC123',
  },
}

describe('evaluateRepositoryPreviewGate', () => {
  it('requires every changed repository to share one integrated preview', () => {
    expect(
      evaluateRepositoryPreviewGate([
        { published: true, preview: true, previewURL: 'https://preview.example.test/app' },
        { published: true, preview: true, previewURL: 'https://preview.example.test/app' },
      ]),
    ).toMatchObject({ ready: true, state: 'ready', previewURL: 'https://preview.example.test/app' })
  })

  it('does not treat one repository preview as multirepo readiness', () => {
    expect(
      evaluateRepositoryPreviewGate([
        { published: true, preview: true, previewURL: 'https://preview.example.test/app' },
        { published: true, preview: false },
      ]),
    ).toMatchObject({ ready: false, state: 'missing', missingCount: 1 })
  })

  it('blocks different preview URLs instead of choosing one nondeterministically', () => {
    expect(
      evaluateRepositoryPreviewGate([
        { published: true, preview: true, previewURL: 'https://web.example.test' },
        { published: true, preview: true, previewURL: 'https://api.example.test' },
      ]),
    ).toMatchObject({ ready: false, state: 'ambiguous', urls: ['https://web.example.test', 'https://api.example.test'] })
  })

  it('only accepts a preview published from the exact trusted reviewed diff', () => {
    const publication = { ...reviewedChange, id: 'publication', review_type: 'pull_request' as const, created_by: 'github-app', metadata: { branch_published: true, review_diff_sha256: 'abc123' } }
    expect(isTrustedLocalReview(reviewedChange)).toBe(true)
    expect(reviewedPreviewMatches(reviewedChange, publication)).toBe(true)
    expect(reviewedPreviewMatches(reviewedChange, { ...publication, metadata: { review_diff_sha256: 'different' } })).toBe(false)
    expect(reviewedPreviewMatches({ ...reviewedChange, created_by: 'human' }, publication)).toBe(false)
  })

  it('reports a published but stale preview as a missing gate with a repair reason', () => {
    expect(
      evaluateRepositoryPreviewGate([
        { published: true, preview: false, previewMismatch: true },
      ]),
    ).toMatchObject({ ready: false, state: 'missing', missingCount: 1, staleCount: 1 })
  })
})
