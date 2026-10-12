import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventSectionsReorderPath, sectionPath } from '@/lib/api-paths'
import { cacheRecordId } from '@/lib/cache-record'
import { upsertEventSectionCacheValue } from '@/lib/event-section-cache'
import { sortEventSectionsByRenderOrder } from '@/lib/event-section-order'
import { useEventSectionsSWR } from '@/lib/event-sections-swr'
import { isInvalidExpectedUpdatedAt, sectionConflictCurrent, SectionConflictError } from '@/lib/section-conflict'
import { getDataErrorState } from '@/lib/swr-data-state'
import { EventSection } from '@/models/EventSection'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

const PREVIEW_REFRESH_DEBOUNCE_MS = 1000
const REORDER_SAVE_DEBOUNCE_MS = 350
// STU-N3: minimum gap between two revalidations triggered by the tab getting focus.
const FOCUS_REVALIDATE_MIN_GAP_MS = 2000

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
  const { data, error, isLoading, isValidating, mutate } = useEventSectionsSWR(eventId, initialSections)

  const sections = useMemo(() => (data ? sortEventSectionsByRenderOrder(data) : []), [data])

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reorderSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reorderInFlight = useRef(false)
  const pendingReorderRef = useRef<EventSection[] | null>(null)
  const previousSectionsRef = useRef<EventSection[] | null>(null)
  const sectionsRef = useRef<EventSection[]>([])
  // Config saves still in flight, and sections whose last config save failed.
  // Saves keep running after the editor unmounts, so Studio tracks them here.
  const [savesInFlight, setSavesInFlight] = useState(0)
  const [failedSaveSectionIds, setFailedSaveSectionIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  // STU-N3: another Studio tab may have saved a section meanwhile. The shared list does not
  // revalidate on focus, so Studio does it here; the open editor compares updated_at and
  // reloads or warns ("Esta sección cambió en otra pestaña") instead of overwriting.
  const lastFocusRevalidateRef = useRef(0)
  useEffect(() => {
    if (!eventId) return
    const revalidateOnReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (pendingReorderRef.current || reorderInFlight.current) return
      const now = Date.now()
      if (now - lastFocusRevalidateRef.current < FOCUS_REVALIDATE_MIN_GAP_MS) return
      lastFocusRevalidateRef.current = now
      void mutate()
    }
    window.addEventListener('focus', revalidateOnReturn)
    document.addEventListener('visibilitychange', revalidateOnReturn)
    return () => {
      window.removeEventListener('focus', revalidateOnReturn)
      document.removeEventListener('visibilitychange', revalidateOnReturn)
    }
  }, [eventId, mutate])

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
      // STU-N3: the reorder bumps updated_at on the server; refetch so the next config save
      // sends the current expected_updated_at instead of getting a 409.
      void mutate()
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
    async (
      section: EventSection,
      config: Record<string, unknown>,
      expectedUpdatedAt?: string | null
    ): Promise<EventSection | null> => {
      setSavesInFlight((count) => count + 1)
      try {
        // STU-N3: with expected_updated_at the backend answers 409 section_conflict instead of
        // overwriting a save made in another tab. Without a known version it is last write wins.
        const body = expectedUpdatedAt ? { config, expected_updated_at: expectedUpdatedAt } : { config }
        const res = await api.put<EventSection>(sectionPath(section.id), body)
        const updated = readApiData<EventSection | null>(res.data)
        if (cacheRecordId(updated)) {
          mutate((current) => upsertEventSectionCacheValue(current, updated) as EventSection[], { revalidate: false })
        } else {
          mutate()
        }
        refreshPreview()
        setFailedSaveSectionIds((current) => {
          if (!current.has(section.id)) return current
          const next = new Set(current)
          next.delete(section.id)
          return next
        })
        toast.success('Sección guardada')
        return cacheRecordId(updated) ? updated : null
      } catch (err: unknown) {
        setFailedSaveSectionIds((current) => new Set(current).add(section.id))
        const current = sectionConflictCurrent(err)
        if (current !== undefined) {
          // The editor shows the conflict and lets the host choose; no error toast.
          if (current) {
            mutate((list) => upsertEventSectionCacheValue(list, current) as EventSection[], { revalidate: false })
          } else {
            void mutate()
          }
          throw new SectionConflictError(current)
        }
        if (isInvalidExpectedUpdatedAt(err)) {
          // A client bug: the dashboard must send updated_at exactly as the API returned it.
          console.error('[studio] PUT /sections rejected expected_updated_at', {
            sectionId: section.id,
            expectedUpdatedAt,
          })
        }
        toast.error(getApiErrorMessage(err, 'Error al guardar la configuración'))
        throw err
      } finally {
        setSavesInFlight((count) => Math.max(0, count - 1))
      }
    },
    [mutate, refreshPreview]
  )

  // The user chose to drop a section's failed or conflicting edits (closed its
  // editor and confirmed, or loaded the saved version): stop warning about them.
  const discardFailedSave = useCallback((sectionId: string) => {
    setFailedSaveSectionIds((current) => {
      if (!current.has(sectionId)) return current
      const next = new Set(current)
      next.delete(sectionId)
      return next
    })
  }, [])

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
    discardFailedSave,
    hasUnsavedChanges: savesInFlight > 0 || failedSaveSectionIds.size > 0,
    refreshPreview,
    refreshPreviewNow,
  }
}
