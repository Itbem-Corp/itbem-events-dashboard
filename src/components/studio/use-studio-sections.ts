import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventSectionsPath, eventSectionsReorderPath, sectionPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { upsertEventSectionCacheValue } from '@/lib/event-section-cache'
import { sortEventSectionsByRenderOrder } from '@/lib/event-section-order'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import { EventSection } from '@/models/EventSection'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'

const PREVIEW_REFRESH_DEBOUNCE_MS = 1000
const REORDER_SAVE_DEBOUNCE_MS = 350

function withSequentialOrders(sections: EventSection[]) {
  return sections.map((section, index) => ({ ...section, order: index + 1 }))
}

function hasOrderChanges(next: EventSection[], baseline: EventSection[]) {
  if (next.length !== baseline.length) return true
  return next.some((section) => {
    const original = baseline.find((item) => item.id === section.id)
    return !original || original.order !== section.order
  })
}

export function useStudioSections(
  eventId: string | undefined,
  onRefreshPreview?: () => void,
  initialSections?: EventSection[]
) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<EventSection[]>(
    eventId ? eventSectionsPath(eventId) : null,
    fetcher,
    {
      ...responsiveListSwrOptions,
      fallbackData: initialSections,
      revalidateOnMount: initialSections === undefined,
    }
  )

  const sections = useMemo(() => (data ? sortEventSectionsByRenderOrder(data) : []), [data])

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reorderSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reorderInFlight = useRef(false)
  const pendingReorderRef = useRef<EventSection[] | null>(null)
  const previousSectionsRef = useRef<EventSection[] | null>(null)
  const sectionsRef = useRef<EventSection[]>([])

  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current)
      refreshTimerRef.current = null
      reorderSaveTimerRef.current = null
    }
  }, [])

  const refreshPreview = useCallback(() => {
    if (!onRefreshPreview) return
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      onRefreshPreview()
    }, PREVIEW_REFRESH_DEBOUNCE_MS)
  }, [onRefreshPreview])

  const refreshPreviewNow = useCallback(() => {
    if (!onRefreshPreview) return
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = null
    onRefreshPreview()
  }, [onRefreshPreview])

  const flushPendingReorder = useCallback(async () => {
    if (reorderInFlight.current || !eventId) return

    const nextOrder = pendingReorderRef.current
    if (!nextOrder) return

    pendingReorderRef.current = null
    reorderInFlight.current = true

    try {
      await api.patch(eventSectionsReorderPath(eventId), {
        sections: nextOrder.map((section) => ({ id: section.id, order: section.order })),
      })
      previousSectionsRef.current = null
      await mutate(nextOrder, { revalidate: false })
      refreshPreview()
    } catch (err: unknown) {
      const rollback = previousSectionsRef.current
      previousSectionsRef.current = null
      if (rollback) {
        mutate(rollback, { revalidate: true })
      } else {
        mutate()
      }
      toast.error(getApiErrorMessage(err, 'Error al reordenar'))
    } finally {
      reorderInFlight.current = false
      if (pendingReorderRef.current) {
        reorderSaveTimerRef.current = setTimeout(() => {
          reorderSaveTimerRef.current = null
          void flushPendingReorder()
        }, 0)
      }
    }
  }, [eventId, mutate, refreshPreview])

  const handleReorder = useCallback(
    async (newOrder: EventSection[]) => {
      if (!eventId) return

      const updated = withSequentialOrders(newOrder)
      const baseline = previousSectionsRef.current ?? sectionsRef.current

      if (!hasOrderChanges(updated, baseline)) {
        pendingReorderRef.current = null
        previousSectionsRef.current = null
        if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current)
        reorderSaveTimerRef.current = null
        mutate(updated, { revalidate: false })
        return
      }

      previousSectionsRef.current ??= baseline
      mutate(updated, { revalidate: false })
      pendingReorderRef.current = updated

      if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current)
      reorderSaveTimerRef.current = setTimeout(() => {
        reorderSaveTimerRef.current = null
        void flushPendingReorder()
      }, REORDER_SAVE_DEBOUNCE_MS)
    },
    [eventId, flushPendingReorder, mutate]
  )

  const handleToggleVisible = useCallback(
    async (section: EventSection) => {
      const toggled = !section.is_visible

      previousSectionsRef.current = sections
      const optimistic = sections.map((s) => (s.id === section.id ? { ...s, is_visible: toggled } : s))
      mutate(optimistic, { revalidate: false })

      try {
        const res = await api.put<EventSection>(sectionPath(section.id), { is_visible: toggled })
        const updated = readApiData<EventSection | null>(res.data)
        if (cacheRecordId(updated)) {
          mutate((current) => upsertEventSectionCacheValue(current, updated) as EventSection[], { revalidate: false })
        } else {
          mutate()
        }
        refreshPreview()
      } catch (err: unknown) {
        mutate(previousSectionsRef.current, { revalidate: true })
        toast.error(getApiErrorMessage(err, 'Error al cambiar visibilidad'))
      }
    },
    [sections, mutate, refreshPreview]
  )

  const handleSaveConfig = useCallback(
    async (section: EventSection, config: Record<string, unknown>) => {
      try {
        const res = await api.put<EventSection>(sectionPath(section.id), { config })
        const updated = readApiData<EventSection | null>(res.data)
        if (cacheRecordId(updated)) {
          mutate((current) => upsertEventSectionCacheValue(current, updated) as EventSection[], { revalidate: false })
        } else {
          mutate()
        }
        refreshPreview()
        toast.success('Seccion guardada')
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, 'Error al guardar configuracion'))
        throw err
      }
    },
    [mutate, refreshPreview]
  )

  return {
    sections,
    isLoading,
    isValidating,
    error,
    errorState: getDataErrorState(error, data),
    retry: mutate,
    handleReorder,
    handleToggleVisible,
    handleSaveConfig,
    refreshPreview,
    refreshPreviewNow,
  }
}
