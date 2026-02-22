import { useReducer, useCallback, useMemo } from 'react'
import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'

type UndoEntry =
  | { type: 'ASSIGN_GUEST'; guestId: string; tableId: string | null; prevTableId: string | null }
  | { type: 'CREATE_TABLE'; table: Table }
  | { type: 'UPDATE_TABLE'; tableId: string; changes: Partial<Table>; prev: Partial<Table> }
  | { type: 'DELETE_TABLE'; tableId: string; guestsOnTable: string[] }

interface SeatingState {
  assignments: Map<string, string | null>
  createdTables: Table[]
  updatedTables: Map<string, Partial<Table>>
  deletedTableIds: Set<string>
  undoStack: UndoEntry[]
}

type SeatingAction =
  | { type: 'ASSIGN_GUEST'; guestId: string; tableId: string | null; serverTableId: string | null }
  | { type: 'CREATE_TABLE'; table: Table }
  | { type: 'UPDATE_TABLE'; tableId: string; changes: Partial<Table>; prev: Partial<Table> }
  | { type: 'DELETE_TABLE'; tableId: string; guestsOnTable: string[] }
  | { type: 'UNDO' }
  | { type: 'RESET' }

function reducer(state: SeatingState, action: SeatingAction): SeatingState {
  switch (action.type) {
    case 'ASSIGN_GUEST': {
      const next = new Map(state.assignments)
      // Compute prevTableId from current state instead of relying on the caller
      const prevTableId = state.assignments.has(action.guestId)
        ? state.assignments.get(action.guestId)!
        : action.serverTableId
      if (action.tableId === prevTableId) {
        next.delete(action.guestId)
      } else {
        next.set(action.guestId, action.tableId)
      }
      return {
        ...state,
        assignments: next,
        undoStack: [...state.undoStack, { ...action, type: 'ASSIGN_GUEST', prevTableId }],
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
      const nextDeleted = new Set(state.deletedTableIds)
      nextDeleted.add(action.tableId)
      // Auto-unassign all guests from this table
      const nextAssignments = new Map(state.assignments)
      for (const guestId of action.guestsOnTable) {
        nextAssignments.set(guestId, null)
      }
      return {
        ...state,
        deletedTableIds: nextDeleted,
        assignments: nextAssignments,
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
        if (last.prevTableId === null) {
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
        if (Object.keys(last.prev).length === 0) {
          next.delete(last.tableId)
        } else {
          next.set(last.tableId, last.prev)
        }
        return { ...base, updatedTables: next }
      }
      if (last.type === 'DELETE_TABLE') {
        const nextDeleted = new Set(state.deletedTableIds)
        nextDeleted.delete(last.tableId)
        // Restore guest assignments (remove the null assignments we added)
        const nextAssignments = new Map(state.assignments)
        for (const guestId of last.guestsOnTable) {
          nextAssignments.delete(guestId) // revert to server state
        }
        return { ...base, deletedTableIds: nextDeleted, assignments: nextAssignments }
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

export function useSeatingState(serverTables: Table[], serverGuests: Guest[]) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  const assignGuest = useCallback(
    (guestId: string, tableId: string | null) => {
      const guest = serverGuests.find((g) => g.id === guestId)
      dispatch({ type: 'ASSIGN_GUEST', guestId, tableId, serverTableId: guest?.table_id ?? null })
    },
    [serverGuests],
  )

  const createTable = useCallback((table: Table) => {
    dispatch({ type: 'CREATE_TABLE', table })
  }, [])

  const updateTable = useCallback(
    (tableId: string, changes: Partial<Table>) => {
      const existing = serverTables.find((t) => t.id === tableId)
      const prev: Partial<Table> = {}
      for (const key of Object.keys(changes) as (keyof Table)[]) {
        (prev as any)[key] = existing?.[key]
      }
      dispatch({ type: 'UPDATE_TABLE', tableId, changes, prev })
    },
    [serverTables],
  )

  const deleteTable = useCallback(
    (tableId: string) => {
      // Find all guests currently assigned to this table
      const guestsOnTable: string[] = []
      for (const guest of serverGuests) {
        const effectiveTableId = state.assignments.has(guest.id)
          ? state.assignments.get(guest.id)
          : guest.table_id
        if (effectiveTableId === tableId) {
          guestsOnTable.push(guest.id)
        }
      }
      dispatch({ type: 'DELETE_TABLE', tableId, guestsOnTable })
    },
    [serverGuests, state.assignments],
  )

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
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
