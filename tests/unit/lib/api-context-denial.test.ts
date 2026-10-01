// @vitest-environment node
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiModule from '@/lib/api'
import type * as StoreModule from '@/store/useStore'

const { endSession, errorToast, infoToast } = vi.hoisted(() => ({ endSession: vi.fn(), errorToast: vi.fn(), infoToast: vi.fn() }))
vi.mock('@/lib/end-session', () => ({ endSession }))
vi.mock('sonner', () => ({ toast: { error: errorToast, info: infoToast } }))

describe('application context denial recovery', () => {
  let api: typeof ApiModule.api
  let applicationContextDenialKind: typeof ApiModule.applicationContextDenialKind
  let useStore: typeof StoreModule.useStore
  let initialState: ReturnType<typeof StoreModule.useStore.getState>
  const testTime = 2_000_000_000_000
  beforeEach(async () => {
    // Fresh API/store modules reset cooldowns and interceptor state per test.
    vi.resetModules()
    ;({ api, applicationContextDenialKind } = await import('@/lib/api'))
    ;({ useStore } = await import('@/store/useStore'))
    initialState = useStore.getState()
    vi.spyOn(Date, 'now').mockImplementation(() => testTime)
  })
  afterEach(() => { vi.restoreAllMocks(); useStore.setState(initialState, true); vi.clearAllMocks() })
  it.each(['organization context token is required', 'organization context token is invalid or expired'])('classifies the generic envelope by its recoverable detail: %s', detail => {
    expect(applicationContextDenialKind({ Message: 'Application context denied', Error: detail })).toBe('organization_credential')
  })
  it.each(['application header does not match the authenticated tenant', 'application session does not match the authenticated tenant', 'application context does not match the authenticated tenant'])('keeps genuine cross-product denials distinct: %s', detail => {
    expect(applicationContextDenialKind({ message: 'Application context denied', error: detail })).toBe('product_mismatch')
  })
  it('recovers only known workspace failures and keeps unknown boundary denials terminal', () => {
    for (const detail of [
      'workspace mode must be organization or platform',
      'platform workspace cannot include an organization',
      'platform workspace is not enabled for this session',
      'organization header must be a valid UUID',
      'organization is not enabled for this application session',
      'organization context token requires an organization workspace',
    ]) {
      expect(applicationContextDenialKind({ message: 'Application context denied', error: detail })).toBe('workspace')
    }
    expect(applicationContextDenialKind({ message: 'Application access denied' })).toBeNull()
    expect(applicationContextDenialKind({ message: 'Application context denied', error: 'unknown' })).toBe('product_mismatch')
    expect(applicationContextDenialKind({ error: 'organization context token is required' })).toBe('organization_credential')
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
  it('throttles each recovery category independently while clearing every expired credential', async () => {
    let now = testTime
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const previous = useStore.getState().token
    useStore.getState().setToken('synthetic-test-token')
    const state = useStore.getState()
    const clearSession = vi.spyOn(state, 'clearSession').mockImplementation(() => {})
    const clearCredential = vi.spyOn(state, 'setOrganizationContextCredential').mockImplementation(() => {})
    let detail = 'organization context token is invalid or expired'
    const adapter = vi.fn(async config => {
      throw new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, undefined, { status: 403, statusText: 'Forbidden', headers: {}, config, data: { message: 'Application context denied', error: detail } })
    })
    try {
      await expect(api.get('/synthetic-context-check', { adapter })).rejects.toThrow('forbidden')
      expect(infoToast).toHaveBeenCalledTimes(1)
      detail = 'platform workspace cannot include an organization'
      await expect(api.get('/synthetic-context-check', { adapter })).rejects.toThrow('forbidden')
      expect(infoToast).toHaveBeenCalledTimes(1)
      expect(errorToast).toHaveBeenCalledTimes(1)
      detail = 'organization context token is invalid or expired'
      await expect(api.get('/synthetic-context-check', { adapter })).rejects.toThrow('forbidden')
      expect(clearCredential).toHaveBeenCalledTimes(2)
      expect(clearCredential).toHaveBeenNthCalledWith(1, null)
      expect(clearCredential).toHaveBeenNthCalledWith(2, null)
      expect(infoToast).toHaveBeenCalledTimes(1)
      detail = 'platform workspace cannot include an organization'
      now += 7_999
      await expect(api.get('/synthetic-context-check', { adapter })).rejects.toThrow('forbidden')
      expect(errorToast).toHaveBeenCalledTimes(1)
      now += 1
      await expect(api.get('/synthetic-context-check', { adapter })).rejects.toThrow('forbidden')
      expect(errorToast).toHaveBeenCalledTimes(2)
      expect(errorToast).toHaveBeenLastCalledWith('No se pudo validar el espacio de trabajo. Selecciona nuevamente una organización o la vista de plataforma.')
      expect(infoToast).toHaveBeenCalledTimes(1)
      expect(adapter).toHaveBeenCalledTimes(5)
      expect(clearSession).not.toHaveBeenCalled()
      expect(endSession).not.toHaveBeenCalled()
      expect(useStore.getState().token).toBe('synthetic-test-token')
    } finally { useStore.getState().setToken(previous) }
  })
  it.each([
    ['application header does not match the authenticated tenant', true],
    ['application context does not match the authenticated tenant', true],
    ['unknown application boundary detail', true],
    ['platform workspace cannot include an organization', false],
  ])('handles %s without weakening the rejected request', async (detail, mustEndSession) => {
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
  it('renews a missing organization credential even without the generic envelope', async () => {
    const previous = useStore.getState().token
    useStore.getState().setToken('synthetic-test-token')
    const state = useStore.getState()
    const clearSession = vi.spyOn(state, 'clearSession').mockImplementation(() => {})
    const clearCredential = vi.spyOn(state, 'setOrganizationContextCredential').mockImplementation(() => {})
    const adapter = vi.fn(async config => {
      throw new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, undefined, { status: 403, statusText: 'Forbidden', headers: {}, config, data: { error: 'organization context token is required' } })
    })
    try {
      await expect(api.get('/synthetic-context-check', { adapter })).rejects.toThrow('forbidden')
      expect(adapter).toHaveBeenCalledTimes(1)
      expect(clearCredential).toHaveBeenCalledExactlyOnceWith(null)
      expect(infoToast).toHaveBeenCalledExactlyOnceWith('El contexto del espacio se renovará automáticamente.')
      expect(errorToast).not.toHaveBeenCalled()
      expect(clearSession).not.toHaveBeenCalled()
      expect(endSession).not.toHaveBeenCalled()
    } finally { useStore.getState().setToken(previous) }
  })
})
