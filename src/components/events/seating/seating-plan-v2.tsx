'use client'

import { EmptyState } from '@/components/ui/empty-state'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { eventSeatingWorkspacePath, eventTablesPlanPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { getGuestPartySize } from '@/lib/guest-utils'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ChevronDownIcon, RectangleGroupIcon } from '@heroicons/react/20/solid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import useSWR from 'swr'

import { AssignBottomSheet } from './assign-bottom-sheet'
import { GuestChip } from './guest-chip'
import {
  checkSeat,
  isSeatable,
  readSeatingPlanStaleError,
  readTableOverCapacityError,
  seatRefusalMessage,
} from './seating-capacity'
import { seatingCollisionDetection } from './seating-collision'
import { SeatingMiniMap } from './seating-mini-map'
import { SeatingToolbar } from './seating-toolbar'
import { SEATING_UNSAVED_CHANGES_MESSAGE } from './seating-unsaved-guard'
import { TableCard } from './table-card'
import { TableFormModal } from './table-form-modal'
import { UnassignedPanel } from './unassigned-panel'
import { useSeatingState } from './use-seating-state'

import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'

interface Props {
  eventId: string
  eventIdentifier?: string
  /** Called with true while the plan has unsaved changes, so the page can confirm before leaving the tab. */
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
}

const STALE_PLAN_MESSAGE =
  'El plano cambió mientras lo editabas (se eliminaron invitados o mesas). Quitamos esos cambios del borrador; revisa y vuelve a guardar.'

// One toast id for every "the plan changed" notice so a server refusal and the reconcile never stack.
const STALE_PLAN_TOAST_ID = 'seating-plan-stale'

function readServerMessage(error: unknown): string {
  const data = (error as { response?: { data?: { message?: unknown } } })?.response?.data
  return typeof data?.message === 'string' ? data.message.trim() : ''
}

function httpStatusOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const record = error as { status?: unknown; response?: { status?: unknown } }
  const status = record.response?.status ?? record.status
  return typeof status === 'number' ? status : null
}

interface SeatingWorkspace {
  tables: Table[]
  guests: Guest[]
}

