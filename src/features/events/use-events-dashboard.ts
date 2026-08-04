'use client'

import { useScopedFetcherKey, useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { readApiData } from '@/lib/api-envelope'
import { scopedEventsDashboardPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { Event, EventDashboardOverview } from '@/models/Event'
import { useMemo } from 'react'
import useSWR from 'swr'

const EMPTY_EVENTS: Event[] = []
const EMPTY_METRICS: EventDashboardOverview['metrics'] = {
  total: 0,
  active: 0,
  upcoming: 0,
  past_active: 0,
  total_capacity: 0,
}

export interface EventsDashboardQuery {
  canViewEvents: boolean
  isPlatformContext: boolean
  organizationId?: string
  isRoot: boolean
}

/** Fetches the workspace dashboard once and exposes a stable view model for its route. */
export function useEventsDashboard({
  canViewEvents,
  isPlatformContext,
  organizationId,
  isRoot,
}: EventsDashboardQuery) {
  const scopeFetcherKey = useScopedFetcherScope()
  const eventsKey =
    canViewEvents && !isPlatformContext ? scopedEventsDashboardPath(organizationId, isRoot) : null
  const scopedEventsKey = useScopedFetcherKey(eventsKey)
  const {
    data: rawEvents,
    isLoading: eventsLoading,
    isValidating: eventsValidating,
    error: eventsError,
    mutate: mutateEvents,
  } = useSWR<EventDashboardOverview>(scopedEventsKey, fetcher, responsiveListSwrOptions)
  const overview = useMemo(() => readApiData<EventDashboardOverview | undefined>(rawEvents), [rawEvents])

  return {
    scopeFetcherKey,
    isLoading: Boolean(!eventsKey || eventsLoading),
    eventsValidating,
    mutateEvents,
    eventsErrorState: getDataErrorState(eventsError, rawEvents),
    activeEvents: overview?.active_events ?? EMPTY_EVENTS,
    nextEvent: overview?.next_event,
    metrics: overview?.metrics ?? EMPTY_METRICS,
    nextGuestSummary: overview?.next_event_guest_summary,
  }
}
