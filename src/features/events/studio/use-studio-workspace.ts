'use client'

import { useScopedFetcherKey } from '@/hooks/useScopedFetcherKey'
import { studioWorkspacePath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import type { Event } from '@/models/Event'
import type { EventConfig } from '@/models/EventConfig'
import type { EventSection } from '@/models/EventSection'
import useSWR from 'swr'

export interface StudioWorkspace {
  event: Event
  config: EventConfig
  sections: EventSection[]
}

export function useStudioWorkspace(eventId: string | null | undefined, enabled: boolean) {
  const key = useScopedFetcherKey(eventId && enabled ? studioWorkspacePath(eventId) : null)
  return useSWR<StudioWorkspace>(key, fetcher, responsiveListSwrOptions)
}
