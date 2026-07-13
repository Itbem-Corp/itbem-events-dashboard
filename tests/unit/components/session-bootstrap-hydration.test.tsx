import SessionBootstrap from '@/components/session/SessionBootstrap'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hydrated: false,
  profileLoaded: false,
  setProfile: vi.fn(),
  swrKeys: [] as Array<string | null>,
}))

vi.mock('@/hooks/useStoreHydration', () => ({
  useStoreHydration: () => mocks.hydrated,
}))

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ profileLoaded: mocks.profileLoaded, setProfile: mocks.setProfile }),
}))

vi.mock('swr', () => ({
  default: (key: string | null) => {
    mocks.swrKeys.push(key)
    return { data: undefined }
  },
}))

describe('SessionBootstrap hydration ordering', () => {
  beforeEach(() => {
    mocks.hydrated = false
    mocks.profileLoaded = false
    mocks.setProfile.mockClear()
    mocks.swrKeys = []
  })

  it('waits for persisted state before requesting the profile', () => {
    const { rerender } = render(<SessionBootstrap />)
    expect(mocks.swrKeys.at(-1)).toBeNull()

    mocks.hydrated = true
    rerender(<SessionBootstrap />)
    expect(mocks.swrKeys.at(-1)).toBe('/users')
  })

  it('does not request the profile again once it is loaded', () => {
    mocks.hydrated = true
    mocks.profileLoaded = true
    render(<SessionBootstrap />)

    expect(mocks.swrKeys.at(-1)).toBeNull()
  })
})
