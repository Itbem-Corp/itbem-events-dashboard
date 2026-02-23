'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/empty-state'
import { RectangleGroupIcon } from '@heroicons/react/20/solid'

import { useSeatingState } from './use-seating-state'
import { TableCard } from './table-card'
import { UnassignedPanel } from './unassigned-panel'
import { TableFormModal } from './table-form-modal'
import { AssignBottomSheet } from './assign-bottom-sheet'
import { SeatingToolbar } from './seating-toolbar'
import { GuestChip } from './guest-chip'

import type { Table } from '@/models/Table'
import type { Guest } from '@/models/Guest'

interface Props {
  eventId: string
  eventIdentifier: string
}

export function SeatingPlanV2({ eventId, eventIdentifier }: Props) {
  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: serverTables = [], mutate: mutateTables } = useSWR<Table[]>(
    `/events/${eventId}/tables`,
    fetcher,
  )
  const { data: rawGuests, isLoading: guestsLoading, mutate: mutateGuests } = useSWR<Guest[] | { data: Guest[] }>(
    `/guests/${eventIdentifier}`,
    fetcher,
  )
  const guests: Guest[] = Array.isArray(rawGuests) ? rawGuests : Array.isArray(rawGuests?.data) ? rawGuests.data : []

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
        occupancy.set(
          assignedTableId,
          (occupancy.get(assignedTableId) ?? 0) + (guest.guests_count ?? 1),
        )
      } else {
        // Guest is unassigned OR assigned to a deleted table
        unassigned.push(guest)
      }
    }

    return { tableGuests: map, unassignedGuests: unassigned, tableOccupancy: occupancy }
  }, [guests, seating.tables, seating.guestTableMap])

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
      const guest = guests.find((g) => g.id === event.active.id)
      setActiveDragGuest(guest ?? null)
    },
    [guests],
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
    [seating],
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
    [tableModal.table, seating, eventId],
  )

  // ─── Batch save ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // 1. Create new tables
      const tableIdMap = new Map<string, string>()
      for (const table of seating.state.createdTables) {
        const res = await api.post(`/events/${eventId}/tables`, {
          name: table.name,
          capacity: table.capacity,
          sort_order: table.sort_order,
        })
        tableIdMap.set(table.id, res.data?.data?.id ?? res.data?.id)
      }

      // 2. Update existing tables
      for (const [tableId, changes] of seating.state.updatedTables) {
        await api.put(`/tables/${tableId}`, changes)
      }

      // 3. Batch assign guests (before deleting tables so FKs are cleared first)
      const assignments: { guest_id: string; table_id: string | null }[] = []
      for (const [guestId, tableId] of seating.state.assignments) {
        const resolvedTableId = tableId ? (tableIdMap.get(tableId) ?? tableId) : null
        assignments.push({ guest_id: guestId, table_id: resolvedTableId })
      }
      if (assignments.length > 0) {
        await api.put(`/events/${eventId}/tables/assign`, { assignments })
      }

      // 4. Delete tables (after unassigning guests)
      for (const tableId of seating.state.deletedTableIds) {
        await api.delete(`/tables/${tableId}`)
      }

      // 5. Reset and revalidate
      seating.reset()
      await Promise.all([mutateTables(), mutateGuests()])
      toast.success('Cambios guardados')
    } catch {
      toast.error('Error al guardar cambios')
    } finally {
      setSaving(false)
    }
  }, [seating, eventId, mutateTables, mutateGuests])

  // ─── Loading state ──────────────────────────────────────────────────
  if (guestsLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-48 bg-zinc-800/50 rounded-xl" />
        ))}
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
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <SeatingToolbar
          pendingCount={seating.pendingChangeCount}
          canUndo={seating.canUndo}
          saving={saving}
          onCreateTable={() => setTableModal({ open: true, table: null })}
          onSave={handleSave}
          onDiscard={seating.reset}
          onUndo={seating.undo}
        />

        {/* Summary stats */}
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2">
            <span className="text-zinc-500">Mesas</span>{' '}
            <span className="font-bold text-zinc-200">{seating.tables.length}</span>
          </div>
          <div className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2">
            <span className="text-zinc-500">Con mesa</span>{' '}
            <span className="font-bold text-zinc-200">
              {guests.length - unassignedGuests.length}
            </span>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <span className="text-amber-400">Sin mesa</span>{' '}
            <span className="font-bold text-amber-300">{unassignedGuests.length}</span>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-col md:flex-row gap-4">
          {unassignedGuests.length > 0 && (
            <div className="w-full md:w-72 md:flex-shrink-0 md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-8rem)]">
              <UnassignedPanel
                guests={unassignedGuests}
                onMobileAssign={(guest) =>
                  setBottomSheet({ open: true, guest })
                }
              />
            </div>
          )}

          <div className="flex-1">
            {seating.tables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <RectangleGroupIcon className="size-12 text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-500">No hay mesas creadas aun</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Crea tu primera mesa para comenzar a organizar invitados
                </p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {seating.tables.map((table, i) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    guests={tableGuests.get(table.id) ?? []}
                    onEdit={(t) => setTableModal({ open: true, table: t })}
                    onDelete={(id) => seating.deleteTable(id)}
                    onMobileAssign={(guest) =>
                      setBottomSheet({ open: true, guest })
                    }
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDragGuest && (
          <div className="opacity-80 pointer-events-none">
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
