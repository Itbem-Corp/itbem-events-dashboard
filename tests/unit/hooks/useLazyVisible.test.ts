import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLazyVisible } from '@/hooks/useLazyVisible'

// Mock IntersectionObserver
const observeMock = vi.fn()
const unobserveMock = vi.fn()
const disconnectMock = vi.fn()
let intersectionCallback: ((entries: IntersectionObserverEntry[]) => void) | null = null

beforeEach(() => {
  observeMock.mockClear()
  unobserveMock.mockClear()
  disconnectMock.mockClear()
  intersectionCallback = null
  vi.stubGlobal('IntersectionObserver', vi.fn(function (cb: (entries: IntersectionObserverEntry[]) => void) {
    intersectionCallback = cb
    return {
      observe: observeMock,
      unobserve: unobserveMock,
      disconnect: disconnectMock,
    }
  }))
})

describe('useLazyVisible', () => {
  it('returns a ref and visible state', () => {
    const { result } = renderHook(() => useLazyVisible())
    expect(result.current.ref).toBeDefined()
    expect(typeof result.current.visible).toBe('boolean')
  })

  it('starts as visible:false when IntersectionObserver exists', () => {
    const { result } = renderHook(() => useLazyVisible())
    expect(result.current.visible).toBe(false)
  })

  it('becomes visible:true when element intersects', () => {
    const { result } = renderHook(() => useLazyVisible())
    act(() => {
      intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry])
    })
    expect(result.current.visible).toBe(true)
  })

  it('does not become visible when isIntersecting is false', () => {
    const { result } = renderHook(() => useLazyVisible())
    act(() => {
      intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry])
    })
    expect(result.current.visible).toBe(false)
  })

  it('disconnects observer after becoming visible', () => {
    const { result } = renderHook(() => useLazyVisible())
    act(() => {
      intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry])
    })
    expect(result.current.visible).toBe(true)
    expect(disconnectMock).toHaveBeenCalled()
  })

  it('accepts a custom rootMargin', () => {
    const { result } = renderHook(() => useLazyVisible('400px'))
    expect(result.current.ref).toBeDefined()
    expect(result.current.visible).toBe(false)
  })
})
