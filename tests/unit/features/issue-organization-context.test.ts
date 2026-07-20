import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api: { post } }))

describe('issueOrganizationContext', () => {
  beforeEach(() => post.mockReset())

  it('returns the server-bound in-memory credential', async () => {
    post.mockResolvedValue({
      data: {
        status: 200,
        data: {
          token: 'signed-context',
          organization_id: 'org-1',
          expires_at: '2099-01-01T00:00:00Z',
        },
      },
    })
    const { issueOrganizationContext } = await import('@/features/workspace/issue-organization-context')

    await expect(issueOrganizationContext('org-1')).resolves.toEqual({
      token: 'signed-context',
      organizationId: 'org-1',
      expiresAt: '2099-01-01T00:00:00Z',
    })
    expect(post).toHaveBeenCalledWith('/session/organization-context', { organization_id: 'org-1' })
  })

  it('rejects a credential issued for another organization', async () => {
    post.mockResolvedValue({
      data: { data: { token: 'signed-context', organization_id: 'org-2', expires_at: '2099-01-01T00:00:00Z' } },
    })
    const { issueOrganizationContext } = await import('@/features/workspace/issue-organization-context')

    await expect(issueOrganizationContext('org-1')).rejects.toThrow('incomplete')
  })

  it('deduplicates concurrent exchanges for the same organization', async () => {
    post.mockResolvedValue({
      data: { status: 200, data: { token: 'signed', organization_id: 'org-1', expires_at: '2099-01-01T00:00:00Z' } },
    })
    const { issueOrganizationContext } = await import('@/features/workspace/issue-organization-context')

    const first = issueOrganizationContext('org-1')
    const second = issueOrganizationContext('org-1')
    expect(first).toBe(second)
    await Promise.all([first, second])
    expect(post).toHaveBeenCalledOnce()
  })
})
