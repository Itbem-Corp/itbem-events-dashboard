'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

const LIST_VIEW_STATE_CHANGE = 'eventi:list-view-state-change'

export type ListHistoryMode = 'push' | 'replace'

interface ListViewStateOptions<Filter extends string> {
  defaultFilter: Filter
  filterParam?: string
  pagination?: boolean
  validFilters: readonly Filter[]
}

function subscribeToUrl(callback: () => void) {
  window.addEventListener('popstate', callback)
  window.addEventListener(LIST_VIEW_STATE_CHANGE, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener(LIST_VIEW_STATE_CHANGE, callback)
  }
}

function getUrlSnapshot() {
  return window.location.search
}

function getServerUrlSnapshot() {
  return ''
}

function parsePage(value: string | null) {
  if (!value) return 1
  const page = Number.parseInt(value, 10)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function writeUrl(mutator: (params: URLSearchParams) => void, mode: ListHistoryMode) {
  const params = new URLSearchParams(window.location.search)
  mutator(params)
  const query = params.toString()
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return

  window.history[mode === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', nextUrl)
  window.dispatchEvent(new Event(LIST_VIEW_STATE_CHANGE))
}

export function useListViewState<Filter extends string>({
  defaultFilter,
  filterParam,
  pagination = false,
  validFilters,
}: ListViewStateOptions<Filter>) {
  const urlSnapshot = useSyncExternalStore(subscribeToUrl, getUrlSnapshot, getServerUrlSnapshot)
  const params = useMemo(() => new URLSearchParams(urlSnapshot), [urlSnapshot])
  const search = params.get('q') ?? ''
  const rawFilter = filterParam ? params.get(filterParam) : null
  const filter = validFilters.includes(rawFilter as Filter) ? (rawFilter as Filter) : defaultFilter
  const page = pagination ? parsePage(params.get('page')) : 1

  const setSearch = useCallback((nextSearch: string) => {
    writeUrl((nextParams) => {
      const normalized = nextSearch.trimStart()
      if (normalized) nextParams.set('q', normalized)
      else nextParams.delete('q')
      nextParams.delete('page')
    }, 'replace')
  }, [])

  const setFilter = useCallback(
    (nextFilter: Filter) => {
      if (!filterParam || !validFilters.includes(nextFilter)) return
      writeUrl((nextParams) => {
        if (nextFilter === defaultFilter) nextParams.delete(filterParam)
        else nextParams.set(filterParam, nextFilter)
        nextParams.delete('page')
      }, 'push')
    },
    [defaultFilter, filterParam, validFilters]
  )

  const setPage = useCallback(
    (nextPage: number, mode: ListHistoryMode = 'push') => {
      if (!pagination) return
      const normalized = Math.max(1, Math.trunc(nextPage))
      writeUrl((nextParams) => {
        if (normalized === 1) nextParams.delete('page')
        else nextParams.set('page', String(normalized))
      }, mode)
    },
    [pagination]
  )

  return { filter, page, search, setFilter, setPage, setSearch }
}
