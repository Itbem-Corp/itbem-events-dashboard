'use client'

import { fetcher } from '@/lib/fetcher'
import { parseRecurrenceSchedulePage, recurrenceSchedulesPath, type RecurrenceSchedulePage } from './recurrence-schedules'
import useSWRInfinite from 'swr/infinite'

const EMPTY_PAGES: RecurrenceSchedulePage[] = []

export function useRecurrenceSchedules(projectId: string) {
  const query = useSWRInfinite<RecurrenceSchedulePage>(
    (pageIndex, previousPage) => {
      if (!projectId || (pageIndex > 0 && previousPage?.next_offset === undefined)) return null
      return recurrenceSchedulesPath(projectId, pageIndex > 0 ? previousPage?.next_offset ?? 0 : 0)
    },
    async (path) => parseRecurrenceSchedulePage(await fetcher<unknown>(path), projectId),
    {
      initialSize: 1,
      persistSize: false,
      revalidateOnFocus: true,
      revalidateFirstPage: true,
      revalidateAll: false,
      shouldRetryOnError: false,
    },
  )

  const pages = query.data ?? EMPTY_PAGES
  return {
    ...query,
    pages,
    schedules: pages.flatMap((page) => page.items),
    hasMore: pages.at(-1)?.next_offset !== undefined,
  }
}
