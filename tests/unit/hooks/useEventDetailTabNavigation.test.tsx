import { useEventDetailTabNavigation } from '@/hooks/useEventDetailTabNavigation'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({
  pathname: '/events/event-1',
  search: '',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

describe('useEventDetailTabNavigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
    navigation.pathname = '/events/event-1'
    navigation.search = ''
    vi.spyOn(window.history, 'pushState')
    vi.spyOn(window.history, 'replaceState')
  })

  it('opens a valid deep-linked tab and preserves unrelated search params when navigating', () => {
    navigation.search = 'source=studio&tab=configuracion'
    window.history.replaceState(null, '', `/events/event-1?${navigation.search}`)
    const { result } = renderHook(() => useEventDetailTabNavigation())

    expect(result.current.activeTab).toBe('configuracion')

    act(() => result.current.setActiveTab('invitados'))

    expect(result.current.activeTab).toBe('invitados')
    expect(window.history.pushState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/events/event-1?source=studio&tab=invitados'
    )
  })

  it('falls back safely and canonicalizes an invalid tab without a hard navigation', () => {
    navigation.search = 'source=email&tab=no-existe'
    window.history.replaceState(null, '', `/events/event-1?${navigation.search}`)
    const { result } = renderHook(() => useEventDetailTabNavigation())

    expect(result.current.activeTab).toBe('resumen')
    expect(window.history.replaceState).toHaveBeenCalledWith(window.history.state, '', '/events/event-1?source=email')
  })

  it('follows URL changes so browser back and forward restore the corresponding panel', () => {
    navigation.search = 'tab=configuracion'
    window.history.replaceState(null, '', `/events/event-1?${navigation.search}`)
    const { result, rerender } = renderHook(() => useEventDetailTabNavigation())

    act(() => result.current.setActiveTab('invitados'))
    expect(result.current.activeTab).toBe('invitados')
    expect(window.history.pushState).toHaveBeenCalledWith(window.history.state, '', '/events/event-1?tab=invitados')

    navigation.search = 'tab=invitados'
    rerender()
    expect(result.current.activeTab).toBe('invitados')

    navigation.search = 'tab=configuracion'
    rerender()
    expect(result.current.activeTab).toBe('configuracion')

    navigation.search = 'tab=invitados'
    rerender()
    expect(result.current.activeTab).toBe('invitados')
  })

  it('uses the canonical URL for the default tab and ignores a duplicate selection', () => {
    navigation.search = 'campaign=spring&tab=invitados'
    window.history.replaceState(null, '', `/events/event-1?${navigation.search}`)
    const { result, rerender } = renderHook(() => useEventDetailTabNavigation())

    act(() => result.current.setActiveTab('resumen'))
    expect(window.history.pushState).toHaveBeenCalledWith(window.history.state, '', '/events/event-1?campaign=spring')

    navigation.search = ''
    rerender()
    vi.mocked(window.history.pushState).mockClear()
    act(() => result.current.setActiveTab('resumen'))
    expect(window.history.pushState).not.toHaveBeenCalled()
  })

  it('can replace an unauthorized deep link without adding a history entry', () => {
    navigation.search = 'source=email&tab=configuracion'
    window.history.replaceState(null, '', `/events/event-1?${navigation.search}`)
    const { result } = renderHook(() => useEventDetailTabNavigation())

    vi.mocked(window.history.replaceState).mockClear()
    act(() => result.current.replaceActiveTab('resumen'))

    expect(result.current.activeTab).toBe('resumen')
    expect(window.history.replaceState).toHaveBeenCalledWith(window.history.state, '', '/events/event-1?source=email')
    expect(window.history.pushState).not.toHaveBeenCalled()
  })
})
