'use client'

import { useDebounce } from '@/hooks/useDebounce'
import { type ListHistoryMode, useListViewState } from '@/hooks/useListViewState'
import { useScopedFetcherKey, useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { readApiData } from '@/lib/api-envelope'
import { scopedEventsPagePath } from '@/lib/api-paths'
import { removeEventCacheValue, upsertEventCacheValue } from '@/lib/event-cache'
import { eventCoversMediaRefreshKey, getEventCoversRefreshDelay } from '@/lib/event-media'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event, EventListPage } from '@/models/Event'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import useSWR, { preload } from 'swr'

export type EventListFilter = 'all' | 'upcoming' | 'past' | 'today'

export const EVENT_LIST_FILTERS = ['all', 'upcoming', 'today', 'past'] as const satisfies readonly EventListFilter[]

export const EVENT_LIST_PAGE_SIZE = 12
const EMPTY_EVENTS: Event[] = []
const EMPTY_COUNTS: EventListPage['counts'] = { all: 0, upcoming: 0, today: 0, past: 0 }

interface UseEventsListOptions {
  clientId: string | null | undefined
  isRoot: boolean
}

export function useEventsList({ clientId, isRoot }: UseEventsListOptions) {
  const scopeFetcherKey = useScopedFetcherScope()
  const { search, setSearch, filter, setFilter, page, setPage } = useListViewState<EventListFilter>({
    defaultFilter: 'all',
    filterParam: 'filter',
    pagination: true,
    validFilters: EVENT_LIST_FILTERS,
  })
  const debouncedSearch = useDebounce(search, 200)
  const swrKey = scopedEventsPagePath(clientId, isRoot, {
    page,
    page_size: EVENT_LIST_PAGE_SIZE,
    search: debouncedSearch,
    filter,
  })
  const scopedSWRKey = useScopedFetcherKey(swrKey)
  const {
    data: rawEvents,
    isLoading,
    isValidating,
    error,
    mutate: mutateEvents,
  } = useSWR<EventListPage>(scopedSWRKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const eventsPage = useMemo(() => readApiData<EventListPage | undefined>(rawEvents), [rawEvents])
  const events = eventsPage?.data ?? EMPTY_EVENTS
  const counts = eventsPage?.counts ?? EMPTY_COUNTS
  const dataErrorState = getDataErrorState(error, rawEvents)
  const lastCoverRefreshKey = useRef<string | null>(null)

  useEffect(() => {
    if (isLoading || !eventsPage) return
    const lastPage = Math.max(eventsPage.total_pages, 1)
    if (page > lastPage) setPage(lastPage, 'replace')
  }, [eventsPage, isLoading, page, setPage])

  const preloadEventsPage = useCallback(
    (nextPage: number) => {
      const nextPath = scopedEventsPagePath(clientId, isRoot, {
        page: nextPage,
        page_size: EVENT_LIST_PAGE_SIZE,
        search: debouncedSearch,
        filter,
      })
      if (!nextPath) return
      void Promise.resolve(preload(scopeFetcherKey(nextPath), fetcher))
        .then(() => undefined)
        .catch(() => undefined)
    },
    [clientId, debouncedSearch, filter, isRoot, scopeFetcherKey]
  )

  const saveEventInCurrentPage = useCallback(
    async (savedEvent: Event | null) => {
      if (!savedEvent) {
        void mutateEvents()
        return
      }
      const alreadyVisible = events.some((event) => event.id === savedEvent.id)
      const matchesSearch = `${savedEvent.name} ${savedEvent.identifier ?? ''}`
        .toLowerCase()
        .includes(debouncedSearch.toLowerCase())
      if (!alreadyVisible && (page !== 1 || filter !== 'all' || !matchesSearch)) {
        void mutateEvents()
        return
      }
      await mutateEvents((current) => upsertEventCacheValue(current ?? rawEvents, savedEvent) as EventListPage, {
        revalidate: false,
      })
    },
    [debouncedSearch, events, filter, mutateEvents, page, rawEvents]
  )

  const removeEventFromCurrentPage = useCallback(
    async (event: Event) => {
      await mutateEvents((current) => removeEventCacheValue(current ?? rawEvents, event.id) as EventListPage, {
        revalidate: false,
      })
    },
    [mutateEvents, rawEvents]
  )

  const restoreEventToCurrentPage = useCallback(
    async (event: Event) => {
      await mutateEvents((current) => upsertEventCacheValue(current ?? rawEvents, event) as EventListPage, {
        revalidate: false,
      })
    },
    [mutateEvents, rawEvents]
  )

  const coverRefreshDelay = useMemo(() => getEventCoversRefreshDelay(events), [events])
  const coverRefreshKey = useMemo(() => eventCoversMediaRefreshKey(events), [events])

  useEffect(() => {
    if (coverRefreshDelay === null || !coverRefreshKey) return

    const refreshCovers = () => {
      lastCoverRefreshKey.current = coverRefreshKey
      void mutateEvents()
    }

    if (coverRefreshDelay <= 0) {
      if (lastCoverRefreshKey.current === coverRefreshKey) return
      refreshCovers()
      return
    }

    const timer = window.setTimeout(refreshCovers, coverRefreshDelay)
    return () => window.clearTimeout(timer)
  }, [coverRefreshDelay, coverRefreshKey, mutateEvents])

  return {
    counts,
    dataErrorState,
    debouncedSearch,
    events,
    eventsPage,
    filter,
    isLoading,
    isValidating,
    mutateEvents,
    page,
    preloadEventsPage,
    removeEventFromCurrentPage,
    restoreEventToCurrentPage,
    saveEventInCurrentPage,
    scopeFetcherKey,
    setFilter,
    setPage: setPage as (nextPage: number, mode?: ListHistoryMode) => void,
    setSearch,
    search,
    swrKey,
  }
}
