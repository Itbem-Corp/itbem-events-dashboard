import { getEffectiveStatus, getGuestPartySize } from '@/lib/guest-utils'
import type { Guest } from '@/models/Guest'
import type { Table } from '@/models/Table'

/**
 * Seating capacity rule (strict, SEAT-1).
 *
 * A guest takes as many seats as their party size, counted the way the backend
 * computes `Guest.guests_count` (models/Guest.go AfterFind): 0 when the RSVP is
 * declined, else the confirmed `rsvp_guest_count`, else the invitation maximum,
 * else 1 (`getGuestPartySize`). A move is allowed only when the seats already
 * taken at the target table, not counting the guest being moved, plus the
 * guest's party size are at most the table's capacity. Every surface (drag and
 * drop, the mobile sheet, auto-assign, the table editor) uses this rule.
 */
export function seatsNeeded(guest: Guest): number {
  return getGuestPartySize(guest)
}

export interface SeatCheck {
  ok: boolean
  /** Seats still free at the table, not counting the guest being moved. */
  free: number
  needed: number
}

export function checkSeat(
  table: Pick<Table, 'id' | 'capacity'>,
  occupancy: Map<string, number>,
  guest: Guest,
  currentTableId: string | null | undefined
): SeatCheck {
  const needed = seatsNeeded(guest)
  const seated = occupancy.get(table.id) ?? 0
  const alreadyHere = currentTableId === table.id ? needed : 0
  const free = table.capacity - (seated - alreadyHere)
  return { ok: needed <= free, free: Math.max(free, 0), needed }
}

export function seatRefusalMessage(tableName: string, check: SeatCheck): string {
  const seats = (n: number) => `${n} lugar${n === 1 ? '' : 'es'}`
  // The verb agrees with the count too: "queda 1 lugar", "quedan 2 lugares" (GST-63).
  const left =
    check.free === 0 ? 'ya no quedan lugares' : `${check.free === 1 ? 'queda' : 'quedan'} ${seats(check.free)}`
  return `${tableName} no tiene lugar suficiente: ${left} y este grupo necesita ${seats(check.needed)}.`
}

/** Guests who declined are not seated by auto-assign and are not listed as "sin mesa" (SEAT-6). */
export function isSeatable(guest: Guest): boolean {
  return getEffectiveStatus(guest) !== 'DECLINED'
}

export interface OverCapacityTable {
  tableId: string
  name: string
  capacity: number
  /** Seats the refused write would have left at the table. */
  seats: number
}

export interface TableOverCapacityError {
  message: string
  tableIds: string[]
  tables: OverCapacityTable[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [item]
      if (isRecord(item) && typeof item.id === 'string') return [item.id]
      if (isRecord(item) && typeof item.table_id === 'string') return [item.table_id]
      return []
    })
  }
  return typeof value === 'string' && value.trim() ? [value] : []
}

const DEFAULT_OVER_CAPACITY_MESSAGE =
  'Una o más mesas superan su capacidad. Mueve invitados o aumenta la capacidad antes de guardar.'

function conflictPayload(error: unknown, expectedCode: string) {
  if (!isRecord(error)) return null
  const response = isRecord(error.response) ? error.response : null
  const status = response?.status ?? error.status
  const payload = response?.data ?? error.payload
  if (status !== 409 || !isRecord(payload)) return null
  const sources = [payload, payload.data, payload.details].filter(isRecord)
  const code = sources.map((source) => source.code ?? source.error).find((value) => typeof value === 'string')
  if (code !== expectedCode) return null
  const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : ''
  return { payload, sources, message }
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Reads the backend's 409 `table_over_capacity`:
 * `{code, error, message, table_ids, data: {table_ids, tables: [{table_id, name, capacity, seats}]}}`.
 * The ids may also come only from `data`/`details`; anything else returns null.
 */
export function readTableOverCapacityError(error: unknown): TableOverCapacityError | null {
  const conflict = conflictPayload(error, 'table_over_capacity')
  if (!conflict) return null

  const tableIds = new Set<string>()
  const tables: OverCapacityTable[] = []
  for (const source of conflict.sources) {
    for (const key of ['table_ids', 'tableIds', 'tables', 'table_id']) {
      for (const id of stringList(source[key])) tableIds.add(id)
    }
    if (Array.isArray(source.tables)) {
      for (const item of source.tables) {
        if (!isRecord(item)) continue
        const tableId = typeof item.table_id === 'string' ? item.table_id : typeof item.id === 'string' ? item.id : ''
        if (!tableId || tables.some((table) => table.tableId === tableId)) continue
        tables.push({
          tableId,
          name: typeof item.name === 'string' ? item.name : '',
          capacity: finiteNumber(item.capacity),
          seats: finiteNumber(item.seats),
        })
      }
    }
  }
  return { message: conflict.message || DEFAULT_OVER_CAPACITY_MESSAGE, tableIds: Array.from(tableIds), tables }
}

export const SEATING_PLAN_STALE_MESSAGE =
  'Algunos invitados o mesas cambiaron mientras editabas. Recarga el plan de mesas e inténtalo de nuevo.'

/** Reads the backend's 409 `seating_plan_stale` (a guest or table of the draft left the event); null otherwise. */
export function readSeatingPlanStaleError(error: unknown): { message: string } | null {
  const conflict = conflictPayload(error, 'seating_plan_stale')
  return conflict ? { message: conflict.message || SEATING_PLAN_STALE_MESSAGE } : null
}
