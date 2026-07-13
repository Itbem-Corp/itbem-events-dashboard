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
})
