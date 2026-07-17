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
import { toast } from 'sonner'
import useSWR from 'swr'

import { AssignBottomSheet } from './assign-bottom-sheet'
import { GuestChip } from './guest-chip'
import { SeatingMiniMap } from './seating-mini-map'
import { SeatingToolbar } from './seating-toolbar'
import { TableCard } from './table-card'
import { TableFormModal } from './table-form-modal'
import { UnassignedPanel } from './unassigned-panel'
import { useSeatingState } from './use-seating-state'

import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'

interface Props {
  eventId: string
  eventIdentifier?: string
}

interface SeatingWorkspace {
  tables: Table[]
  guests: Guest[]
}

export function SeatingPlanV2({ eventId }: Props) {
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const highlightedTableRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      highlightedTableRef.current?.classList.remove(
        'ring-2',
        'ring-violet-400',
        'ring-offset-2',
        'ring-offset-canvas'
      )
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
  const tableRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // ─── Derived data ───────────────────────────────────────────────────
  const { tableGuests, unassignedGuests, tableOccupancy } = useMemo(() => {
    const map = new Map<string, Guest[]>()
    const unassigned: Guest[] = []
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
      } else {
        // Guest is unassigned OR assigned to a deleted table
        unassigned.push(guest)
      }
    }

    return { tableGuests: map, unassignedGuests: unassigned, tableOccupancy: occupancy }
  }, [guests, seating.tables, seating.guestTableMap])

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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragGuest(null)
      const { active, over } = event
      if (!over) return

      const guestId = active.id as string
      const overData = over.data.current

      if (overData?.type === 'table') {
        seating.assignGuest(guestId, overData.tableId)
      } else if (overData?.type === 'unassigned') {
        seating.assignGuest(guestId, null)
      } else if (overData?.type === 'guest') {
        const targetGuest = overData.guest as Guest
        const targetTableId = seating.guestTableMap.get(targetGuest.id)
        if (targetTableId) {
          seating.assignGuest(guestId, targetTableId)
        }
      }
    },
    [seating]
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
      toast.success('Cambios guardados')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Error al guardar cambios'))
    } finally {
      setSaving(false)
    }
  }, [seating, eventId, mutateWorkspace])

  const handleAutoAssign = useCallback(() => {
    // Local mutable copy so mid-loop assignments reflect immediately
    const localOccupancy = new Map(tableOccupancy)
    const unassigned = [...unassignedGuests].sort((a, b) => getGuestPartySize(b) - getGuestPartySize(a))
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
      highlightedTableRef.current?.classList.remove(
        'ring-2',
        'ring-violet-400',
        'ring-offset-2',
        'ring-offset-canvas'
      )
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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
          saving={saving}
          canAutoAssign={unassignedGuests.length > 0 && seating.tables.length > 0}
          onCreateTable={() => setTableModal({ open: true, table: null })}
          onSave={handleSave}
          onDiscard={seating.reset}
          onUndo={seating.undo}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDragGuest && (
          <div className="pointer-events-none opacity-80">
            <GuestChip guest={activeDragGuest} isDraggable={false} />
          </div>
        )}
      </DragOverlay>

      <TableFormModal
        isOpen={tableModal.open}
        onClose={() => setTableModal({ open: false, table: null })}
        onSubmit={handleTableSubmit}
        table={tableModal.table}
      />

      <AssignBottomSheet
        isOpen={bottomSheet.open}
        onClose={() => setBottomSheet({ open: false, guest: null })}
        guest={bottomSheet.guest}
        currentTableId={bottomSheet.guest ? (seating.guestTableMap.get(bottomSheet.guest.id) ?? null) : null}
        tables={seating.tables}
        tableOccupancy={tableOccupancy}
        onAssign={seating.assignGuest}
        onCreateTable={() => {
          setBottomSheet({ open: false, guest: null })
          setTableModal({ open: true, table: null })
        }}
      />
    </DndContext>
  )
}
