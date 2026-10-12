// @vitest-environment node
import { AxiosError, CanceledError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiModule from '@/lib/api'
import type * as StoreModule from '@/store/useStore'

const { endSession, errorToast, infoToast } = vi.hoisted(() => ({
  endSession: vi.fn(),
  errorToast: vi.fn(),
  infoToast: vi.fn(),
}))
vi.mock('@/lib/end-session', () => ({ endSession }))
vi.mock('sonner', () => ({ toast: { error: errorToast, info: infoToast } }))

function forbidden(config: InternalAxiosRequestConfig, data: unknown) {
  return new AxiosError('Request failed with status code 403', 'ERR_BAD_REQUEST', config, undefined, {
    status: 403,
    statusText: 'Forbidden',
    headers: {},
    config,
    data,
  })
}

describe('API interceptor error handling', () => {
  let api: typeof ApiModule.api
  let networkErrorMessage: typeof ApiModule.networkErrorMessage
  let useStore: typeof StoreModule.useStore
  let initialState: ReturnType<typeof StoreModule.useStore.getState>
  let now = 2_000_000_000_000

  beforeEach(async () => {
    vi.resetModules()
    ;({ api, networkErrorMessage } = await import('@/lib/api'))
    ;({ useStore } = await import('@/store/useStore'))
    initialState = useStore.getState()
    useStore.getState().setToken('synthetic-test-token')
    now = 2_000_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    useStore.setState(initialState, true)
    vi.clearAllMocks()
  })

  it('shows one Spanish toast for a burst of generic 403s', async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw forbidden(config, { status: 403, message: 'Access Denied', error: 'permission denied: events:view' })
    })

    await Promise.allSettled([api.get('/a', { adapter }), api.get('/b', { adapter }), api.get('/c', { adapter })])

    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith('No tienes permiso para realizar esta acción.')

    now += 9_000
    await Promise.allSettled([api.get('/d', { adapter })])
    expect(errorToast).toHaveBeenCalledTimes(2)
  })

  it('does not toast a cancelled request', async () => {
    const adapter = vi.fn(async () => {
      throw new CanceledError()
    })

    await expect(api.get('/cancel', { adapter })).rejects.toBeInstanceOf(CanceledError)
    expect(errorToast).not.toHaveBeenCalled()
  })

  it('uses production-safe copy for network failures off local hosts', async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    })

    await expect(api.get('/offline', { adapter })).rejects.toThrow('Network Error')
    expect(errorToast).toHaveBeenCalledWith('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.')
    expect(networkErrorMessage('dashboard.eventiapp.com')).not.toMatch(/local/)
    expect(networkErrorMessage('dashboard.itbem.localhost')).toMatch(/API local/)
  })

  it('ends the session with a Spanish reason when the refresh answers 403 access_revoked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ code: 'access_revoked' }) })))
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: {},
      })
    })

    await expect(api.get('/revoked', { adapter })).rejects.toBeTruthy()
    expect(endSession).toHaveBeenCalledTimes(1)
  })

  it('keeps the session when the refresh 403 comes from the same-origin guard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ code: 'invalid_origin' }) })))
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: {},
      })
    })

    await expect(api.get('/csrf', { adapter })).rejects.toBeTruthy()
    expect(endSession).not.toHaveBeenCalled()
  })

  it('keeps the session when the token request is refused by the same-origin guard', async () => {
    useStore.getState().setToken(null)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ code: 'invalid_origin' }) })))
    const adapter = vi.fn(async (_config: InternalAxiosRequestConfig): Promise<never> => {
      throw new Error('the request must not leave without a token')
    })

    await expect(api.get('/needs-token', { adapter })).rejects.toBeTruthy()
    expect(adapter).not.toHaveBeenCalled()
    expect(endSession).not.toHaveBeenCalled()
    expect(errorToast).toHaveBeenCalledWith('No se pudo validar la solicitud. Actualiza la página e intenta de nuevo.')
  })

  it('ends the session when the token request answers 403 access_revoked', async () => {
    useStore.getState().setToken(null)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ code: 'access_revoked' }) })))

    const adapter = vi.fn(async (_config: InternalAxiosRequestConfig): Promise<never> => {
      throw new Error('the request must not leave without a token')
    })

    await expect(api.get('/needs-token', { adapter })).rejects.toBeTruthy()
    expect(adapter).not.toHaveBeenCalled()
    expect(endSession).toHaveBeenCalledTimes(1)
  })

  it('keeps the session when the refresh fails for a transient reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: {},
      })
    })

    await expect(api.get('/transient', { adapter })).rejects.toBeTruthy()
    expect(endSession).not.toHaveBeenCalled()
  })
})
