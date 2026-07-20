'use client'

import { useScopedFetcherKey } from '@/hooks/useScopedFetcherKey'
import { checkinWorkspacePath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import type { Event } from '@/models/Event'
import type { CheckinGuestsPageResponse } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import useSWR from 'swr'

export interface CheckinWorkspace {
  event: Event
  statuses: GuestStatus[]
  guests: CheckinGuestsPageResponse
}

export function useCheckinWorkspace(eventId: string | null | undefined, enabled: boolean) {
  const key = useScopedFetcherKey(eventId && enabled ? checkinWorkspacePath(eventId) : null)
  return useSWR<CheckinWorkspace>(key, fetcher, responsiveListSwrOptions)
}
