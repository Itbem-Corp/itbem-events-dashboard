'use client'

import { useScopedFetcherKey } from '@/hooks/useScopedFetcherKey'
import { eventCapabilitiesPath } from '@/lib/api-paths'
import { isOrganizationContextFailure } from '@/lib/api'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import type { EventCapabilities } from '@/models/EventMember'
import useSWR from 'swr'

export function useEventCapabilities(eventId: string | null | undefined) {
  const key = useScopedFetcherKey(eventId ? eventCapabilitiesPath(eventId) : null)
  return useSWR<EventCapabilities>(key, fetcher, {
    ...responsiveListSwrOptions,
    // A role denial is final, but a failure of the organization credential
    // (cold load, reload, deep link) must never be kept as "no access".
    shouldRetryOnError: isOrganizationContextFailure,
  })
}
