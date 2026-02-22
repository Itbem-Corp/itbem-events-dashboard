# Seating Plan v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current inline-edit seating plan with an interactive drag-and-drop grid that supports table CRUD, capacity tracking, batch save, and mobile-optimized assignment via bottom sheet.

**Architecture:** New `Table` model + CRUD endpoints in backend. Frontend uses dnd-kit for drag-and-drop on desktop/tablet, Framer Motion bottom sheet on mobile. All assignment changes are local-only until the user clicks "Guardar" (batch save). Components split into `src/components/events/seating/` directory.

**Tech Stack:** dnd-kit (drag-and-drop), Framer Motion (animations + bottom sheet), SWR (data fetching), existing ProgressRing component, Zustand-free local state (useReducer).

---

## Task 1: Install dnd-kit and create Table model

**Files:**
- Create: `src/models/Table.ts`
- Modify: `src/models/Guest.ts:35` (add `table_id`)
- Modify: `package.json` (add dnd-kit deps)

**Step 1: Install dnd-kit**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `package.json` dependencies

**Step 2: Create Table model**

Create `src/models/Table.ts`:
```typescript
import { BaseEntity } from './BaseEntity'

export interface Table extends BaseEntity {
  event_id: string
  name: string
  capacity: number
  sort_order: number
}
```

**Step 3: Add table_id to Guest model**

In `src/models/Guest.ts`, add after line 35 (`table_number?: string;`):
```typescript
  table_id?: string | null;
```

Keep `table_number` for backwards compatibility during migration.

**Step 4: Commit**

```bash
git add src/models/Table.ts src/models/Guest.ts package.json package-lock.json
git commit -m "feat(seating): add Table model and dnd-kit dependencies"
```

---

## Task 2: Create the seating state reducer (useSeatingState hook)

**Files:**
- Create: `src/components/events/seating/use-seating-state.ts`

This hook manages all local state: pending assignments, table CRUD, undo stack. Zero API calls — pure state management.

**Step 1: Create the hook**

