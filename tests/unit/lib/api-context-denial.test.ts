// @vitest-environment node
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, applicationContextDenialKind } from '@/lib/api'
import { useStore } from '@/store/useStore'

const { endSession, errorToast, infoToast } = vi.hoisted(() => ({ endSession: vi.fn(), errorToast: vi.fn(), infoToast: vi.fn() }))
vi.mock('@/lib/end-session', () => ({ endSession }))
vi.mock('sonner', () => ({ toast: { error: errorToast, info: infoToast } }))

describe('application context denial recovery', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })
  it.each(['organization context token is required', 'organization context token is invalid or expired'])('classifies the generic envelope by its recoverable detail: %s', detail => {
    expect(applicationContextDenialKind({ Message: 'Application context denied', Error: detail })).toBe('organization_credential')
  })
  it.each(['application header does not match the authenticated tenant', 'application session does not match the authenticated tenant'])('keeps genuine cross-product denials distinct: %s', detail => {
    expect(applicationContextDenialKind({ message: 'Application context denied', error: detail })).toBe('product_mismatch')
  })
  it('does not interpret workspace authorization or an unknown detail as a different product', () => {
    for (const detail of ['platform workspace cannot include an organization', 'organization is not enabled for this application session', 'unknown']) {
      expect(applicationContextDenialKind({ message: 'Application context denied', error: detail })).toBe('workspace')
    }
    expect(applicationContextDenialKind({ message: 'Application access denied' })).toBeNull()
  })
  it('preserves authentication, clears only the organization credential and does not retry rejected writes', async () => {
    const previous = useStore.getState().token
    useStore.getState().setToken('synthetic-test-token')
    const state = useStore.getState()
    const clearSession = vi.spyOn(state, 'clearSession')
    const clearCredential = vi.spyOn(state, 'setOrganizationContextCredential')
    const adapter = vi.fn(async config => {
      throw new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, undefined, { status: 403, statusText: 'Forbidden', headers: {}, config, data: { message: 'Application context denied', error: 'organization context token is invalid or expired' } })
    })
    try {
      await expect(api.post('/synthetic-context-check', {}, { adapter })).rejects.toThrow('forbidden')
      expect(adapter).toHaveBeenCalledTimes(1)
      expect(clearCredential).toHaveBeenCalledWith(null)
      expect(clearSession).not.toHaveBeenCalled()
      expect(endSession).not.toHaveBeenCalled()
      expect(useStore.getState().token).toBe('synthetic-test-token')
      expect(infoToast).toHaveBeenCalledTimes(1)
      expect(errorToast).not.toHaveBeenCalled()
    } finally { useStore.getState().setToken(previous) }
  })
  it.each([
    ['application header does not match the authenticated tenant', true],
    ['platform workspace cannot include an organization', false],
  ])('handles %s without weakening the rejected request', async (detail, mustEndSession) => {
    vi.spyOn(Date, 'now').mockReturnValue(mustEndSession ? 2_000_000_010_000 : 2_000_000_020_000)
    const previous = useStore.getState().token
    useStore.getState().setToken('synthetic-test-token')
    const clearSession = vi.spyOn(useStore.getState(), 'clearSession').mockImplementation(() => {})
    const adapter = vi.fn(async config => {
      throw new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, undefined, { status: 403, statusText: 'Forbidden', headers: {}, config, data: { message: 'Application context denied', error: detail } })
    })
    try {
      await expect(api.get('/synthetic-context-check', { adapter })).rejects.toThrow('forbidden')
      expect(adapter).toHaveBeenCalledTimes(1)
      expect(clearSession).toHaveBeenCalledTimes(mustEndSession ? 1 : 0)
      expect(endSession).toHaveBeenCalledTimes(mustEndSession ? 1 : 0)
      expect(errorToast).toHaveBeenCalledTimes(1)
    } finally { useStore.getState().setToken(previous) }
  })
})
