import { eventSectionsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import type { EventSection } from '@/models/EventSection'
import { useCallback, useEffect, useRef } from 'react'
import useSWR, { type KeyedMutator, type MutatorOptions } from 'swr'

type SectionsUpdater = (current: EventSection[] | undefined) => EventSection[] | undefined

/**
 * The event sections list, shared by Studio and the Configuración sections manager.
 *
 * Both screens get the list already loaded from the event workspace and pass it as
 * `fallbackData` without revalidating on mount. SWR keeps fallback data out of its
 * cache, so a functional `mutate(current => …)` would receive `undefined` and an upsert
 * would turn the list into the one edited section (STU-10) or a delete into an empty list
 * (STU-38). The `mutate` returned here hands updaters the list on screen instead.
 */
export function useEventSectionsSWR(eventId: string | undefined, initialSections?: EventSection[]) {
  const swr = useSWR<EventSection[]>(eventId ? eventSectionsPath(eventId) : null, fetcher, {
    ...responsiveListSwrOptions,
    fallbackData: initialSections,
    revalidateOnMount: initialSections === undefined,
  })

  const { data, mutate: rawMutate } = swr
  const shownRef = useRef<EventSection[] | undefined>(data)
  useEffect(() => {
    shownRef.current = data
  }, [data])

  const mutate = useCallback(
    (
      update?: EventSection[] | SectionsUpdater | Promise<EventSection[] | undefined>,
      options?: boolean | MutatorOptions<EventSection[]>
    ) => {
      if (typeof update === 'function') {
        return rawMutate((current) => update(current ?? shownRef.current), options)
      }
      return update === undefined && options === undefined ? rawMutate() : rawMutate(update, options)
    },
    [rawMutate]
  ) as KeyedMutator<EventSection[]>

  return { ...swr, mutate }
}
