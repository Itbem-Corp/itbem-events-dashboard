import { expect, test, type Page } from '@playwright/test'
import { localAuthTargets, requireEphemeralIDToken } from './fixtures/local-auth'

type RepositoryCheckpoint = { url: string; revision: string }
type DeliveryContextSource = { id: string; reference: string; revision: string; status: string }
type DeliveryProject = { id: string; name: string; context?: DeliveryContextSource[] }
type RepositoryOnboarding = {
  id: string
  repository_reference: string
  revision: string
  proposal_sha256: string
  status: string
}
type RepositoryOnboardingApproval = { onboarding: RepositoryOnboarding }
type DeliveryWorkItem = { id: string; title: string; state: string }
type DeliveryStreamEvent = { type: 'snapshot' | 'update' | 'error'; revision?: string }

const clientId = process.env.E2E_DELIVERY_CLIENT_ID?.trim() ?? ''
const repositories = parseRepositoryCheckpoints(process.env.E2E_DELIVERY_REPOSITORIES_JSON)

test.use({ storageState: 'tests/e2e/.auth/session.json' })
test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.beforeEach(async ({ context }) => {
  const rawToken = process.env.E2E_ID_TOKEN?.trim()
  if (!rawToken) return
  const token = requireEphemeralIDToken(rawToken)
  const { dashboard } = localAuthTargets(
    process.env.PLAYWRIGHT_BASE_URL,
    process.env.E2E_BACKEND_URL,
  )
  await context.addCookies([{
    name: 'session',
    value: token,
    url: dashboard.origin,
    httpOnly: true,
    secure: dashboard.protocol === 'https:',
    sameSite: 'Lax',
  }])
})

test('qualifies a real single-repository Vault and resumable work-item stream', async ({ page }) => {
  test.skip(!process.env.E2E_ID_TOKEN, 'Only runs against the disposable loopback qualification identity')
  test.skip(!clientId || repositories.length < 1, 'Set a disposable client ID and at least one exact repository checkpoint')
  await page.goto('/automation')
  const subject = await createQualifiedSubject(page, 'single', repositories.slice(0, 1))
  await verifyDeliveryUI(page, subject)
  await verifyResumableStream(page, subject.workItem.id)
})

test('qualifies a heterogeneous multi-repository Vault and frozen matrix', async ({ page }) => {
  test.skip(!process.env.E2E_ID_TOKEN, 'Only runs against the disposable loopback qualification identity')
  test.skip(!clientId || repositories.length < 2, 'Set a disposable client ID and at least two exact repository checkpoints')
  await page.goto('/automation')
  const subject = await createQualifiedSubject(page, 'multi', repositories)
  expect(subject.context).toHaveLength(repositories.length)
  expect(new Set(subject.context.map((source) => source.revision))).toEqual(
    new Set(repositories.map((repository) => repository.revision.toLowerCase()))
  )
  await verifyDeliveryUI(page, subject)
  await verifyResumableStream(page, subject.workItem.id)
})

function parseRepositoryCheckpoints(raw: string | undefined): RepositoryCheckpoint[] {
  if (!raw?.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('E2E_DELIVERY_REPOSITORIES_JSON must be valid JSON')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('E2E_DELIVERY_REPOSITORIES_JSON must contain at least one repository')
  }
  const seen = new Set<string>()
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Repository checkpoint ${index} must be an object`)
    const value = entry as Record<string, unknown>
    const url = typeof value.url === 'string' ? value.url.trim() : ''
    const revision = typeof value.revision === 'string' ? value.revision.trim().toLowerCase() : ''
    let parsedURL: URL
    try {
      parsedURL = new URL(url)
    } catch {
      throw new Error(`Repository checkpoint ${index} must use an absolute GitHub URL`)
    }
    if (
      parsedURL.protocol !== 'https:' ||
      parsedURL.hostname.toLowerCase() !== 'github.com' ||
      parsedURL.username || parsedURL.password || parsedURL.search || parsedURL.hash ||
      !/^[a-f0-9]{40}$/.test(revision)
    ) {
      throw new Error(`Repository checkpoint ${index} must bind one HTTPS GitHub repository to a full SHA`)
    }
    const identity = parsedURL.pathname.replace(/\.git\/?$/i, '').replace(/^\/+|\/+$/g, '').toLowerCase()
    if (identity.split('/').length !== 2 || seen.has(identity)) {
      throw new Error(`Repository checkpoint ${index} is malformed or duplicated`)
    }
    seen.add(identity)
    return { url: `https://github.com/${identity}`, revision }
  })
}

