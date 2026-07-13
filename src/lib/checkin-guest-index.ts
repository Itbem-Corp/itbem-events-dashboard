import { getEffectiveStatus, getGuestTableLabel } from '@/lib/guest-utils'
import type { Guest } from '@/models/Guest'

export type CheckinGuestFilter = 'ALL' | 'PENDING' | 'CONFIRMED'

interface CheckinGuestEntry {
  guest: Guest
  attendanceCode: string
  displayName: string
  searchText: string
}

export interface CheckinGuestIndex {
  entries: CheckinGuestEntry[]
  confirmedCount: number
  pendingCount: number
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim()
}

export function buildCheckinGuestIndex(guests: Guest[]): CheckinGuestIndex {
  let confirmedCount = 0
  let pendingCount = 0

  const entries = guests.map((guest) => {
    const attendanceCode = getEffectiveStatus(guest)
    if (attendanceCode === 'CONFIRMED') confirmedCount += 1
    if (attendanceCode === 'PENDING') pendingCount += 1

    const displayName = `${guest.first_name} ${guest.last_name}`.trim()
    const searchText = normalizeSearch(
      [displayName, guest.email, guest.phone, getGuestTableLabel(guest)].filter(Boolean).join(' ')
    )

    return { guest, attendanceCode, displayName, searchText }
  })

  entries.sort((a, b) => {
    const pendingOrder = Number(b.attendanceCode === 'PENDING') - Number(a.attendanceCode === 'PENDING')
    return pendingOrder || a.displayName.localeCompare(b.displayName, 'es-MX')
  })

  return { entries, confirmedCount, pendingCount }
}

export function filterCheckinGuests(
  index: CheckinGuestIndex,
  query: string,
  filter: CheckinGuestFilter
): Guest[] {
  const normalizedQuery = normalizeSearch(query)

  return index.entries.flatMap((entry) => {
    if (filter !== 'ALL' && entry.attendanceCode !== filter) return []
    if (normalizedQuery && !entry.searchText.includes(normalizedQuery)) return []
    return [entry.guest]
  })
}