Create `src/components/events/seating/use-seating-state.ts`:
```typescript
import { useReducer, useCallback, useMemo } from 'react'
import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SeatingState {
  /** guest_id → table_id (null = unassign) */
  assignments: Map<string, string | null>
  createdTables: Table[]
  updatedTables: Map<string, Partial<Table>>
  deletedTableIds: Set<string>
  undoStack: SeatingAction[]
}

type SeatingAction =
  | { type: 'ASSIGN_GUEST'; guestId: string; tableId: string | null; prevTableId: string | null }
  | { type: 'CREATE_TABLE'; table: Table }
  | { type: 'UPDATE_TABLE'; tableId: string; changes: Partial<Table>; prev: Partial<Table> }
  | { type: 'DELETE_TABLE'; tableId: string }
  | { type: 'UNDO' }
  | { type: 'RESET' }

function reducer(state: SeatingState, action: SeatingAction): SeatingState {
  switch (action.type) {
    case 'ASSIGN_GUEST': {
      const next = new Map(state.assignments)
      if (action.tableId === action.prevTableId) {
        next.delete(action.guestId)
      } else {
        next.set(action.guestId, action.tableId)
      }
      return {
        ...state,
        assignments: next,
        undoStack: [...state.undoStack, action],
      }
    }
    case 'CREATE_TABLE':
      return {
        ...state,
        createdTables: [...state.createdTables, action.table],
        undoStack: [...state.undoStack, action],
      }
    case 'UPDATE_TABLE': {
      const next = new Map(state.updatedTables)
      next.set(action.tableId, { ...next.get(action.tableId), ...action.changes })
      return {
        ...state,
        updatedTables: next,
        undoStack: [...state.undoStack, action],
      }
    }
    case 'DELETE_TABLE': {
      const next = new Set(state.deletedTableIds)
      next.add(action.tableId)
      // Also unassign all guests from this table
      return {
        ...state,
        deletedTableIds: next,
        undoStack: [...state.undoStack, action],
      }
    }
    case 'UNDO': {
      if (state.undoStack.length === 0) return state
      const stack = [...state.undoStack]
      const last = stack.pop()!
      const base = { ...state, undoStack: stack }

      if (last.type === 'ASSIGN_GUEST') {
        const next = new Map(state.assignments)
        if (last.prevTableId === (last as any)._originalPrevTableId) {
          next.delete(last.guestId)
        } else {
          next.set(last.guestId, last.prevTableId)
        }
        return { ...base, assignments: next }
      }
      if (last.type === 'CREATE_TABLE') {
        return {
          ...base,
          createdTables: state.createdTables.filter((t) => t.id !== last.table.id),
        }
      }
      if (last.type === 'UPDATE_TABLE') {
        const next = new Map(state.updatedTables)
        next.set(last.tableId, last.prev)
        return { ...base, updatedTables: next }
      }
      if (last.type === 'DELETE_TABLE') {
        const next = new Set(state.deletedTableIds)
        next.delete(last.tableId)
        return { ...base, deletedTableIds: next }
      }
      return state
    }
    case 'RESET':
      return initialState()
    default:
      return state
  }
}

function initialState(): SeatingState {
  return {
    assignments: new Map(),
    createdTables: [],
    updatedTables: new Map(),
    deletedTableIds: new Set(),
    undoStack: [],
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSeatingState(serverTables: Table[], serverGuests: Guest[]) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  const assignGuest = useCallback(
    (guestId: string, tableId: string | null) => {
      const guest = serverGuests.find((g) => g.id === guestId)
      const prevTableId = state.assignments.has(guestId)
        ? state.assignments.get(guestId)!
        : guest?.table_id ?? null
      dispatch({ type: 'ASSIGN_GUEST', guestId, tableId, prevTableId })
    },
    [serverGuests, state.assignments],
  )

  const createTable = useCallback((table: Table) => {
    dispatch({ type: 'CREATE_TABLE', table })
  }, [])

  const updateTable = useCallback(
    (tableId: string, changes: Partial<Table>) => {
      const existing = serverTables.find((t) => t.id === tableId)
      const prev: Partial<Table> = {}
      for (const key of Object.keys(changes) as (keyof Table)[]) {
        prev[key] = existing?.[key] as any
      }
      dispatch({ type: 'UPDATE_TABLE', tableId, changes, prev })
    },
    [serverTables],
  )

  const deleteTable = useCallback((tableId: string) => {
    dispatch({ type: 'DELETE_TABLE', tableId })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  // ─── Derived: merge server state + pending changes ───────────────────

  const tables = useMemo(() => {
    const merged = serverTables
      .filter((t) => !state.deletedTableIds.has(t.id))
      .map((t) => {
        const updates = state.updatedTables.get(t.id)
        return updates ? { ...t, ...updates } : t
      })
    return [...merged, ...state.createdTables].sort((a, b) => a.sort_order - b.sort_order)
  }, [serverTables, state.createdTables, state.updatedTables, state.deletedTableIds])

  const guestTableMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const guest of serverGuests) {
      map.set(guest.id, guest.table_id ?? null)
    }
    for (const [guestId, tableId] of state.assignments) {
      map.set(guestId, tableId)
    }
    return map
  }, [serverGuests, state.assignments])

  const pendingChangeCount =
    state.assignments.size +
    state.createdTables.length +
    state.updatedTables.size +
    state.deletedTableIds.size

  const canUndo = state.undoStack.length > 0

  return {
    tables,
    guestTableMap,
    pendingChangeCount,
    canUndo,
    state,
    assignGuest,
    createTable,
    updateTable,
    deleteTable,
    undo,
    reset,
  }
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/use-seating-state.ts
git commit -m "feat(seating): add useSeatingState reducer hook for local batch state"
```

---

## Task 3: Create the CapacityRing component

**Files:**
- Create: `src/components/events/seating/capacity-ring.tsx`

Small SVG ring showing `current/capacity` with color coding.

**Step 1: Create the component**

