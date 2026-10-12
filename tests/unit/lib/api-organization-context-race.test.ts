// @vitest-environment node
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiModule from '@/lib/api'
import type * as StoreModule from '@/store/useStore'
import type { ApplicationSession } from '@/models/ApplicationSession'

const { endSession, errorToast, infoToast } = vi.hoisted(() => ({
  endSession: vi.fn(),
  errorToast: vi.fn(),
  infoToast: vi.fn(),
}))
vi.mock('@/lib/end-session', () => ({ endSession }))
vi.mock('sonner', () => ({ toast: { error: errorToast, info: infoToast } }))

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const CONTEXT_HEADER = 'X-Organization-Context'
const FAR_FUTURE = '2099-01-01T00:00:00Z'

const session = {
  application: {
    id: 'app',
    code: 'eventiapp',
    name: 'EventiApp',
    product_label: 'EventiApp',
    modules: ['home', 'events'],
    allows_platform_admin: true,
    is_active: true,
  },
  user: { id: 'user', email: 'qa@example.test', is_root: false },
  organizations: [{ id: ORG_ID, name: 'QA', code: 'qa', capabilities: ['events:view'] }],
  capabilities: ['events:view'],
} as unknown as ApplicationSession

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  if (status >= 400) {
    throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, undefined, {
      status,
      statusText: String(status),
      headers: {},
      config,
      data,
    })
  }
  return { status, statusText: 'OK', headers: {}, config, data }
}

function contextRequired(config: InternalAxiosRequestConfig) {
  return respond(config, 403, { message: 'Application context denied', error: 'organization context token is required' })
}

// The credential issuance is an internal request, so the mock transport must
// be the instance default rather than a per-request adapter.
let currentApi: typeof ApiModule.api | null = null
function install<T extends (config: InternalAxiosRequestConfig) => Promise<unknown>>(impl: T) {
  const adapter = vi.fn(impl)
  currentApi!.defaults.adapter = adapter as never
  return adapter
}

function isIssuance(config: InternalAxiosRequestConfig) {
  return config.url === '/session/organization-context'
}

function issued(config: InternalAxiosRequestConfig, token: string) {
  return respond(config, 200, { status: 200, data: { token, organization_id: ORG_ID, expires_at: FAR_FUTURE } })
}

