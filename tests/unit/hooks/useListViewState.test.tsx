import { useListViewState } from '@/hooks/useListViewState'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const FILTERS = ['all', 'active', 'inactive'] as const

function renderListState() {
  return renderHook(() =>
    useListViewState({
      defaultFilter: 'all',
      filterParam: 'status',
      pagination: true,
      validFilters: FILTERS,
    })
  )
}

describe('useListViewState', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('hydrates a deep-linked search, filter and page', () => {
    window.history.replaceState(null, '', '/users?q=ana&status=inactive&page=3')
    const { result } = renderListState()

    expect(result.current).toMatchObject({ search: 'ana', filter: 'inactive', page: 3 })
  })

  it('updates search in place and resets pagination without creating history noise', () => {
    window.history.replaceState(null, '', '/users?status=active&page=4')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderListState()

    act(() => result.current.setSearch('  ana'))

    expect(result.current).toMatchObject({ search: 'ana', filter: 'active', page: 1 })
    expect(window.location.search).toBe('?status=active&q=ana')
    expect(replaceState).toHaveBeenCalledTimes(1)
  })

  it('creates navigable history for filters and pages while keeping defaults canonical', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const { result } = renderListState()

    act(() => result.current.setFilter('active'))
    expect(result.current.filter).toBe('active')
    act(() => result.current.setPage(2))
    expect(result.current.page).toBe(2)
    act(() => result.current.setFilter('all'))

    expect(window.location.search).toBe('')
    expect(result.current).toMatchObject({ filter: 'all', page: 1 })
    expect(pushState).toHaveBeenCalledTimes(3)
  })

  it('restores state from browser history and rejects invalid values', () => {
    window.history.replaceState(null, '', '/users?status=unknown&page=-4')
    const { result } = renderListState()
    expect(result.current).toMatchObject({ filter: 'all', page: 1 })

    act(() => {
      window.history.replaceState(null, '', '/users?q=restored&status=inactive&page=2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current).toMatchObject({ search: 'restored', filter: 'inactive', page: 2 })
  })
})