Create `src/components/events/seating/capacity-ring.tsx`:
```typescript
'use client'

import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { useEffect } from 'react'

interface CapacityRingProps {
  current: number
  capacity: number
  size?: number
}

export function CapacityRing({ current, capacity, size = 44 }: CapacityRingProps) {
  const pct = capacity > 0 ? Math.min(100, (current / capacity) * 100) : 0
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const progress = useMotionValue(0)
  const strokeDashoffset = useTransform(
    progress,
    (v) => circumference - (v / 100) * circumference,
  )

  useEffect(() => {
    const ctrl = animate(progress, pct, { duration: 0.6, ease: 'easeOut' })
    return () => ctrl.stop()
  }, [pct, progress])

  const color =
    pct >= 100 ? '#ef4444'   // red — full
    : pct >= 75 ? '#f59e0b'  // amber — almost full
    : '#6366f1'              // indigo — normal

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          className="text-zinc-800"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ strokeDasharray: circumference, strokeDashoffset }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-zinc-300 tabular-nums">
          {current}/{capacity}
        </span>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/capacity-ring.tsx
git commit -m "feat(seating): add CapacityRing SVG component"
```

---

## Task 4: Create GuestChip (draggable guest element)

**Files:**
- Create: `src/components/events/seating/guest-chip.tsx`

**Step 1: Create the component**

Create `src/components/events/seating/guest-chip.tsx`:
```typescript
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GuestStatusBadge } from '@/components/guests/guest-status-badge'
import { ArrowsRightLeftIcon } from '@heroicons/react/16/solid'
import type { Guest } from '@/models/Guest'

interface GuestChipProps {
  guest: Guest
  /** Show "Mover" button (mobile only — triggers bottom sheet) */
  onMobileTap?: (guest: Guest) => void
  isDraggable?: boolean
}

export function GuestChip({ guest, onMobileTap, isDraggable = true }: GuestChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: guest.id,
    data: { type: 'guest', guest },
    disabled: !isDraggable,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const isConfirmed = guest.status?.code === 'CONFIRMED'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
        'cursor-grab active:cursor-grabbing touch-none',
        isDragging ? 'z-50 shadow-lg shadow-indigo-500/20' : '',
        isConfirmed ? 'border-lime-500/20 bg-lime-500/5' : 'border-white/10 bg-zinc-900/50',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-zinc-200 truncate">
          {guest.first_name} {guest.last_name}
        </span>
        {guest.guests_count > 1 && (
          <span className="text-zinc-600 flex-shrink-0">+{guest.guests_count - 1}</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <GuestStatusBadge status={guest.status} />
        {onMobileTap && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMobileTap(guest)
            }}
            className="md:hidden rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            aria-label="Mover invitado"
          >
            <ArrowsRightLeftIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/guest-chip.tsx
git commit -m "feat(seating): add draggable GuestChip component"
```

---

## Task 5: Create TableCard (droppable table with capacity ring)

**Files:**
- Create: `src/components/events/seating/table-card.tsx`

**Step 1: Create the component**

Create `src/components/events/seating/table-card.tsx`:
```typescript
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'motion/react'
import { useState } from 'react'
import {
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/16/solid'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CapacityRing } from './capacity-ring'
import { GuestChip } from './guest-chip'
import type { Table } from '@/models/Table'
import type { Guest } from '@/models/Guest'

interface TableCardProps {
  table: Table
  guests: Guest[]
  onEdit: (table: Table) => void
  onDelete: (tableId: string) => void
  onMobileAssign?: (guest: Guest) => void
  index: number
}

export function TableCard({
  table,
  guests,
  onEdit,
  onDelete,
  onMobileAssign,
  index,
}: TableCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `table-${table.id}`,
    data: { type: 'table', tableId: table.id },
  })

  const totalAttendees = guests.reduce((sum, g) => sum + (g.guests_count ?? 1), 0)
  const guestIds = guests.map((g) => g.id)

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={[
        'rounded-xl border overflow-hidden transition-colors duration-150',
        isOver
          ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
          : 'border-white/10 bg-zinc-900/30',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/50">
        <div className="flex items-center gap-3 min-w-0">
          <CapacityRing current={totalAttendees} capacity={table.capacity} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200 truncate">{table.name}</p>
            <p className="text-xs text-zinc-500">
              {guests.length} inv. · {totalAttendees} asist.
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
              <EllipsisVerticalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(table)}>
              <PencilIcon className="size-3.5 mr-2" />
              Editar mesa
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(table.id)}
            >
              <TrashIcon className="size-3.5 mr-2" />
              Eliminar mesa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Guests */}
      <SortableContext items={guestIds} strategy={verticalListSortingStrategy}>
        <div className="p-3 space-y-1.5 min-h-[60px]">
          {guests.length === 0 ? (
            <p className="text-xs text-zinc-700 text-center py-4">
              Arrastra invitados aquí
            </p>
          ) : (
            guests.map((g) => (
              <GuestChip key={g.id} guest={g} onMobileTap={onMobileAssign} />
            ))
          )}

          {/* Empty slot indicators */}
          {totalAttendees < table.capacity && guests.length > 0 && (
            <div className="flex gap-1 pt-1">
              {Array.from({ length: Math.min(table.capacity - totalAttendees, 5) }).map(
                (_, i) => (
                  <div
                    key={i}
                    className="size-2 rounded-full bg-zinc-800 border border-zinc-700"
                  />
                ),
              )}
              {table.capacity - totalAttendees > 5 && (
                <span className="text-[10px] text-zinc-700">
                  +{table.capacity - totalAttendees - 5}
                </span>
              )}
            </div>
          )}
        </div>
      </SortableContext>
    </motion.div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/table-card.tsx
git commit -m "feat(seating): add droppable TableCard component with capacity ring"
```

