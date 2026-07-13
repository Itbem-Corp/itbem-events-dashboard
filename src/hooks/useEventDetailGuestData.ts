'use client'

import type { EventDetailTabId } from '@/components/events/event-detail-tabs'
import { usePageActivity } from '@/hooks/usePageActivity'
import { eventGuestSummaryPath } from '@/lib/api-paths'
import { eventLiveRefreshInterval, shouldRefreshEventGuests } from '@/lib/event-live-refresh'
import { fetcher } from '@/lib/fetcher'
import { normalizeGuestSummary } from '@/lib/guest-summary'
import type { GuestSummary } from '@/models/GuestSummary'
import { useMemo } from 'react'
import useSWR from 'swr'

export function useEventDetailGuestData(
  eventId: string | undefined,
  activeTab: EventDetailTabId,
  liveRefreshEnabled = true,
  initialSummary?: GuestSummary | null
) {
  const isPageActive = usePageActivity()
  const shouldRefreshGuests = shouldRefreshEventGuests(activeTab)
  const composedDetailReady = initialSummary !== undefined
  const summaryKey = eventId && composedDetailReady ? eventGuestSummaryPath(eventId) : null

  const {
    data: rawSummary,
    error: summaryError,
    isLoading: summaryLoading,
    mutate: retrySummary,
  } = useSWR<unknown>(summaryKey, fetcher, {
    fallbackData: initialSummary ?? undefined,
    revalidateOnMount: initialSummary === null,
    revalidateOnFocus: true,
    refreshInterval: eventLiveRefreshInterval(
      isPageActive && liveRefreshEnabled && (activeTab === 'resumen' || shouldRefreshGuests)
    ),
  })
  const summary = useMemo(() => normalizeGuestSummary(rawSummary), [rawSummary])

  return {
    summary,
    summaryError,
    summaryLoading,
    retrySummary,
  }
}