async function createQualifiedSubject(page: Page, kind: 'single' | 'multi', checkpoints: RepositoryCheckpoint[]) {
  const nonce = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const project = await api<DeliveryProject>(page, '/api/automation/projects', 'POST', {
    client_id: clientId,
    intent: `Qualification ${nonce}: prove exact-SHA ${kind}-repository delivery without production effects.`,
  })
  const approved: RepositoryOnboarding[] = []
  for (const checkpoint of checkpoints) {
    const onboarding = await api<RepositoryOnboarding>(page,
      `/api/automation/projects/${project.id}/repository-onboardings/inspect`, 'POST',
      { repository_url: checkpoint.url, revision: checkpoint.revision })
    expect(onboarding.revision.toLowerCase()).toBe(checkpoint.revision)
    expect(onboarding.repository_reference).toMatch(/^github:\/\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
    const result = await api<RepositoryOnboardingApproval>(page,
      `/api/automation/projects/${project.id}/repository-onboardings/${onboarding.id}/approve`, 'POST',
      { expected_revision: onboarding.revision, expected_proposal_sha256: onboarding.proposal_sha256 })
    expect(result.onboarding.status).toBe('approved')
    approved.push(result.onboarding)
  }
  const hydrated = await api<DeliveryProject>(page, `/api/automation/projects/${project.id}`)
  const expectedReferences = new Set(approved.map((onboarding) => onboarding.repository_reference))
  const context = (hydrated.context ?? []).filter((source) => expectedReferences.has(source.reference))
  expect(context).toHaveLength(checkpoints.length)
  for (const source of context) {
    expect(source.status).toBe('ready')
    expect(source.revision).toMatch(/^[a-f0-9]{40}$/)
  }
  const title = `Exact ${kind}-repository qualification ${nonce}`
  const workItem = await api<DeliveryWorkItem>(page, `/api/automation/projects/${project.id}/work-items`, 'POST', {
    title,
    description: 'Disposable local staging evidence. Do not publish, merge, or deploy.',
    expected_outcome: 'Freeze every approved repository SHA and expose an ordered resumable UI state.',
    context_source_ids: context.map((source) => source.id),
    included_scope: context.map((source) => source.reference),
    excluded_scope: ['github-write', 'merge', 'deployment', 'production'],
    acceptance_criteria: ['Exact repository matrix is frozen', 'SSE emits snapshot then ordered update'],
  })
  expect(workItem.state).toBe('planning')
  return { project: hydrated, context, workItem, title }
}

async function verifyDeliveryUI(page: Page, subject: Awaited<ReturnType<typeof createQualifiedSubject>>) {
  await page.goto(`/automation/projects/${subject.project.id}`)
  await expect(page.getByRole('heading', { name: subject.project.name })).toBeVisible()
  const memorySummary = page.locator('summary').filter({ hasText: 'Memoria del agente' }).first()
  await expect(memorySummary).toContainText(`${subject.context.length}/${subject.context.length} fuentes listas`, { timeout: 15_000 })
  await page.goto(`/automation/work-items/${subject.workItem.id}`)
  await expect(page.getByRole('heading', { name: subject.title })).toBeVisible()
  const contextSummary = page.locator('summary').filter({ hasText: `${subject.context.length} fuentes listas` }).first()
  await expect(contextSummary).toBeVisible({ timeout: 15_000 })
  await contextSummary.click()
  for (const source of subject.context) {
    await expect(page.getByText(source.reference, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
  }
}

async function verifyResumableStream(page: Page, workItemId: string) {
  const streamPath = `/api/automation/work-items/${workItemId}/stream`
  await page.evaluate((path) => {
    const state = window as unknown as { __deliveryQualification?: { events: DeliveryStreamEvent[]; controller: AbortController } }
    state.__deliveryQualification?.controller.abort()
    const events: DeliveryStreamEvent[] = []
    const controller = new AbortController()
    state.__deliveryQualification = { events, controller }
    void (async () => {
      try {
        const tokenResponse = await fetch('/api/auth/token', { method: 'POST', cache: 'no-store' })
        const session = await tokenResponse.json() as { token?: string }
        if (!tokenResponse.ok || !session.token) throw new Error('local session unavailable')
        const response = await fetch(`/automation-bridge${path.replace(/^\/api/, '')}`, {
          cache: 'no-store', signal: controller.signal,
          headers: { authorization: `Bearer ${session.token}`, accept: 'text/event-stream' },
        })
        if (!response.ok || !response.body) throw new Error('delivery stream unavailable')
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const frames = buffer.split(/\r?\n\r?\n/)
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const eventType = frame.match(/^event:\s*(snapshot|update)$/m)?.[1] as 'snapshot' | 'update' | undefined
            const data = frame.match(/^data:\s*(.+)$/m)?.[1]
            if (!eventType || !data) continue
            const payload = JSON.parse(data) as { revision?: string }
            events.push({ type: eventType, revision: payload.revision })
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) events.push({ type: 'error' })
      }
    })()
  }, streamPath)
  await expect.poll(() => deliveryStreamEvents(page)).toEqual([
    expect.objectContaining({ type: 'snapshot', revision: expect.stringMatching(/^[a-f0-9]{64}$/) }),
  ])
  const initial = (await deliveryStreamEvents(page))[0]?.revision ?? ''
  await api(page, `/api/automation/work-items/${workItemId}/messages`, 'POST', {
    phase: 'planning', body: 'Disposable staging event used to qualify ordered SSE invalidation.',
  })
  await expect.poll(() => deliveryStreamEvents(page), { timeout: 20_000 }).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'snapshot', revision: initial }),
      expect.objectContaining({ type: 'update', revision: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ])
  )
  const events = await deliveryStreamEvents(page)
  expect(events.find((event) => event.type === 'update')?.revision).not.toBe(initial)
  expect(events.some((event) => event.type === 'error')).toBe(false)
  await page.evaluate(() => {
    const state = window as unknown as { __deliveryQualification?: { controller: AbortController } }
    state.__deliveryQualification?.controller.abort()
    delete state.__deliveryQualification
  })
}

function deliveryStreamEvents(page: Page) {
  return page.evaluate(() => {
    const state = window as unknown as { __deliveryQualification?: { events: DeliveryStreamEvent[] } }
    return state.__deliveryQualification?.events ?? []
  })
}

async function api<T>(page: Page, path: string, method = 'GET', body?: unknown): Promise<T> {
  return page.evaluate(async ({ path, method, body }) => {
    const tokenResponse = await fetch('/api/auth/token', { method: 'POST', cache: 'no-store' })
    const session = await tokenResponse.json() as { token?: string }
    if (!tokenResponse.ok || !session.token) throw new Error('Local qualification session is unavailable')
    const response = await fetch(`/automation-bridge${path.replace(/^\/api/, '')}`, {
      method,
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${session.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'GET' ? {} : { 'idempotency-key': crypto.randomUUID() }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = (await response.json()) as { data?: unknown; message?: string; error?: string }
    if (!response.ok) {
      throw new Error(`${method} ${path} failed (${response.status}): ${payload.message ?? payload.error ?? 'unknown'}`)
    }
    return payload.data as T
  }, { path, method, body })
}