---

## Task 6: Create UnassignedPanel (sidebar with search)

**Files:**
- Create: `src/components/events/seating/unassigned-panel.tsx`

**Step 1: Create the component**

Create `src/components/events/seating/unassigned-panel.tsx`:
```typescript
'use client'

import { useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/20/solid'
import { GuestChip } from './guest-chip'
import type { Guest } from '@/models/Guest'

interface UnassignedPanelProps {
  guests: Guest[]
  onMobileAssign?: (guest: Guest) => void
}

export function UnassignedPanel({ guests, onMobileAssign }: UnassignedPanelProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return guests
    const q = search.toLowerCase()
    return guests.filter(
      (g) =>
        g.first_name.toLowerCase().includes(q) ||
        g.last_name.toLowerCase().includes(q) ||
        g.email?.toLowerCase().includes(q),
    )
  }, [guests, search])

  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned',
    data: { type: 'unassigned' },
  })

  const guestIds = filtered.map((g) => g.id)

  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-xl border overflow-hidden transition-colors duration-150 h-full flex flex-col',
        isOver
          ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
          : 'border-amber-500/20 bg-amber-500/5',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-amber-500/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ExclamationCircleIcon className="size-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Sin mesa</span>
          </div>
          <span className="text-xs font-medium text-amber-400 tabular-nums">
            {guests.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar invitado…"
            className="w-full rounded-lg border border-white/10 bg-zinc-900/50 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </div>
      </div>

      {/* List */}
      <SortableContext items={guestIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-4">
              {search ? 'Sin resultados' : 'Todos asignados'}
            </p>
          ) : (
            filtered.map((g) => (
              <GuestChip key={g.id} guest={g} onMobileTap={onMobileAssign} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/unassigned-panel.tsx
git commit -m "feat(seating): add UnassignedPanel with search and droppable zone"
```

---

## Task 7: Create TableFormModal (create/edit table)

**Files:**
- Create: `src/components/events/seating/table-form-modal.tsx`

**Step 1: Create the component**

Create `src/components/events/seating/table-form-modal.tsx`:
```typescript
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { Field, Label, ErrorMessage } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import type { Table } from '@/models/Table'

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  capacity: z.number().min(1, 'Mínimo 1').max(50, 'Máximo 50'),
})

type FormValues = z.infer<typeof schema>

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (values: FormValues) => void
  table?: Table | null
}

export function TableFormModal({ isOpen, onClose, onSubmit, table }: Props) {
  const isEdit = Boolean(table)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', capacity: 8 },
  })

  useEffect(() => {
    if (!isOpen) return
    if (table) {
      reset({ name: table.name, capacity: table.capacity })
    } else {
      reset({ name: '', capacity: 8 })
    }
  }, [isOpen, table, reset])

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{isEdit ? 'Editar mesa' : 'Nueva mesa'}</DialogTitle>
      <form
        onSubmit={handleSubmit((data) => {
          onSubmit(data)
          onClose()
        })}
      >
        <DialogBody className="space-y-4 py-4">
          <Field>
            <Label>Nombre de la mesa</Label>
            <Input {...register('name')} placeholder="Ej. Mesa 1, VIP, Familia" autoFocus />
            {errors.name && <ErrorMessage>{errors.name.message}</ErrorMessage>}
          </Field>
          <Field>
            <Label>Capacidad (asistentes)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              {...register('capacity', { valueAsNumber: true })}
            />
            {errors.capacity && <ErrorMessage>{errors.capacity.message}</ErrorMessage>}
          </Field>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">
            {isEdit ? 'Guardar cambios' : 'Crear mesa'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/table-form-modal.tsx
git commit -m "feat(seating): add TableFormModal for creating and editing tables"
```

