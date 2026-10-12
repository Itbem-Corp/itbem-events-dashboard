import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useSeatingState } from '@/components/events/seating/use-seating-state'
import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'

const now = '2026-07-06T00:00:00Z'

function table(overrides: Partial<Table> = {}): Table {
  return {
    id: 'table-1',
    event_id: 'event-1',
    name: 'Mesa 1',
    capacity: 8,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    event_id: 'event-1',
    first_name: 'Ana',
    last_name: 'Garcia',
    guests_count: 1,
    status_id: 'status-1',
    table_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('useSeatingState', () => {
  it('edits newly created tables as local drafts instead of persisted updates', () => {
    const draft = table({ id: 'temp-1', name: 'Borrador' })
    const { result } = renderHook(() => useSeatingState([], []))

    act(() => result.current.createTable(draft))
    act(() => result.current.updateTable('temp-1', { name: 'Mesa VIP', capacity: 10 }))

    expect(result.current.tables).toMatchObject([{ id: 'temp-1', name: 'Mesa VIP', capacity: 10 }])
    expect(result.current.state.createdTables).toMatchObject([{ id: 'temp-1', name: 'Mesa VIP', capacity: 10 }])
    expect(result.current.state.updatedTables.size).toBe(0)
    expect(result.current.pendingChangeCount).toBe(1)
  })

  it('deletes newly created tables without leaving temporary ids to persist', () => {
    const draft = table({ id: 'temp-1' })
    const { result } = renderHook(() => useSeatingState([], []))

    act(() => result.current.createTable(draft))
    act(() => result.current.deleteTable('temp-1'))

    expect(result.current.tables).toEqual([])
    expect(result.current.state.createdTables).toEqual([])
    expect(result.current.state.deletedTableIds.has('temp-1')).toBe(false)
    expect(result.current.pendingChangeCount).toBe(0)
  })

  it('restores a deleted draft table and its local assignment on undo', () => {
    const draft = table({ id: 'temp-1' })
    const attendees = [guest()]
    const { result } = renderHook(() => useSeatingState([], attendees))

    act(() => result.current.createTable(draft))
    act(() => result.current.assignGuest('guest-1', 'temp-1'))
    act(() => result.current.deleteTable('temp-1'))
    act(() => result.current.undo())

    expect(result.current.tables).toMatchObject([{ id: 'temp-1' }])
    expect(result.current.guestTableMap.get('guest-1')).toBe('temp-1')
  })

  it('tracks persisted table edits as backend updates', () => {
    const persisted = table({ id: 'table-1' })
    const { result } = renderHook(() => useSeatingState([persisted], []))

    act(() => result.current.updateTable('table-1', { name: 'Mesa nueva' }))

    expect(result.current.tables).toMatchObject([{ id: 'table-1', name: 'Mesa nueva' }])
    expect(result.current.state.createdTables).toEqual([])
    expect(result.current.state.updatedTables.get('table-1')).toEqual({ name: 'Mesa nueva' })
  })

  // SEAT-2: dropping a guest on the table they already sit on must keep the local table.
  it('keeps a locally moved guest on the local table when dropped on it again', () => {
    const t1 = table({ id: 'T1', name: 'Mesa 1' })
    const t2 = table({ id: 'T2', name: 'Mesa 2', sort_order: 1 })
    const { result } = renderHook(() => useSeatingState([t1, t2], [guest({ table_id: 'T1' })]))

    act(() => result.current.assignGuest('guest-1', 'T2'))
    act(() => result.current.assignGuest('guest-1', 'T2'))

    expect(result.current.guestTableMap.get('guest-1')).toBe('T2')
    expect(result.current.state.assignments.get('guest-1')).toBe('T2')
    // The no-op drop does not add an undo step: one undo returns to the saved table.
    act(() => result.current.undo())
    expect(result.current.guestTableMap.get('guest-1')).toBe('T1')
    expect(result.current.canUndo).toBe(false)
  })

  it('drops the local override when a guest is moved back to the saved table', () => {
    const t1 = table({ id: 'T1' })
    const t2 = table({ id: 'T2', sort_order: 1 })
    const { result } = renderHook(() => useSeatingState([t1, t2], [guest({ table_id: 'T1' })]))

    act(() => result.current.assignGuest('guest-1', 'T2'))
    act(() => result.current.assignGuest('guest-1', 'T1'))

    expect(result.current.guestTableMap.get('guest-1')).toBe('T1')
    expect(result.current.state.assignments.has('guest-1')).toBe(false)
    expect(result.current.pendingChangeCount).toBe(0)
  })

  // SEAT-3a: undo after "unassign then move" must restore "unassigned", not the saved table.
  it('restores an unassigned draft seat on undo', () => {
    const t1 = table({ id: 'T1' })
    const t2 = table({ id: 'T2', sort_order: 1 })
    const { result } = renderHook(() => useSeatingState([t1, t2], [guest({ table_id: 'T1' })]))

    act(() => result.current.assignGuest('guest-1', null))
    act(() => result.current.assignGuest('guest-1', 'T2'))
    act(() => result.current.undo())

    expect(result.current.guestTableMap.get('guest-1')).toBeNull()
    act(() => result.current.undo())
    expect(result.current.guestTableMap.get('guest-1')).toBe('T1')
    expect(result.current.pendingChangeCount).toBe(0)
  })

  // SEAT-3b: undoing the second edit of a table keeps the first edit.
  it('undoes only the last edit of a persisted table', () => {
    const persisted = table({ id: 'T1', name: 'A', capacity: 8 })
    const { result } = renderHook(() => useSeatingState([persisted], []))

    act(() => result.current.updateTable('T1', { capacity: 10 }))
    act(() => result.current.updateTable('T1', { name: 'B' }))
    act(() => result.current.undo())

    expect(result.current.tables).toMatchObject([{ id: 'T1', name: 'A', capacity: 10 }])
    act(() => result.current.undo())
    expect(result.current.tables).toMatchObject([{ id: 'T1', name: 'A', capacity: 8 }])
    expect(result.current.state.updatedTables.size).toBe(0)
  })

  it('undoes a repeated edit of the same field to the previous local value', () => {
    const persisted = table({ id: 'T1', capacity: 8 })
    const { result } = renderHook(() => useSeatingState([persisted], []))

    act(() => result.current.updateTable('T1', { capacity: 10 }))
    act(() => result.current.updateTable('T1', { capacity: 12 }))
    act(() => result.current.undo())

    expect(result.current.tables[0].capacity).toBe(10)
  })

  it('restores a table edit when a deleted persisted table is undone', () => {
    const persisted = table({ id: 'T1', name: 'A' })
    const { result } = renderHook(() => useSeatingState([persisted], []))

    act(() => result.current.updateTable('T1', { name: 'B' }))
    act(() => result.current.deleteTable('T1'))
    act(() => result.current.undo())

    expect(result.current.tables).toMatchObject([{ id: 'T1', name: 'B' }])
  })

  // SEAT-4: a draft that points at guests or tables removed elsewhere is rebased on the new workspace.
  it('drops draft entries for guests and tables that no longer exist on the server', () => {
    const t1 = table({ id: 'T1' })
    const t2 = table({ id: 'T2', sort_order: 1 })
    const ana = guest({ id: 'g-ana' })
    const luis = guest({ id: 'g-luis', first_name: 'Luis' })
    const { result, rerender } = renderHook(({ tables, guests }) => useSeatingState(tables, guests), {
      initialProps: { tables: [t1, t2], guests: [ana, luis] },
    })

    act(() => result.current.assignGuest('g-ana', 'T2'))
    act(() => result.current.assignGuest('g-luis', 'T1'))
    act(() => result.current.updateTable('T2', { name: 'VIP' }))
    expect(result.current.pendingChangeCount).toBe(3)

    // Another host deleted Luis and table T2.
    rerender({ tables: [t1], guests: [ana] })

    expect(result.current.state.assignments.has('g-luis')).toBe(false)
    expect(result.current.state.assignments.has('g-ana')).toBe(false)
    expect(result.current.state.updatedTables.has('T2')).toBe(false)
    expect(result.current.pendingChangeCount).toBe(0)
    expect(result.current.lastReconciledCount).toBe(3)
  })

  it('keeps assignments to draft tables when the workspace revalidates', () => {
    const ana = guest({ id: 'g-ana' })
    const { result, rerender } = renderHook(({ tables, guests }) => useSeatingState(tables, guests), {
      initialProps: { tables: [] as Table[], guests: [ana] },
    })

    act(() => result.current.createTable(table({ id: 'temp-1' })))
    act(() => result.current.assignGuest('g-ana', 'temp-1'))
    rerender({ tables: [], guests: [{ ...ana }] })

    expect(result.current.guestTableMap.get('g-ana')).toBe('temp-1')
    expect(result.current.lastReconciledCount).toBe(0)
  })

  it('redoes an undone move and forgets the redo history after a new edit (GST-54)', () => {
    const ana = guest({ id: 'g-ana' })
    const luis = guest({ id: 'g-luis' })
    const t1 = table({ id: 'T1' })
    const { result } = renderHook(() => useSeatingState([t1], [ana, luis]))

    act(() => result.current.assignGuest('g-ana', 'T1'))
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.undo())
    expect(result.current.guestTableMap.get('g-ana')).toBeNull()
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.redo())
    expect(result.current.guestTableMap.get('g-ana')).toBe('T1')
    expect(result.current.pendingChangeCount).toBe(1)
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)

    act(() => result.current.undo())
    act(() => result.current.assignGuest('g-luis', 'T1'))
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.redo())
    expect(result.current.guestTableMap.get('g-ana')).toBeNull()
  })
})
