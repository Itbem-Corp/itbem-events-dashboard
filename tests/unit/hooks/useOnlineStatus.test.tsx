import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOnlineStatus', () => {
  it('reacts to browser connectivity events', () => {
    let online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)

    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      online = false
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      online = true
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