---

## Task 8: Create AssignBottomSheet (mobile assignment)

**Files:**
- Create: `src/components/events/seating/assign-bottom-sheet.tsx`

**Step 1: Create the component**

Create `src/components/events/seating/assign-bottom-sheet.tsx`:
```typescript
'use client'

import { motion, AnimatePresence } from 'motion/react'
import { XMarkIcon } from '@heroicons/react/16/solid'
import { PlusIcon } from '@heroicons/react/20/solid'
import type { Table } from '@/models/Table'
import type { Guest } from '@/models/Guest'

interface AssignBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  guest: Guest | null
  tables: Table[]
  /** How many total attendees per table (table_id → count) */
  tableOccupancy: Map<string, number>
  onAssign: (guestId: string, tableId: string | null) => void
  onCreateTable: () => void
}

export function AssignBottomSheet({
  isOpen,
  onClose,
  guest,
  tables,
  tableOccupancy,
  onAssign,
  onCreateTable,
}: AssignBottomSheetProps) {
  if (!guest) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-white/10 bg-zinc-900 pb-safe"
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-zinc-700" />
            </div>

            <div className="px-4 pb-6 max-h-[60vh] overflow-y-auto">
              {/* Title */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    Asignar a {guest.first_name} {guest.last_name}
                  </p>
                  {guest.guests_count > 1 && (
                    <p className="text-xs text-zinc-500">+{guest.guests_count - 1} acompañantes</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                >
                  <XMarkIcon className="size-5" />
                </button>
              </div>

              {/* Quitar de mesa option */}
              {guest.table_id && (
                <button
                  onClick={() => {
                    onAssign(guest.id, null)
                    onClose()
                  }}
                  className="w-full rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 mb-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Quitar de mesa actual
                </button>
              )}

              {/* Table list */}
              <div className="space-y-1.5">
                {tables.map((table) => {
                  const occupancy = tableOccupancy.get(table.id) ?? 0
                  const isFull = occupancy >= table.capacity
                  const isCurrentTable = guest.table_id === table.id

                  return (
                    <button
                      key={table.id}
                      disabled={isFull || isCurrentTable}
                      onClick={() => {
                        onAssign(guest.id, table.id)
                        onClose()
                      }}
                      className={[
                        'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                        isCurrentTable
                          ? 'border-indigo-500/30 bg-indigo-500/10 cursor-default'
                          : isFull
                            ? 'border-white/5 bg-zinc-900/30 opacity-50 cursor-not-allowed'
                            : 'border-white/10 bg-zinc-900/30 hover:bg-zinc-800/50 hover:border-indigo-500/30',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-200">{table.name}</span>
                        <span
                          className={[
                            'text-xs tabular-nums',
                            isFull ? 'text-red-400' : 'text-zinc-500',
                          ].join(' ')}
                        >
                          {occupancy}/{table.capacity}
                        </span>
                      </div>
                      {isCurrentTable && (
                        <p className="text-xs text-indigo-400 mt-0.5">Mesa actual</p>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Create new table */}
              <button
                onClick={() => {
                  onCreateTable()
                  onClose()
                }}
                className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:border-indigo-500/30 transition-colors"
              >
                <PlusIcon className="size-4" />
                Crear nueva mesa
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/assign-bottom-sheet.tsx
git commit -m "feat(seating): add AssignBottomSheet for mobile table assignment"
```

---

## Task 9: Create SeatingToolbar (actions bar + pending changes)

**Files:**
- Create: `src/components/events/seating/seating-toolbar.tsx`

**Step 1: Create the component**