describe('organization context race on a cold load', () => {
  let api: typeof ApiModule.api
  let mod: typeof ApiModule
  let useStore: typeof StoreModule.useStore
  let initialState: ReturnType<typeof StoreModule.useStore.getState>

  beforeEach(async () => {
    vi.resetModules()
    mod = await import('@/lib/api')
    api = mod.api
    currentApi = api
    ;({ useStore } = await import('@/store/useStore'))
    initialState = useStore.getState()
    // A reload: token + verified session + restored organization, but the
    // in-memory organization credential does not exist yet.
    useStore.setState({
      token: 'synthetic-test-token',
      applicationSession: session,
      profileLoaded: true,
      activeTenantCode: 'eventiapp',
      workspaceMode: 'organization',
      currentClient: { id: ORG_ID, name: 'QA', code: 'qa', client_type: { code: '' } } as never,
      organizationContext: null,
    })
  })

  afterEach(() => {
    api.defaults.adapter = undefined
    vi.restoreAllMocks()
    useStore.setState(initialState, true)
    vi.clearAllMocks()
  })

  it('holds the first org-scoped requests until one shared credential issuance resolves', async () => {
    let releaseIssuance: () => void = () => undefined
    const issuanceGate = new Promise<void>((resolve) => {
      releaseIssuance = resolve
    })
    const sentHeaders: Array<string | undefined> = []
    const adapter = install(async (config: InternalAxiosRequestConfig) => {
      if (isIssuance(config)) {
        await issuanceGate
        return issued(config, 'ctx-1')
      }
      const header = config.headers[CONTEXT_HEADER] as string | undefined
      sentHeaders.push(header)
      return header ? respond(config, 200, { ok: true }) : contextRequired(config)
    })

    const requests = Promise.all([
      api.get('/events/dashboard'),
      api.get(`/events?client_id=${ORG_ID}&page=1`),
      api.get('/events/e1/capabilities'),
    ])
    // Let the interceptors run: the screen requests must still be waiting.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(sentHeaders).toEqual([])

    releaseIssuance()
    await expect(requests).resolves.toHaveLength(3)

    expect(adapter.mock.calls.filter(([config]) => isIssuance(config))).toHaveLength(1)
    expect(sentHeaders).toEqual(['ctx-1', 'ctx-1', 'ctx-1'])
    expect(useStore.getState().organizationContext?.token).toBe('ctx-1')
    expect(errorToast).not.toHaveBeenCalled()
    expect(infoToast).not.toHaveBeenCalled()
  })

  it('refreshes the credential once and retries a request rejected for a missing/expired token', async () => {
    useStore.setState({ organizationContext: { token: 'stale', organizationId: ORG_ID, expiresAt: FAR_FUTURE } })
    let issuances = 0
    const adapter = install(async (config: InternalAxiosRequestConfig) => {
      if (isIssuance(config)) return issued(config, `fresh-${++issuances}`)
      return config.headers[CONTEXT_HEADER] === 'stale' ? contextRequired(config) : respond(config, 200, { ok: true })
    })

    await expect(api.get('/events/e1/capabilities')).resolves.toMatchObject({ status: 200 })
    expect(issuances).toBe(1)
    expect(adapter.mock.calls.at(-1)?.[0].headers[CONTEXT_HEADER]).toBe('fresh-1')
    expect(errorToast).not.toHaveBeenCalled()
  })

  it('retries only once and then fails with one Spanish message', async () => {
    const adapter = install(async (config: InternalAxiosRequestConfig) =>
      isIssuance(config) ? issued(config, 'never-accepted') : contextRequired(config)
    )

    const error = await api.get('/events/e1/detail').catch((reason) => reason)
    expect(mod.isOrganizationContextFailure(error)).toBe(true)
    expect(adapter.mock.calls.filter(([config]) => !isIssuance(config))).toHaveLength(2)
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith(mod.ORGANIZATION_CONTEXT_UNAVAILABLE_MESSAGE)
  })

  it('degrades gracefully when the context endpoint answers 503 (no signing secret)', async () => {
    const adapter = install(async (config: InternalAxiosRequestConfig) =>
      isIssuance(config)
        ? respond(config, 503, { message: 'organization context is not configured' })
        : respond(config, 200, { ok: true })
    )

    const results = await Promise.allSettled([
      api.get('/events/dashboard'),
      api.get('/events/e1/detail'),
    ])

    for (const result of results) {
      expect(result.status).toBe('rejected')
      const reason = (result as PromiseRejectedResult).reason
      expect(mod.isOrganizationContextUnavailable(reason)).toBe(true)
      expect(reason.status).toBe(503)
      // Transient: screens and SWR may retry it; it is never "no access".
      expect(mod.isOrganizationContextFailure(reason)).toBe(true)
    }
    // The screen requests never left without a credential.
    expect(adapter.mock.calls.every(([config]) => isIssuance(config))).toBe(true)
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith(mod.ORGANIZATION_CONTEXT_UNAVAILABLE_MESSAGE)
    expect(endSession).not.toHaveBeenCalled()
  })

  it('treats a 403 from issuance as a definitive answer, not a transient failure', async () => {
    const adapter = install(async (config: InternalAxiosRequestConfig) =>
      isIssuance(config)
        ? respond(config, 403, {
            message: 'Application context denied',
            error: 'organization is not enabled for this application session',
          })
        : respond(config, 200, { ok: true })
    )

    const reason = await api.get('/events/e1/detail').catch((error) => error)
    expect(mod.isOrganizationContextUnavailable(reason)).toBe(true)
    expect(reason.status).toBe(403)
    expect(mod.isOrganizationContextFailure(reason)).toBe(false)
  })

  it('does not ask for a credential in the platform workspace or for exempt routes', async () => {
    useStore.setState({ workspaceMode: 'platform', currentClient: null })
    const adapter = install(async (config: InternalAxiosRequestConfig) => respond(config, 200, { ok: true }))
    await api.get('/users/all')
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter.mock.calls[0][0].url).toBe('/users/all')

    expect(mod.requestNeedsOrganizationCredential('get', '/clients?page=1&page_size=50')).toBe(false)
    expect(mod.requestNeedsOrganizationCredential('post', '/clients')).toBe(true)
    expect(mod.requestNeedsOrganizationCredential('post', '/session/organization-context')).toBe(false)
    expect(mod.requestNeedsOrganizationCredential('get', '/session')).toBe(false)
    expect(mod.requestNeedsOrganizationCredential('get', '/api/session/')).toBe(false)
    expect(mod.requestNeedsOrganizationCredential('get', '/events/e1/capabilities')).toBe(true)
  })
  it('does not store a late credential for an organization the user already left', async () => {
    const OTHER_ORG = '22222222-2222-4222-8222-222222222222'
    let releaseIssuance: () => void = () => undefined
    const issuanceGate = new Promise<void>((resolve) => {
      releaseIssuance = resolve
    })
    install(async (config: InternalAxiosRequestConfig) => {
      if (isIssuance(config)) {
        await issuanceGate
        return issued(config, 'ctx-old-org')
      }
      return respond(config, 200, { ok: true })
    })

    const pending = mod.ensureOrganizationContext()
    await new Promise((resolve) => setTimeout(resolve, 10))
    // The user switches organization while the first issuance is in flight
    // and the new workspace already holds its own credential.
    useStore.setState({
      currentClient: { id: OTHER_ORG, name: 'Otra', code: 'otra', client_type: { code: '' } } as never,
      organizationContext: { token: 'ctx-new-org', organizationId: OTHER_ORG, expiresAt: FAR_FUTURE },
    })
    releaseIssuance()
    await pending

    expect(useStore.getState().organizationContext).toEqual({
      token: 'ctx-new-org',
      organizationId: OTHER_ORG,
      expiresAt: FAR_FUTURE,
    })
  })
})
