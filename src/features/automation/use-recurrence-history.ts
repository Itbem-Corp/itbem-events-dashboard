'use client'

import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { fetcher } from '@/lib/fetcher'
import type { ScopedFetcherKey } from '@/lib/request-context'
import useSWRInfinite from 'swr/infinite'
import {
  parseRecurrenceEventPage,
  parseRecurrenceOccurrencePage,
  RECURRENCE_HISTORY_MAX_OFFSET,
  RECURRENCE_HISTORY_PAGE_SIZE,
  recurrenceScheduleEventsPath,
  recurrenceScheduleOccurrencesPath,
  type RecurrenceHistoryPage,
  type RecurrenceScheduleEvent,
  type RecurrenceScheduleOccurrence,
} from './recurrence-schedules'

export type RecurrenceHistoryListState<Item> = {
  items: Item[]
  error?: Error
  isLoading: boolean
  isValidating: boolean
  hasMore: boolean
  offsetLimitReached: boolean
  loadMore: () => void
  refresh: () => void
}

type HistoryQuery<Item> = {
  data?: RecurrenceHistoryPage<Item>[]
  error?: Error
  isLoading: boolean
  isValidating: boolean
  size: number
  setSize: (size: number) => Promise<unknown>
  mutate: () => Promise<unknown>
}

function uniqueByID<Item extends { id: string }>(items: Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function historyListState<Item extends { id: string }>(query: HistoryQuery<Item>): RecurrenceHistoryListState<Item> {
  const pages = query.data ?? []
  const nextOffset = pages.at(-1)?.next_offset
  return {
    items: uniqueByID(pages.flatMap((page) => page.items)),
    ...(query.error ? { error: query.error } : {}),
    isLoading: query.isLoading,
    isValidating: query.isValidating,
    hasMore: nextOffset !== undefined && nextOffset <= RECURRENCE_HISTORY_MAX_OFFSET,
    offsetLimitReached: nextOffset !== undefined && nextOffset > RECURRENCE_HISTORY_MAX_OFFSET,
    loadMore: () => {
      if (nextOffset !== undefined && nextOffset <= RECURRENCE_HISTORY_MAX_OFFSET && !query.isValidating) {
        void query.setSize(query.size + 1)
      }
    },
    refresh: () => { void query.mutate() },
  }
}

function getHistoryPageKey<Item>(
  pageIndex: number,
  previousPage: RecurrenceHistoryPage<Item> | null,
  projectID: string,
  scheduleID: string,
  pathForOffset: (offset: number) => string,
  scopePath: (path: string) => ScopedFetcherKey,
): ScopedFetcherKey | null {
  if (!projectID || !scheduleID) return null
  const offset = pageIndex === 0 ? 0 : previousPage?.next_offset
  if (offset === undefined || offset > RECURRENCE_HISTORY_MAX_OFFSET) return null
  return scopePath(pathForOffset(offset))
}

function requestedPagination(key: ScopedFetcherKey) {
  const url = new URL(key[0], 'http://dashboard.local')
  const limit = Number(url.searchParams.get('limit'))
  const offset = Number(url.searchParams.get('offset'))
  if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) throw new Error('invalid schedule history request pagination')
  return { limit, offset }
}

export function useRecurrenceHistory(projectID: string, scheduleID: string): {
  occurrences: RecurrenceHistoryListState<RecurrenceScheduleOccurrence>
  events: RecurrenceHistoryListState<RecurrenceScheduleEvent>
} {
  const scopePath = useScopedFetcherScope()
  const occurrences = useSWRInfinite<RecurrenceHistoryPage<RecurrenceScheduleOccurrence>>(
    (pageIndex, previousPage) => getHistoryPageKey(
      pageIndex,
      previousPage,
      projectID,
      scheduleID,
      (offset) => recurrenceScheduleOccurrencesPath(projectID, scheduleID, { limit: RECURRENCE_HISTORY_PAGE_SIZE, offset }),
      scopePath,
    ),
    async (key) => {
      const scopedKey = key as ScopedFetcherKey
      return parseRecurrenceOccurrencePage(await fetcher<unknown>(scopedKey), scheduleID, requestedPagination(scopedKey))
    },
    {
      initialSize: 1,
      persistSize: false,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
      shouldRetryOnError: false,
    },
  )
  const events = useSWRInfinite<RecurrenceHistoryPage<RecurrenceScheduleEvent>>(
    (pageIndex, previousPage) => getHistoryPageKey(
      pageIndex,
      previousPage,
      projectID,
      scheduleID,
      (offset) => recurrenceScheduleEventsPath(projectID, scheduleID, { limit: RECURRENCE_HISTORY_PAGE_SIZE, offset }),
      scopePath,
    ),
    async (key) => {
      const scopedKey = key as ScopedFetcherKey
      return parseRecurrenceEventPage(await fetcher<unknown>(scopedKey), scheduleID, requestedPagination(scopedKey))
    },
    {
      initialSize: 1,
      persistSize: false,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
      shouldRetryOnError: false,
    },
  )
  return {
    occurrences: historyListState(occurrences),
    events: historyListState(events),
  }
}