export function SeatingPlanV2({ eventId, onUnsavedChangesChange }: Props) {
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const highlightedTableRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      highlightedTableRef.current?.classList.remove('ring-2', 'ring-violet-400', 'ring-offset-2', 'ring-offset-canvas')
    }
  }, [])
  // ─── Data fetching ──────────────────────────────────────────────────
  const {
    data: workspace,
    isLoading: workspaceLoading,
    isValidating: workspaceValidating,
    error: workspaceError,
    mutate: mutateWorkspace,
  } = useSWR<SeatingWorkspace>(eventSeatingWorkspacePath(eventId), fetcher, responsiveListSwrOptions)
  const serverTables = useMemo(() => workspace?.tables ?? [], [workspace?.tables])
  const guests = useMemo(() => workspace?.guests ?? [], [workspace?.guests])
  const guestByID = useMemo(() => new Map(guests.map((guest) => [guest.id, guest])), [guests])
  const workspaceErrorState = getDataErrorState(workspaceError, workspace)
  const workspaceFatalError = workspaceErrorState === 'fatal'
  const workspaceStaleError = workspaceErrorState === 'stale'
  const workspaceRetrying = workspaceValidating

  // ─── Local state ────────────────────────────────────────────────────
  const seating = useSeatingState(serverTables, guests)
  const [saving, setSaving] = useState(false)
  const [tableModal, setTableModal] = useState<{ open: boolean; table: Table | null }>({
    open: false,
    table: null,
  })
  const [bottomSheet, setBottomSheet] = useState<{ open: boolean; guest: Guest | null }>({
    open: false,
    guest: null,
  })
  const [activeDragGuest, setActiveDragGuest] = useState<Guest | null>(null)
  const [unassignedOpen, setUnassignedOpen] = useState(false)
  const [miniMapOpen, setMiniMapOpen] = useState(true)
  const [overCapacityTableIds, setOverCapacityTableIds] = useState<Set<string>>(() => new Set())
  const tableRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // ─── Keyboard undo/redo (GST-54) ────────────────────────────────────
  const { undo: undoSeating, redo: redoSeating } = seating
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoSeating()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        redoSeating()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undoSeating, redoSeating])

  // ─── Unsaved changes guard (SEAT-5) ─────────────────────────────────
  const hasUnsavedChanges = seating.pendingChangeCount > 0
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])
  useEffect(() => () => onUnsavedChangesChange?.(false), [onUnsavedChangesChange])
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = SEATING_UNSAVED_CHANGES_MESSAGE
      return SEATING_UNSAVED_CHANGES_MESSAGE
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  // A server capacity refusal stays highlighted until the draft changes again.
  useEffect(() => {
    setOverCapacityTableIds((current) => (current.size > 0 ? new Set() : current))
  }, [seating.state.assignments, seating.state.updatedTables, seating.state.createdTables])

  // ─── Stale draft notice (SEAT-4) ────────────────────────────────────
  useEffect(() => {
    if (seating.lastReconciledCount > 0) toast.warning(STALE_PLAN_MESSAGE, { id: STALE_PLAN_TOAST_ID })
  }, [seating.lastReconciledCount])

  // ─── Derived data ───────────────────────────────────────────────────
  const { tableGuests, unassignedGuests, declinedUnassignedCount, tableOccupancy } = useMemo(() => {
    const map = new Map<string, Guest[]>()
    const unassigned: Guest[] = []
    let declinedUnassigned = 0
    const occupancy = new Map<string, number>()

    for (const table of seating.tables) {
      map.set(table.id, [])
      occupancy.set(table.id, 0)
    }

    for (const guest of guests) {
      const assignedTableId = seating.guestTableMap.get(guest.id)
      if (assignedTableId && map.has(assignedTableId)) {
        map.get(assignedTableId)!.push(guest)
        occupancy.set(assignedTableId, (occupancy.get(assignedTableId) ?? 0) + getGuestPartySize(guest))
      } else if (isSeatable(guest)) {
        // Guest is unassigned OR assigned to a deleted table
        unassigned.push(guest)
      } else {
        // Declined guests need no seat; they are counted apart instead of "sin mesa" (SEAT-6).
        declinedUnassigned++
      }
    }

    return {
      tableGuests: map,
      unassignedGuests: unassigned,
      declinedUnassignedCount: declinedUnassigned,
      tableOccupancy: occupancy,
    }
  }, [guests, seating.tables, seating.guestTableMap])

  const tableByID = useMemo(() => new Map(seating.tables.map((table) => [table.id, table])), [seating.tables])

  const totalSeated = useMemo(
    () => Array.from(tableOccupancy.values()).reduce((sum, n) => sum + n, 0),
    [tableOccupancy]
  )
  const totalCapacity = useMemo(() => seating.tables.reduce((sum, t) => sum + t.capacity, 0), [seating.tables])

  // ─── DnD sensors ────────────────────────────────────────────────────
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  // ─── DnD handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const guest = guestByID.get(String(event.active.id))
      setActiveDragGuest(guest ?? null)
    },
    [guestByID]
  )

  // Every move goes through the strict capacity rule (SEAT-1), on desktop and mobile alike.
  const assignWithinCapacity = useCallback(
    (guestId: string, tableId: string | null): boolean => {
      if (tableId === null) {
        seating.assignGuest(guestId, null)
        return true
      }
      const guest = guestByID.get(guestId)
      const table = tableByID.get(tableId)
      if (!guest || !table) return false
      const check = checkSeat(table, tableOccupancy, guest, seating.guestTableMap.get(guestId))
      if (!check.ok) {
        toast.error(seatRefusalMessage(table.name, check))
        return false
      }
      seating.assignGuest(guestId, tableId)
      return true
    },
    [guestByID, seating, tableByID, tableOccupancy]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragGuest(null)
      const { active, over } = event
      if (!over) return

      const guestId = active.id as string
      const overData = over.data.current

      if (overData?.type === 'table') {
        assignWithinCapacity(guestId, overData.tableId)
      } else if (overData?.type === 'unassigned') {
        assignWithinCapacity(guestId, null)
      } else if (overData?.type === 'guest') {
        const targetGuest = overData.guest as Guest
        const targetTableId = seating.guestTableMap.get(targetGuest.id)
        if (targetTableId) {
          assignWithinCapacity(guestId, targetTableId)
        }
      }
    },
    [assignWithinCapacity, seating]
  )

  // ─── Table CRUD ─────────────────────────────────────────────────────
  const handleTableSubmit = useCallback(
    (values: { name: string; capacity: number }) => {
      if (tableModal.table) {
        seating.updateTable(tableModal.table.id, values)
      } else {
        const tempId = `temp-${Date.now()}`
        seating.createTable({
          id: tempId,
          event_id: eventId,
          name: values.name,
          capacity: values.capacity,
          sort_order: seating.tables.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    },
    [tableModal.table, seating, eventId]
  )

  // ─── Batch save ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const updated = Array.from(seating.state.updatedTables.keys()).flatMap((tableId) => {
        const table = seating.tables.find((candidate) => candidate.id === tableId)
        return table ? [{ id: table.id, name: table.name, capacity: table.capacity, sort_order: table.sort_order }] : []
      })
      const res = await api.put(eventTablesPlanPath(eventId), {
        created: seating.state.createdTables.map((table) => ({
          temp_id: table.id,
          name: table.name,
          capacity: table.capacity,
          sort_order: table.sort_order,
        })),
        updated,
        deleted_ids: Array.from(seating.state.deletedTableIds),
        assignments: Array.from(seating.state.assignments, ([guestId, tableId]) => ({
          guest_id: guestId,
          table_id: tableId,
        })),
      })

      const savedWorkspace = readApiData<SeatingWorkspace | null>(res.data)
      if (savedWorkspace && Array.isArray(savedWorkspace.tables) && Array.isArray(savedWorkspace.guests)) {
        await mutateWorkspace(savedWorkspace, { revalidate: false })
        seating.reset()
      } else {
        seating.reset()
        void mutateWorkspace()
      }
      setOverCapacityTableIds(new Set())
      toast.success('Cambios guardados')
    } catch (err) {
      const overCapacity = readTableOverCapacityError(err)
      if (overCapacity) {
        // Strict capacity on the server (SEAT-1): show its Spanish message and highlight the tables it refused.
        const ids = new Set([...overCapacity.tableIds, ...overCapacity.tables.map((table) => table.tableId)])
        const detail =
          overCapacity.tables.length > 0
            ? overCapacity.tables
                .map((table) => {
                  const name = tableByID.get(table.tableId)?.name || table.name || 'Mesa'
                  return `«${name}» (${table.seats} de ${table.capacity} lugares)`
                })
                .join(', ')
            : Array.from(ids)
                .flatMap((id) => {
                  const table = tableByID.get(id)
                  return table ? [`«${table.name}»`] : []
                })
                .join(', ')
        setOverCapacityTableIds(ids)
        toast.error(
          readServerMessage(err)
            ? `${overCapacity.message} Mueve invitados o aumenta la capacidad.`
            : detail
              ? `No se guardó: no hay lugar suficiente en ${detail}. Mueve invitados o aumenta la capacidad.`
              : overCapacity.message
        )
        const first = Array.from(ids).find((id) => tableRefs.current.has(id))
        if (first) tableRefs.current.get(first)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      const stalePlan = readSeatingPlanStaleError(err)
      if (stalePlan) {
        // The server says a guest or table of the draft left the event (SEAT-4): reload the workspace,
        // which reconciles the draft, and show the server's Spanish message once.
        await mutateWorkspace().catch(() => undefined)
        toast.warning(stalePlan.message, { id: STALE_PLAN_TOAST_ID })
        return
      }
      const status = httpStatusOf(err)
      if (status !== null && status >= 400 && status < 500 && status !== 401 && status !== 403) {
        // Older backends refuse a stale draft with a plain 4xx instead of seating_plan_stale: refresh the
        // workspace so the draft is reconciled; the reconcile notice explains what was dropped (SEAT-4).
        const fresh = await mutateWorkspace().catch(() => undefined)
        const freshGuestIds = new Set((fresh?.guests ?? []).map((guest) => guest.id))
        const freshTableIds = new Set([
          ...(fresh?.tables ?? []).map((table) => table.id),
          ...seating.state.createdTables.map((table) => table.id),
        ])
        const stale =
          fresh !== undefined &&
          (Array.from(seating.state.assignments).some(
            ([guestId, tableId]) => !freshGuestIds.has(guestId) || (tableId !== null && !freshTableIds.has(tableId))
          ) ||
            Array.from(seating.state.updatedTables.keys()).some((id) => !freshTableIds.has(id)) ||
            Array.from(seating.state.deletedTableIds).some((id) => !freshTableIds.has(id)))
        if (stale) return
      }
      toast.error(getApiErrorMessage(err, 'Error al guardar cambios'))
    } finally {
      setSaving(false)
    }
  }, [seating, eventId, mutateWorkspace, tableByID])

  const handleAutoAssign = useCallback(() => {
    // Local mutable copy so mid-loop assignments reflect immediately
    const localOccupancy = new Map(tableOccupancy)
    // Only seatable guests are candidates: declined guests are never auto-seated (SEAT-6).
    const unassigned = unassignedGuests.filter(isSeatable).sort((a, b) => getGuestPartySize(b) - getGuestPartySize(a))
    for (const guest of unassigned) {
      const partySize = getGuestPartySize(guest)
      let bestTable: { id: string; remaining: number } | null = null
      for (const table of seating.tables) {
        const seated = localOccupancy.get(table.id) ?? 0
        const remaining = table.capacity - seated
        if (remaining >= partySize) {
          if (!bestTable || remaining > bestTable.remaining) {
            bestTable = { id: table.id, remaining }
          }
        }
      }
      if (bestTable) {
        seating.assignGuest(guest.id, bestTable.id)
        localOccupancy.set(bestTable.id, (localOccupancy.get(bestTable.id) ?? 0) + partySize)
      }
    }
  }, [unassignedGuests, seating, tableOccupancy])

  const handleMiniMapTableClick = useCallback((tableId: string) => {
    const el = tableRefs.current.get(tableId)
    if (el) {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      highlightedTableRef.current?.classList.remove('ring-2', 'ring-violet-400', 'ring-offset-2', 'ring-offset-canvas')
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-violet-400', 'ring-offset-2', 'ring-offset-canvas')
      highlightedTableRef.current = el
      highlightTimerRef.current = setTimeout(() => {
        el.classList.remove('ring-2', 'ring-violet-400', 'ring-offset-2', 'ring-offset-canvas')
        highlightedTableRef.current = null
        highlightTimerRef.current = null
      }, 1500)
    }
  }, [])

  const handlePrint = useCallback(() => window.print(), [])

  // ─── Loading state ──────────────────────────────────────────────────
  if (workspaceLoading && workspace === undefined) {
    return (
      <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-48 rounded-xl bg-surface-raised/50" />
        ))}
      </div>
    )
  }

  if (workspaceFatalError) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-12 text-center">
        <RectangleGroupIcon className="mx-auto size-10 text-amber-500/60" />
        <p className="mt-4 text-sm font-semibold text-amber-100">No pudimos preparar el plano de asientos.</p>
        <button
          type="button"
          onClick={() => void mutateWorkspace()}
          disabled={workspaceRetrying}
          aria-busy={workspaceRetrying}
          className="mt-4 text-xs font-semibold text-amber-300 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {workspaceRetrying ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    )
  }

  if (guests.length === 0) {
    return (
      <EmptyState
        icon={RectangleGroupIcon}
        title="Sin invitados"
        description="Agrega invitados para comenzar a organizar las mesas."
      />
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={seatingCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {workspaceStaleError && (
          <StaleDataNotice
            label="el plano de asientos"
            onRetry={() => void mutateWorkspace()}
            retrying={workspaceRetrying}
          />
        )}

        <SeatingToolbar
          pendingCount={seating.pendingChangeCount}
          canUndo={seating.canUndo}
          canRedo={seating.canRedo}
          saving={saving}
          canAutoAssign={unassignedGuests.length > 0 && seating.tables.length > 0}
          onCreateTable={() => setTableModal({ open: true, table: null })}
          onSave={handleSave}
          onDiscard={() => {
            seating.reset()
            setOverCapacityTableIds(new Set())
          }}
          onUndo={seating.undo}
          onRedo={seating.redo}
          onAutoAssign={handleAutoAssign}
          onPrint={handlePrint}
          totalSeated={totalSeated}
          totalCapacity={totalCapacity}
          unassignedCount={unassignedGuests.length}
          tableCount={seating.tables.length}
        />

        <SeatingMiniMap
          tables={seating.tables}
          occupancy={tableOccupancy}
          isOpen={miniMapOpen}
          onToggle={() => setMiniMapOpen((v) => !v)}
          onTableClick={handleMiniMapTableClick}
        />

        {/* Main layout */}
        <div className="flex flex-col gap-4 pb-16 md:flex-row md:pb-0">
          {unassignedGuests.length > 0 && (
            <div className="w-full md:sticky md:top-4 md:max-h-[calc(100vh-8rem)] md:w-72 md:flex-shrink-0 md:self-start">
              {/* Collapsible header on mobile */}
              <button
                type="button"
                onClick={() => setUnassignedOpen(!unassignedOpen)}
                className="mb-2 flex w-full items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 md:hidden"
              >
                <span className="text-sm font-medium text-amber-300">Sin mesa ({unassignedGuests.length})</span>
                <ChevronDownIcon
                  className={`size-5 text-amber-400 transition-transform ${unassignedOpen ? 'rotate-180' : ''}`}
                />
              </button>
              <div className={`${unassignedOpen ? 'block' : 'hidden'} md:block`}>
                <UnassignedPanel
                  guests={unassignedGuests}
                  onMobileAssign={(guest) => setBottomSheet({ open: true, guest })}
                />
                {declinedUnassignedCount > 0 && (
                  <p className="mt-2 px-1 text-xs text-ink-muted">
                    {declinedUnassignedCount === 1
                      ? '1 invitado declinó la invitación y no necesita mesa.'
                      : `${declinedUnassignedCount} invitados declinaron la invitación y no necesitan mesa.`}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex-1">
            {seating.tables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <RectangleGroupIcon className="mb-3 size-12 text-ink-muted" />
                <p className="text-sm text-ink-muted">No hay mesas creadas aun</p>
                <p className="mt-1 text-xs text-ink-muted">Crea tu primera mesa para comenzar a organizar invitados</p>
              </div>
            ) : (
              // Columns follow the space left by the "Sin mesa" panel, not the viewport, so cards
              // never shrink to a few characters of the table name (GST-64).
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
                {seating.tables.map((table, i) => (
                  <div
                    key={table.id}
                    ref={(el) => {
                      if (el) tableRefs.current.set(table.id, el)
                      else tableRefs.current.delete(table.id)
                    }}
                    className="transition-all duration-300"
                  >
                    <TableCard
                      table={table}
                      guests={tableGuests.get(table.id) ?? []}
                      onEdit={(t) => setTableModal({ open: true, table: t })}
                      onDelete={(id) => seating.deleteTable(id)}
                      onMobileAssign={(guest) => setBottomSheet({ open: true, guest })}
                      index={i}
                      overCapacity={
                        overCapacityTableIds.has(table.id) || (tableOccupancy.get(table.id) ?? 0) > table.capacity
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The overlay is position:fixed; render it in <body> so a transformed ancestor (the page
          transition wrapper) cannot become its containing block and shift the preview and the
          drop target away from the cursor (GST-61). */}
      {typeof document !== 'undefined' &&
        createPortal(
          <DragOverlay>
            {activeDragGuest && (
              <div className="pointer-events-none rounded-lg bg-surface shadow-lg shadow-black/20">
                <GuestChip guest={activeDragGuest} isDraggable={false} />
              </div>
            )}
          </DragOverlay>,
          document.body
        )}

      <TableFormModal
        isOpen={tableModal.open}
        onClose={() => setTableModal({ open: false, table: null })}
        onSubmit={handleTableSubmit}
        table={tableModal.table}
        minCapacity={tableModal.table ? (tableOccupancy.get(tableModal.table.id) ?? 0) : 0}
      />

      <AssignBottomSheet
        isOpen={bottomSheet.open}
        onClose={() => setBottomSheet({ open: false, guest: null })}
        guest={bottomSheet.guest}
        currentTableId={bottomSheet.guest ? (seating.guestTableMap.get(bottomSheet.guest.id) ?? null) : null}
        tables={seating.tables}
        tableOccupancy={tableOccupancy}
        onAssign={assignWithinCapacity}
        onCreateTable={() => {
          setBottomSheet({ open: false, guest: null })
          setTableModal({ open: true, table: null })
        }}
      />
    </DndContext>
  )
}
