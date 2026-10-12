import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'
import { useCallback, useEffect, useMemo, useReducer } from 'react'

// An override is the local table of a guest: a table id, or null for "unassigned".
// `undefined` means the guest has no override and sits where the server says.
type SeatOverride = string | null | undefined

type UndoEntry =
  | { type: 'ASSIGN_GUEST'; guestId: string; prevOverride: SeatOverride }
  | { type: 'CREATE_TABLE'; table: Table }
  | { type: 'UPDATE_TABLE'; tableId: string; wasCreated: boolean; prev: Partial<Table> | undefined }
  | {
      type: 'DELETE_TABLE'
      table: Table
      wasCreated: boolean
      prevUpdate: Partial<Table> | undefined
      assignmentsBefore: Array<[string, SeatOverride]>
    }

interface SeatingState {
  assignments: Map<string, string | null>
  createdTables: Table[]
  updatedTables: Map<string, Partial<Table>>
  deletedTableIds: Set<string>
  undoStack: UndoEntry[]
  /** Drafts undone with Deshacer, newest last; any new edit clears them (GST-54). */
  redoStack: SeatingSnapshot[]
  /** Draft entries dropped by the last reconcile because the server no longer has their guest or table. */
  lastReconciledCount: number
}

type SeatingAction =
  | { type: 'ASSIGN_GUEST'; guestId: string; tableId: string | null; serverTableId: string | null }
  | { type: 'CREATE_TABLE'; table: Table }
  | { type: 'UPDATE_TABLE'; tableId: string; changes: Partial<Table> }
  | { type: 'DELETE_TABLE'; table: Table; guestsOnTable: string[] }
  | { type: 'RECONCILE'; serverTableIds: Set<string>; serverGuestIds: Set<string> }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET' }

type SeatingSnapshot = Pick<
  SeatingState,
  'assignments' | 'createdTables' | 'updatedTables' | 'deletedTableIds' | 'undoStack'
>

function snapshotOf(state: SeatingState): SeatingSnapshot {
  return {
    assignments: state.assignments,
    createdTables: state.createdTables,
    updatedTables: state.updatedTables,
    deletedTableIds: state.deletedTableIds,
    undoStack: state.undoStack,
  }
}

const EDIT_ACTIONS = new Set<SeatingAction['type']>(['ASSIGN_GUEST', 'CREATE_TABLE', 'UPDATE_TABLE', 'DELETE_TABLE'])

// Redo keeps the state immutable: undo stores the draft it leaves behind, redo puts it back.
function reducer(state: SeatingState, action: SeatingAction): SeatingState {
  if (action.type === 'REDO') {
    if (state.redoStack.length === 0) return state
    const redoStack = state.redoStack.slice(0, -1)
    return { ...state, ...state.redoStack[state.redoStack.length - 1], redoStack }
  }
  const next = draftReducer(state, action)
  if (next === state) return state
  if (action.type === 'UNDO') return { ...next, redoStack: [...state.redoStack, snapshotOf(state)] }
  if (EDIT_ACTIONS.has(action.type)) return next.redoStack.length === 0 ? next : { ...next, redoStack: [] }
  // A reconcile that dropped entries invalidates the undo history, and the redo history with it.
  if (action.type === 'RECONCILE' && next.undoStack !== state.undoStack) return { ...next, redoStack: [] }
  return next
}

function pickKeys(source: Partial<Table>, keys: string[]): Partial<Table> {
  const picked: Record<string, unknown> = {}
  for (const key of keys) picked[key] = (source as Record<string, unknown>)[key]
  return picked as Partial<Table>
}

