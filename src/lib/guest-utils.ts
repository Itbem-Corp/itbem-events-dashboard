import { cacheRecordId } from '@/lib/cache-record'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'

export type GuestStatusCode = 'CONFIRMED' | 'DECLINED' | 'PENDING'
export type GuestRsvpStatus = 'confirmed' | 'declined' | 'pending'

export interface GuestStatusUpdatePayload {
  status_id: string
  guest_status_id: string
  rsvp_status: GuestRsvpStatus
  rsvp_method: 'host'
}

export function normalizeGuestStatusCode(code?: string | null): GuestStatusCode {
  const normalized = code?.trim().toUpperCase()
  if (normalized === 'CONFIRMED') return 'CONFIRMED'
  if (normalized === 'DECLINED') return 'DECLINED'
  return 'PENDING'
}

type AnyRecord = Record<string, unknown>

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function firstString(source: unknown, keys: string[]): string | undefined {
  if (!isRecord(source)) return undefined
  for (const key of keys) {
    if (!(key in source) || source[key] == null) continue
    const value = optionalString(source[key])
    if (value) return value
  }
  return undefined
}

function firstNestedString(source: unknown, keys: string[], nestedKeys: string[]): string | undefined {
  if (!isRecord(source)) return undefined
  for (const key of keys) {
    if (!(key in source) || source[key] == null) continue
    const value = optionalString(source[key]) ?? firstString(source[key], nestedKeys)
    if (value) return value
  }
  return undefined
}

function guestRsvpStatus(g: Guest): string | undefined {
  return firstString(g, ['rsvp_status', 'rsvpStatus', 'RSVPStatus'])
}

export function getGuestRsvpAt(g: Guest): string | undefined {
  return firstString(g, ['rsvp_at', 'rsvpAt', 'RSVPAt'])
}

export function getGuestRsvpMethod(g: Guest): string | undefined {
  return firstString(g, ['rsvp_method', 'rsvpMethod', 'RSVPMethod'])
}

export function getGuestDietaryRestrictions(g: Guest): string | undefined {
  return firstString(g, ['dietary_restrictions', 'dietaryRestrictions', 'DietaryRestrictions'])
}

export function getGuestRsvpNotes(g: Guest): string | undefined {
  return firstString(g, ['rsvp_notes', 'rsvpNotes', 'RSVPNotes'])
}

function guestCatalogStatusCode(g: Guest): string | undefined {
  return firstNestedString(g, ['status', 'Status', 'guest_status', 'guestStatus', 'GuestStatus'], ['code', 'Code'])
}

function guestStatusCode(status: GuestStatus): string | undefined {
  return firstString(status, ['code', 'Code'])
}

export function findGuestStatusByCode(
  statuses: GuestStatus[] | undefined,
  code: GuestStatusCode
): GuestStatus | undefined {
  return statuses?.find((status) => normalizeGuestStatusCode(guestStatusCode(status)) === code)
}

export function guestStatusCodeToRsvpStatus(code: GuestStatusCode): GuestRsvpStatus {
  switch (code) {
    case 'CONFIRMED':
      return 'confirmed'
    case 'DECLINED':
      return 'declined'
    default:
      return 'pending'
  }
}

export function buildGuestStatusUpdatePayload(status: GuestStatus): GuestStatusUpdatePayload {
  const code = normalizeGuestStatusCode(guestStatusCode(status))
  const statusId = cacheRecordId(status) || status.id
  return {
    status_id: statusId,
    guest_status_id: statusId,
    rsvp_status: guestStatusCodeToRsvpStatus(code),
    rsvp_method: 'host',
  }
}

/**
 * Returns the effective RSVP status for a guest, normalized to uppercase.
 * Priority: rsvp_status > status.code > 'PENDING'
 */
export function getEffectiveStatus(g: Guest): GuestStatusCode {
  return normalizeGuestStatusCode(guestRsvpStatus(g) || guestCatalogStatusCode(g))
}

export function getGuestTableLabel(g: Guest): string {
  const tableName = g.table?.name?.trim()
  if (tableName) return tableName

  const tableNumber = g.table_number?.trim()
  if (!tableNumber) return ''
  return tableNumber.toLowerCase().startsWith('mesa') ? tableNumber : `Mesa ${tableNumber}`
}

function nonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(Math.trunc(value), 0)
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? Math.max(Math.trunc(numeric), 0) : null
}

function firstNonNegativeInt(source: unknown, keys: string[]): number | null {
  if (!isRecord(source)) return null
  for (const key of keys) {
    if (!(key in source) || source[key] == null) continue
    const numeric = nonNegativeInt(source[key])
    if (numeric !== null) return numeric
  }
  return null
}

export function getGuestPartySize(g: Guest): number {
  const status = getEffectiveStatus(g)
  if (status === 'DECLINED') return 0

  const declared = firstNonNegativeInt(g, ['rsvp_guest_count', 'rsvpGuestCount', 'RSVPGuestCount'])
  if (declared && declared > 0) return declared

  const fallback = firstNonNegativeInt(g, [
    'guests_count',
    'guest_count',
    'guestsCount',
    'guestCount',
    'GuestsCount',
    'GuestCount',
  ])
  return fallback ?? 1
}

export function getGuestCompanionCount(g: Guest): number {
  return Math.max(getGuestPartySize(g) - 1, 0)
}

/**
 * Exports an array of objects to a CSV file and triggers download.
 */
export function exportCSV(
  headers: string[],
  rows: string[][],
  filename: string,
) {
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
