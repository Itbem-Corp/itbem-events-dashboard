// @vitest-environment node
import type { InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiModule from '@/lib/api'
import type * as StoreModule from '@/store/useStore'

vi.mock('@/lib/end-session', () => ({ endSession: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

function ok(config: InternalAxiosRequestConfig, data: unknown) {
  return Promise.resolve({ status: 200, statusText: 'OK', headers: {}, config, data })
}

describe('issueOrganizationContext', () => {
  let api: typeof ApiModule.api
  let useStore: typeof StoreModule.useStore
  let initialState: ReturnType<typeof StoreModule.useStore.getState>

  beforeEach(async () => {
    vi.resetModules()
    ;({ api } = await import('@/lib/api'))
    ;({ useStore } = await import('@/store/useStore'))
    initialState = useStore.getState()
    useStore.getState().setToken('synthetic-test-token')
  })

  afterEach(() => {
    api.defaults.adapter = undefined
    useStore.setState(initialState, true)
    vi.clearAllMocks()
  })

  it('returns the server-bound in-memory credential', async () => {
    const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      ok(config, { status: 200, data: { token: 'signed-context', organization_id: 'org-1', expires_at: '2099-01-01T00:00:00Z' } })
    )
    api.defaults.adapter = adapter as never
    const { issueOrganizationContext } = await import('@/features/workspace/issue-organization-context')

    await expect(issueOrganizationContext('org-1')).resolves.toEqual({
      token: 'signed-context',
      organizationId: 'org-1',
      expiresAt: '2099-01-01T00:00:00Z',
    })
    expect(adapter).toHaveBeenCalledOnce()
    expect(adapter.mock.calls[0][0].url).toBe('/session/organization-context')
    expect(JSON.parse(adapter.mock.calls[0][0].data)).toEqual({ organization_id: 'org-1' })
  })

  it('rejects a credential issued for another organization', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      ok(config, { data: { token: 'signed-context', organization_id: 'org-2', expires_at: '2099-01-01T00:00:00Z' } })) as never
    const { issueOrganizationContext } = await import('@/features/workspace/issue-organization-context')

    await expect(issueOrganizationContext('org-1')).rejects.toThrow('incomplete')
  })

  it('deduplicates concurrent exchanges for the same organization', async () => {
    const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      ok(config, { status: 200, data: { token: 'signed', organization_id: 'org-1', expires_at: '2099-01-01T00:00:00Z' } })
    )
    api.defaults.adapter = adapter as never
    const { issueOrganizationContext } = await import('@/features/workspace/issue-organization-context')

    const first = issueOrganizationContext('org-1')
    const second = issueOrganizationContext('org-1')
    expect(first).toBe(second)
    await Promise.all([first, second])
    expect(adapter).toHaveBeenCalledOnce()
  })
})