function draftReducer(state: SeatingState, action: SeatingAction): SeatingState {
  switch (action.type) {
    case 'ASSIGN_GUEST': {
      const prevOverride: SeatOverride = state.assignments.has(action.guestId)
        ? state.assignments.get(action.guestId)
        : undefined
      const currentTableId = prevOverride === undefined ? action.serverTableId : prevOverride
      // Dropping a guest where they already are is a no-op (SEAT-2).
      if (action.tableId === currentTableId) return state

      const next = new Map(state.assignments)
      if (action.tableId === action.serverTableId) {
        next.delete(action.guestId)
      } else {
        next.set(action.guestId, action.tableId)
      }
      return {
        ...state,
        assignments: next,
        undoStack: [...state.undoStack, { type: 'ASSIGN_GUEST', guestId: action.guestId, prevOverride }],
      }
    }
    case 'CREATE_TABLE':
      return {
        ...state,
        createdTables: [...state.createdTables, action.table],
        undoStack: [...state.undoStack, action],
      }
    case 'UPDATE_TABLE': {
      const createdTable = state.createdTables.find((table) => table.id === action.tableId)
      if (createdTable) {
        return {
          ...state,
          createdTables: state.createdTables.map((table) =>
            table.id === action.tableId ? { ...table, ...action.changes } : table
          ),
          undoStack: [
            ...state.undoStack,
            {
              type: 'UPDATE_TABLE',
              tableId: action.tableId,
              wasCreated: true,
              prev: pickKeys(createdTable, Object.keys(action.changes)),
            },
          ],
        }
      }
      // Keep the whole previous draft entry so undo restores exactly the state before this edit (SEAT-3).
      const prevEntry = state.updatedTables.get(action.tableId)
      const next = new Map(state.updatedTables)
      next.set(action.tableId, { ...prevEntry, ...action.changes })
      return {
        ...state,
        updatedTables: next,
        undoStack: [
          ...state.undoStack,
          { type: 'UPDATE_TABLE', tableId: action.tableId, wasCreated: false, prev: prevEntry },
        ],
      }
    }
    case 'DELETE_TABLE': {
      const wasCreated = state.createdTables.some((table) => table.id === action.table.id)
      const nextDeleted = new Set(state.deletedTableIds)
      if (!wasCreated) nextDeleted.add(action.table.id)

      const nextCreatedTables = wasCreated
        ? state.createdTables.filter((table) => table.id !== action.table.id)
        : state.createdTables

      const prevUpdate = state.updatedTables.get(action.table.id)
      const nextUpdatedTables = new Map(state.updatedTables)
      nextUpdatedTables.delete(action.table.id)

      // Auto-unassign all guests from this table
      const nextAssignments = new Map(state.assignments)
      const assignmentsBefore: Array<[string, SeatOverride]> = []
      for (const guestId of action.guestsOnTable) {
        assignmentsBefore.push([guestId, state.assignments.has(guestId) ? state.assignments.get(guestId) : undefined])
        nextAssignments.set(guestId, null)
      }
      return {
        ...state,
        createdTables: nextCreatedTables,
        updatedTables: nextUpdatedTables,
        deletedTableIds: nextDeleted,
        assignments: nextAssignments,
        undoStack: [
          ...state.undoStack,
          { type: 'DELETE_TABLE', table: action.table, wasCreated, prevUpdate, assignmentsBefore },
        ],
      }
    }
    case 'RECONCILE': {
      // Drop draft entries whose guest or table disappeared from the server (SEAT-4).
      const createdIds = new Set(state.createdTables.map((table) => table.id))
      const tableExists = (tableId: string) => action.serverTableIds.has(tableId) || createdIds.has(tableId)
      let dropped = 0

      const assignments = new Map<string, string | null>()
      for (const [guestId, tableId] of state.assignments) {
        if (!action.serverGuestIds.has(guestId) || (tableId !== null && !tableExists(tableId))) {
          dropped++
          continue
        }
        assignments.set(guestId, tableId)
      }
      const updatedTables = new Map<string, Partial<Table>>()
      for (const [tableId, changes] of state.updatedTables) {
        if (!action.serverTableIds.has(tableId)) {
          dropped++
          continue
        }
        updatedTables.set(tableId, changes)
      }
      const deletedTableIds = new Set<string>()
      for (const tableId of state.deletedTableIds) {
        if (!action.serverTableIds.has(tableId)) {
          dropped++
          continue
        }
        deletedTableIds.add(tableId)
      }

      if (dropped === 0) {
        return state.lastReconciledCount === 0 ? state : { ...state, lastReconciledCount: 0 }
      }
      // The draft was rebased on a newer workspace; older undo steps may point at removed entries.
      return { ...state, assignments, updatedTables, deletedTableIds, undoStack: [], lastReconciledCount: dropped }
    }
    case 'UNDO': {
      if (state.undoStack.length === 0) return state
      const stack = [...state.undoStack]
      const last = stack.pop()!
      const base = { ...state, undoStack: stack }

      if (last.type === 'ASSIGN_GUEST') {
        const next = new Map(state.assignments)
        if (last.prevOverride === undefined) {
          next.delete(last.guestId)
        } else {
          next.set(last.guestId, last.prevOverride)
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
        if (last.wasCreated) {
          return {
            ...base,
            createdTables: state.createdTables.map((table) =>
              table.id === last.tableId ? { ...table, ...last.prev } : table
            ),
          }
        }
        const next = new Map(state.updatedTables)
        if (last.prev === undefined) {
          next.delete(last.tableId)
        } else {
          next.set(last.tableId, last.prev)
        }
        return { ...base, updatedTables: next }
      }
      if (last.type === 'DELETE_TABLE') {
        const nextDeleted = new Set(state.deletedTableIds)
        nextDeleted.delete(last.table.id)

        const nextCreatedTables = last.wasCreated ? [...state.createdTables, last.table] : state.createdTables
        const nextUpdatedTables = new Map(state.updatedTables)
        if (last.prevUpdate !== undefined) nextUpdatedTables.set(last.table.id, last.prevUpdate)

        // Restore guest assignments to their exact local state before deletion.
        const nextAssignments = new Map(state.assignments)
        for (const [guestId, previous] of last.assignmentsBefore) {
          if (previous === undefined) nextAssignments.delete(guestId)
          else nextAssignments.set(guestId, previous)
        }
        return {
          ...base,
          createdTables: nextCreatedTables,
          updatedTables: nextUpdatedTables,
          deletedTableIds: nextDeleted,
          assignments: nextAssignments,
        }
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
    redoStack: [],
    lastReconciledCount: 0,
  }
}

export function useSeatingState(serverTables: Table[], serverGuests: Guest[]) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const serverGuestByID = useMemo(() => new Map(serverGuests.map((guest) => [guest.id, guest])), [serverGuests])
  const serverTableByID = useMemo(() => new Map(serverTables.map((table) => [table.id, table])), [serverTables])
  const createdTableByID = useMemo(
    () => new Map(state.createdTables.map((table) => [table.id, table])),
    [state.createdTables]
  )

  // Rebase the draft whenever the server workspace changes (revalidation, another host's edits).
  useEffect(() => {
    dispatch({
      type: 'RECONCILE',
      serverTableIds: new Set(serverTables.map((table) => table.id)),
      serverGuestIds: new Set(serverGuests.map((guest) => guest.id)),
    })
  }, [serverTables, serverGuests])

  const assignGuest = useCallback(
    (guestId: string, tableId: string | null) => {
      const guest = serverGuestByID.get(guestId)
      dispatch({ type: 'ASSIGN_GUEST', guestId, tableId, serverTableId: guest?.table_id ?? null })
    },
    [serverGuestByID]
  )

  const createTable = useCallback((table: Table) => {
    dispatch({ type: 'CREATE_TABLE', table })
  }, [])

  const updateTable = useCallback((tableId: string, changes: Partial<Table>) => {
    dispatch({ type: 'UPDATE_TABLE', tableId, changes })
  }, [])

  const deleteTable = useCallback(
    (tableId: string) => {
      const table = serverTableByID.get(tableId) ?? createdTableByID.get(tableId)
      if (!table) return
      // Find all guests currently assigned to this table
      const guestsOnTable: string[] = []
      for (const guest of serverGuests) {
        const effectiveTableId = state.assignments.has(guest.id) ? state.assignments.get(guest.id) : guest.table_id
        if (effectiveTableId === tableId) {
          guestsOnTable.push(guest.id)
        }
      }
      dispatch({ type: 'DELETE_TABLE', table, guestsOnTable })
    },
    [createdTableByID, serverGuests, serverTableByID, state.assignments]
  )

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

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
    state.assignments.size + state.createdTables.length + state.updatedTables.size + state.deletedTableIds.size

  const canUndo = state.undoStack.length > 0
  const canRedo = state.redoStack.length > 0
  const lastReconciledCount = state.lastReconciledCount

  return {
    tables,
    guestTableMap,
    pendingChangeCount,
    canUndo,
    canRedo,
    lastReconciledCount,
    state,
    assignGuest,
    createTable,
    updateTable,
    deleteTable,
    undo,
    redo,
    reset,
  }
}
