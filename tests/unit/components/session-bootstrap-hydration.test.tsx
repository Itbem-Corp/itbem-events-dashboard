import SessionBootstrap from '@/components/session/SessionBootstrap'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hydrated: false,
  profileLoaded: false,
  setApplicationSession: vi.fn(),
  clearSession: vi.fn(),
  refreshApplicationSession: vi.fn().mockResolvedValue(undefined),
  swrKeys: [] as Array<string | null>,
  swrError: undefined as unknown,
  endSession: vi.fn(),
}))

vi.mock('@/lib/end-session', () => ({
  SESSION_SYNC_STORAGE_KEY: 'eventi:session-sync',
  endSession: mocks.endSession,
}))

vi.mock('@/hooks/useStoreHydration', () => ({
  useStoreHydration: () => mocks.hydrated,
}))

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({
      profileLoaded: mocks.profileLoaded,
      setApplicationSession: mocks.setApplicationSession,
      clearSession: mocks.clearSession,
    }),
}))

vi.mock('@/lib/api', () => ({
  getApplicationSession: vi.fn(),
  refreshApplicationSession: mocks.refreshApplicationSession,
  SESSION_REVALIDATE_INTERVAL_MS: 300_000,
  SESSION_FOCUS_REVALIDATE_AFTER_MS: 60_000,
}))

vi.mock('swr', () => ({
  default: (key: string | null) => {
    mocks.swrKeys.push(key)
    return { data: undefined, error: mocks.swrError }
  },
}))

describe('SessionBootstrap hydration ordering', () => {
  beforeEach(() => {
    mocks.hydrated = false
    mocks.profileLoaded = false
    mocks.setApplicationSession.mockClear()
    mocks.clearSession.mockClear()
    mocks.refreshApplicationSession.mockClear()
    mocks.swrKeys = []
    mocks.swrError = undefined
    mocks.endSession.mockClear()
  })

  it('waits for persisted state before resolving the verified application session', () => {
    const { rerender } = render(<SessionBootstrap />)
    expect(mocks.swrKeys.at(-1)).toBeNull()

    mocks.hydrated = true
    rerender(<SessionBootstrap />)
    expect(mocks.swrKeys.at(-1)).toBe('application-session')
  })

  it('does not request the session again once it is loaded', () => {
    mocks.hydrated = true
    mocks.profileLoaded = true
    render(<SessionBootstrap />)

    expect(mocks.swrKeys.at(-1)).toBeNull()
  })

  it('revalidates roles and organization access on a bounded interval', async () => {
    vi.useFakeTimers()
    mocks.hydrated = true
    mocks.profileLoaded = true
    render(<SessionBootstrap />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000)
    })

    expect(mocks.refreshApplicationSession).toHaveBeenCalledWith(0)
    vi.useRealTimers()
  })

  it('clears the local view when another tab ends the session', () => {
    render(<SessionBootstrap />)

    const event = Object.assign(new Event('storage'), {
      key: 'eventi:session-sync',
      newValue: String(Date.now()),
    })
    window.dispatchEvent(event)

    expect(mocks.clearSession).toHaveBeenCalledTimes(1)
  })

  it("ends the session with the 'no_access' reason when /api/session answers 403", () => {
    mocks.hydrated = true
    mocks.swrError = { response: { status: 403 } }
    render(<SessionBootstrap />)
    expect(mocks.endSession).toHaveBeenCalledWith(mocks.clearSession, 'no_access')
  })

  it('ends the session without a reason on 401', () => {
    mocks.hydrated = true
    mocks.swrError = { response: { status: 401 } }
    render(<SessionBootstrap />)
    expect(mocks.endSession).toHaveBeenCalledWith(mocks.clearSession)
  })
})
