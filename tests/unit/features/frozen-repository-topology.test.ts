import { describe, expect, it } from 'vitest'
import { frozenRepositoryTopologyIssue } from '@/features/automation/frozen-repository-topology'

const snapshot = (reference: string, role?: string) => ({
  id: reference, kind: 'repository', name: reference, reference, revision: 'abc123', captured_at: '2026-09-23T00:00:00Z',
  metadata: role ? { repository_role: role } : {},
})

describe('frozen repository topology', () => {
  it('accepts one primary with supporting repositories', () => {
    expect(frozenRepositoryTopologyIssue([snapshot('workspace://api', 'primary'), snapshot('workspace://web', 'supporting')])).toBeNull()
  })

  it('explains an immutable task with two primary repositories', () => {
    expect(frozenRepositoryTopologyIssue([snapshot('github://org/api', 'primary'), snapshot('github://org/web', 'primary')])).toContain('2 repositorios principales')
  })

  it('does not invent an issue before snapshots load or for a single repository', () => {
    expect(frozenRepositoryTopologyIssue(undefined)).toBeNull()
    expect(frozenRepositoryTopologyIssue([snapshot('workspace://api')])).toBeNull()
  })
})