Create `src/components/events/seating/seating-toolbar.tsx`:
```typescript
'use client'

import { motion, AnimatePresence } from 'motion/react'
import { PlusIcon, ArrowUturnLeftIcon } from '@heroicons/react/20/solid'
import { Button } from '@/components/button'

interface SeatingToolbarProps {
  pendingCount: number
  canUndo: boolean
  saving: boolean
  onCreateTable: () => void
  onSave: () => void
  onDiscard: () => void
  onUndo: () => void
}

export function SeatingToolbar({
  pendingCount,
  canUndo,
  saving,
  onCreateTable,
  onSave,
  onDiscard,
  onUndo,
}: SeatingToolbarProps) {
  return (
    <>
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button onClick={onCreateTable}>
            <PlusIcon className="size-4" />
            Nueva Mesa
          </Button>
          {canUndo && (
            <Button plain onClick={onUndo}>
              <ArrowUturnLeftIcon className="size-4" />
              <span className="hidden sm:inline">Deshacer</span>
            </Button>
          )}
        </div>

        {pendingCount > 0 && (
          <div className="hidden md:flex items-center gap-2">
            <Button plain onClick={onDiscard}>Descartar</Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Guardando…' : `Guardar cambios (${pendingCount})`}
            </Button>
          </div>
        )}
      </div>

      {/* Bottom sticky bar (for mobile + always visible when changes pending) */}
      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-white/10 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between md:hidden"
          >
            <span className="text-xs text-zinc-400">
              {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
            </span>
            <div className="flex items-center gap-2">
              <Button plain onClick={onDiscard} className="text-xs">
                Descartar
              </Button>
              <Button onClick={onSave} disabled={saving} className="text-xs">
                {saving ? '…' : 'Guardar'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/events/seating/seating-toolbar.tsx
git commit -m "feat(seating): add SeatingToolbar with pending changes indicator"
```

---

## Task 10: Create the main SeatingPlanV2 orchestrator

**Files:**
- Create: `src/components/events/seating/seating-plan-v2.tsx`

This is the main component that wires everything together: DndContext, state hook, API save, layout.

**Step 1: Create the orchestrator**

Create `src/components/events/seating/seating-plan-v2.tsx`:
```typescript
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
  const { data: guests = [], isLoading: guestsLoading, mutate: mutateGuests } = useSWR<Guest[]>(
    `/guests/${eventIdentifier}`,
    fetcher,
  )

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
      } else if (!assignedTableId) {
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
        // Dropped on another guest — assign to same table
        const targetGuest = overData.guest as Guest
        const targetTableId = seating.guestTableMap.get(targetGuest.id)
        if (targetTableId) {
          seating.assignGuest(guestId, targetTableId)
        }
      }
    },
    [seating, guests],
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
      const tableIdMap = new Map<string, string>() // temp_id → real_id
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

      // 3. Delete tables
      for (const tableId of seating.state.deletedTableIds) {
        await api.delete(`/tables/${tableId}`)
      }

      // 4. Batch assign guests (resolve temp IDs)
      const assignments: { guest_id: string; table_id: string | null }[] = []
      for (const [guestId, tableId] of seating.state.assignments) {
        const resolvedTableId = tableId ? (tableIdMap.get(tableId) ?? tableId) : null
        assignments.push({ guest_id: guestId, table_id: resolvedTableId })
      }
      if (assignments.length > 0) {
        await api.put(`/events/${eventId}/tables/assign`, { assignments })
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

        {/* Main layout: sidebar + grid */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Unassigned panel — sidebar on desktop, collapsible on mobile */}
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

          {/* Tables grid */}
          <div className="flex-1">
            {seating.tables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <RectangleGroupIcon className="size-12 text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-500">No hay mesas creadas aún</p>
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

      {/* Drag overlay — ghost element while dragging */}
      <DragOverlay>
        {activeDragGuest && (
          <div className="opacity-80 pointer-events-none">
            <GuestChip guest={activeDragGuest} isDraggable={false} />
          </div>
        )}
      </DragOverlay>

      {/* Modals */}
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
```

**Step 2: Commit**

```bash
git add src/components/events/seating/seating-plan-v2.tsx
git commit -m "feat(seating): add SeatingPlanV2 main orchestrator with DnD + batch save"
```

---

## Task 11: Wire SeatingPlanV2 into the event detail page

