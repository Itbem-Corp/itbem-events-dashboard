import { useMediaQuery } from '@/hooks/useMediaQuery'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMediaQuery', () => {
  it('tracks viewport query changes and removes its listener on unmount', () => {
    let matches = false
    let listener: (() => void) | undefined
    const removeEventListener = vi.fn()

    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return matches
        },
        media: '(min-width: 1024px)',
        onchange: null,
        addEventListener: (_type: string, nextListener: () => void) => {
          listener = nextListener
        },
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )

    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)

    act(() => {
      matches = true
      listener?.()
    })
    expect(result.current).toBe(true)

    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
