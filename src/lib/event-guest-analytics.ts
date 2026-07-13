import {
  getEffectiveStatus,
  getGuestCompanionCount,
  getGuestDietaryRestrictions,
  getGuestPartySize,
  getGuestRsvpAt,
  getGuestRsvpMethod,
  getGuestTableLabel,
} from '@/lib/guest-utils'
import type { Guest } from '@/models/Guest'

interface TimelinePoint {
  date: string
  confirmados: number
  declinados: number
}

export interface EventGuestAnalyticsViewModel {
  confirmed: number
  declined: number
  dietaryCounts: Record<string, number>
  estimatedAttendees: number
  hasDietary: boolean
  methodCounts: Record<string, number>
  pending: number
  responded: number
  roleCounts: Record<string, number>
  rsvpTimeline: TimelinePoint[]
  tableCounts: Record<string, number>
  topPlusOnes: Guest[]
  totalPlusOnes: number
}

export function buildEventGuestAnalytics(guests: Guest[]): EventGuestAnalyticsViewModel {
  let confirmed = 0
  let declined = 0
  let pending = 0
  let totalPlusOnes = 0
  let estimatedAttendees = 0
  let hasDietary = false
  const dietaryCounts: Record<string, number> = {}
  const tableCounts: Record<string, number> = {}
  const methodCounts: Record<string, number> = {}
  const roleCounts: Record<string, number> = {}
  const responses: Array<{ at: number; status: string }> = []
  const plusOneGuests: Guest[] = []

  for (const guest of guests) {
    const status = getEffectiveStatus(guest)
    const role = guest.role || ''
    roleCounts[role] = (roleCounts[role] ?? 0) + 1

    const table = getGuestTableLabel(guest)
    if (table) tableCounts[table] = (tableCounts[table] ?? 0) + 1

    if (status === 'PENDING') {
      pending += 1
      continue
    }

    if (status === 'CONFIRMED') {
      confirmed += 1
      const companionCount = getGuestCompanionCount(guest)
      totalPlusOnes += companionCount
      estimatedAttendees += getGuestPartySize(guest)
      if (companionCount > 0) plusOneGuests.push(guest)

      const dietary = getGuestDietaryRestrictions(guest)
      if (dietary) hasDietary = true
      const dietaryKey = dietary || 'Ninguna'
      dietaryCounts[dietaryKey] = (dietaryCounts[dietaryKey] ?? 0) + 1
    } else if (status === 'DECLINED') {
      declined += 1
    }

    const method = getGuestRsvpMethod(guest) || ''
    methodCounts[method] = (methodCounts[method] ?? 0) + 1

    const rsvpAt = getGuestRsvpAt(guest)
    if (rsvpAt) {
      const timestamp = new Date(rsvpAt).getTime()
      if (Number.isFinite(timestamp)) responses.push({ at: timestamp, status })
    }
  }

  responses.sort((a, b) => a.at - b.at)
  const byDay = new Map<string, { confirmed: number; declined: number }>()
  for (const response of responses) {
    const day = new Date(response.at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
    const counts = byDay.get(day) ?? { confirmed: 0, declined: 0 }
    if (response.status === 'CONFIRMED') counts.confirmed += 1
    if (response.status === 'DECLINED') counts.declined += 1
    byDay.set(day, counts)
  }

  let cumulativeConfirmed = 0
  let cumulativeDeclined = 0
  const rsvpTimeline = Array.from(byDay, ([date, counts]) => {
    cumulativeConfirmed += counts.confirmed
    cumulativeDeclined += counts.declined
    return { date, confirmados: cumulativeConfirmed, declinados: cumulativeDeclined }
  })

  const topPlusOnes = plusOneGuests
    .sort((a, b) => getGuestCompanionCount(b) - getGuestCompanionCount(a))
    .slice(0, 5)

  return {
    confirmed,
    declined,
    dietaryCounts,
    estimatedAttendees,
    hasDietary,
    methodCounts,
    pending,
    responded: confirmed + declined,
    roleCounts,
    rsvpTimeline,
    tableCounts,
    topPlusOnes,
    totalPlusOnes,
  }
}
