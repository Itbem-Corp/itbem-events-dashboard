'use client'

import type { Moment } from '@/models/Moment'
import { useCallback, useEffect, useRef, useState } from 'react'

export const MOMENT_REORDER_SAVE_DEBOUNCE_MS = 800

function timeOf(value: string | undefined): number {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? 0 : time
}

/**
 * The public wall order (backend MomentRepository): moments with a custom
 * order (> 0) first by that order, then the rest newest first, id as tiebreak.
 * The dashboard list is newest first, so reorder mode must re-sort before showing it.
 */
export function compareMomentsByWallOrder(a: Moment, b: Moment): number {
  const orderA = typeof a.order === 'number' && a.order > 0 ? a.order : 0
  const orderB = typeof b.order === 'number' && b.order > 0 ? b.order : 0
  if (orderA > 0 && orderB === 0) return -1
  if (orderA === 0 && orderB > 0) return 1
  if (orderA !== orderB) return orderA - orderB
  const created = timeOf(b.created_at) - timeOf(a.created_at)
  if (created !== 0) return created
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function sortMomentsByWallOrder(moments: readonly Moment[]): Moment[] {
  return [...moments].sort(compareMomentsByWallOrder)
}

/** Identity of an order: ids only, so new presigned URLs or updated_at never look like a change. */
export function momentOrderSignature(moments: readonly Pick<Moment, 'id'>[]): string {
  return moments.map((moment) => moment.id).join('|')
}

export function momentReorderPayload(moments: readonly Pick<Moment, 'id'>[]) {
  return moments.map((moment, index) => ({ id: moment.id, order: index + 1 }))
}

/**
 * Refreshes card data (URLs, approval) from a fresh dashboard fetch without
 * changing the order. Moments that are no longer approved are dropped; ids
 * missing from `latest` (pages not loaded) are kept as they are.
 */
export function mergeLatestMoments(ordered: readonly Moment[], latest: readonly Moment[]): Moment[] {
  const byId = new Map(latest.map((moment) => [moment.id, moment]))
  const merged: Moment[] = []
  for (const moment of ordered) {
    const fresh = byId.get(moment.id)
    if (!fresh) merged.push(moment)
    else if (fresh.is_approved) merged.push(fresh)
  }
  return merged
}

/**
 * Local order used while the moments wall is in reorder mode. It saves only
 * after a user drag that really changes the id order (debounced), never when
 * the list is seeded or refreshed from the server, so it cannot loop.
 */
export function useMomentReorderDraft(
  save: (ordered: Moment[]) => Promise<void>,
  debounceMs: number = MOMENT_REORDER_SAVE_DEBOUNCE_MS
) {
  const [ordered, setOrdered] = useState<Moment[]>([])
  const orderedRef = useRef<Moment[]>([])
  const savedSignatureRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const apply = useCallback((next: Moment[]) => {
    orderedRef.current = next
    setOrdered(next)
  }, [])

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const runSave = useCallback(async () => {
    timerRef.current = null
    const snapshot = orderedRef.current
    const signature = momentOrderSignature(snapshot)
    if (signature === savedSignatureRef.current) return
    try {
      await saveRef.current(snapshot)
      savedSignatureRef.current = signature
    } catch {
      // The caller reports the error; the next drag (or exit) retries.
    }
  }, [])

  /** Starts reorder mode from the wall order. Never saves. */
  const seed = useCallback(
    (moments: readonly Moment[]) => {
      cancel()
      const sorted = sortMomentsByWallOrder(moments)
      savedSignatureRef.current = momentOrderSignature(sorted)
      apply(sorted)
    },
    [apply, cancel]
  )

  /** A user drag. Schedules a save only when the id order changed. */
  const reorder = useCallback(
    (next: Moment[]) => {
      apply(next)
      cancel()
      if (momentOrderSignature(next) === savedSignatureRef.current) return
      timerRef.current = setTimeout(() => void runSave(), debounceMs)
    },
    [apply, cancel, debounceMs, runSave]
  )

  /** Fresh server data for the cards, keeping the local order. Never saves. */
  const sync = useCallback(
    (latest: readonly Moment[]) => {
      const merged = mergeLatestMoments(orderedRef.current, latest)
      const current = orderedRef.current
      const unchanged = merged.length === current.length && merged.every((moment, index) => moment === current[index])
      if (unchanged) return
      // Dropping a moment that is no longer approved is not a user reorder.
      if (momentOrderSignature(merged) !== momentOrderSignature(current) && !timerRef.current) {
        savedSignatureRef.current = momentOrderSignature(merged)
      }
      apply(merged)
    },
    [apply]
  )

  /** Sends a pending drag right away (used when leaving reorder mode). */
  const flush = useCallback(async () => {
    if (!timerRef.current) return
    cancel()
    await runSave()
  }, [cancel, runSave])

  return { ordered, seed, reorder, sync, flush, cancel }
}