**Files:**
- Modify: `src/app/(app)/events/[id]/page.tsx:32-34` (change dynamic import)
- Modify: `src/app/(app)/events/[id]/page.tsx:1101-1108` (change component usage)

**Step 1: Update the dynamic import**

In `src/app/(app)/events/[id]/page.tsx`, change lines 32-35:

Old:
```typescript
const SeatingPlan = dynamic(
  () => import('@/components/events/seating-plan').then((m) => m.SeatingPlan),
  { ssr: false }
)
```

New:
```typescript
const SeatingPlanV2 = dynamic(
  () => import('@/components/events/seating/seating-plan-v2').then((m) => m.SeatingPlanV2),
  { ssr: false }
)
```

**Step 2: Update the tab content**

In the same file, change the `asientos` tab rendering (around lines 1101-1108):

Old:
```tsx
{activeTab === 'asientos' && (
  <SeatingPlan
    guests={guests}
    eventIdentifier={event.identifier}
    isLoading={guestsLoading}
  />
)}
```

New:
```tsx
{activeTab === 'asientos' && event && (
  <SeatingPlanV2
    eventId={event.id}
    eventIdentifier={event.identifier}
  />
)}
```

**Step 3: Verify the build compiles**

Run:
```bash
npm run build
```

Expected: Build succeeds (may have warnings but no errors)

**Step 4: Commit**

```bash
git add src/app/(app)/events/[id]/page.tsx
git commit -m "feat(seating): wire SeatingPlanV2 into event detail page"
```

---

## Task 12: Update guest form modal to support table_id

**Files:**
- Modify: `src/components/guests/forms/guest-form-modal.tsx`

The guest form still has the `table_number` field. Update it to show a dropdown of available tables instead of a free text input. Keep `table_number` as fallback text input for when no tables exist yet.

**Step 1: Update the form field**

In `src/components/guests/forms/guest-form-modal.tsx`, the `table_number` field (line 201-204) should remain as-is for backwards compatibility. The new SeatingPlanV2 handles table assignment via drag-and-drop, so the form is secondary.

Add `table_id` to the Zod schema (line 23 area):
```typescript
table_id: z.string().optional().nullable(),
```

And include it in form defaults and reset logic alongside `table_number`.

**Step 2: Commit**

```bash
git add src/components/guests/forms/guest-form-modal.tsx
git commit -m "feat(seating): add table_id field to guest form schema"
```

---

## Task 13: Create an index barrel file for the seating module

**Files:**
- Create: `src/components/events/seating/index.ts`

**Step 1: Create barrel export**

Create `src/components/events/seating/index.ts`:
```typescript
export { SeatingPlanV2 } from './seating-plan-v2'
export { TableCard } from './table-card'
export { GuestChip } from './guest-chip'
export { UnassignedPanel } from './unassigned-panel'
export { TableFormModal } from './table-form-modal'
export { AssignBottomSheet } from './assign-bottom-sheet'
export { CapacityRing } from './capacity-ring'
export { SeatingToolbar } from './seating-toolbar'
export { useSeatingState } from './use-seating-state'
```

**Step 2: Commit**

```bash
git add src/components/events/seating/index.ts
git commit -m "feat(seating): add barrel index for seating module"
```

---

## Task 14: Manual end-to-end testing

**No code changes — verification only.**

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Test the following flows**

1. Navigate to an event → "Mesas" tab
2. Verify the new SeatingPlanV2 renders (should show "No hay mesas creadas")
3. Click "Nueva Mesa" — modal opens, create a table "Mesa 1" capacity 8
4. Create 2-3 more tables
5. Verify unassigned guests appear in the left panel
6. **Desktop**: Drag a guest from unassigned panel to a table card — verify it moves
7. Drag a guest between tables — verify it moves
8. Drag a guest back to unassigned — verify it returns
9. Check "cambios sin guardar" count updates
10. Click "Deshacer" — verify last action reverses
11. Click "Guardar cambios" — verify API calls succeed and data persists
12. Refresh page — verify assignments persist
13. **Mobile** (Chrome DevTools responsive): Tap "Asignar" on an unassigned guest → bottom sheet appears → select table → guest moves
14. Verify capacity ring colors change (indigo < 75%, amber 75-99%, red 100%)

**Step 3: Run build check**

```bash
npm run build
```

Expected: Build succeeds with no errors.
