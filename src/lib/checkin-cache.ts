import { readApiData, withApiData } from '@/lib/api-envelope'
import { upsertGuestCacheValue } from '@/lib/guest-cache'
import { getEffectiveStatus, getGuestPartySize } from '@/lib/guest-utils'
import type { CheckinGuestsPageResponse, Guest } from '@/models/Guest'

type CheckinWorkspaceValue = { guests?: unknown }

function patchSummary(
  summary: CheckinGuestsPageResponse['summary'],
  previousGuest: Guest,
  nextGuest: Guest
) {
  if (!summary) return summary
  const wasConfirmed = getEffectiveStatus(previousGuest) === 'CONFIRMED'
  const isConfirmed = getEffectiveStatus(nextGuest) === 'CONFIRMED'
  if (wasConfirmed === isConfirmed) return summary

  const direction = isConfirmed ? 1 : -1
  return {
    ...summary,
    confirmed: Math.max(0, summary.confirmed + direction),
    pending: Math.max(0, summary.pending - direction),
    total_attendees: Math.max(0, summary.total_attendees + direction * getGuestPartySize(nextGuest)),
  }
}

export function patchCheckinGuestsValue(payload: unknown, previousGuest: Guest, nextGuest: Guest): unknown {
  const patched = upsertGuestCacheValue(payload, nextGuest)
  const page = readApiData<CheckinGuestsPageResponse | undefined>(patched)
  if (!page?.summary) return patched
  return withApiData(patched, { ...page, summary: patchSummary(page.summary, previousGuest, nextGuest) })
}

export function patchCheckinWorkspaceValue(payload: unknown, previousGuest: Guest, nextGuest: Guest): unknown {
  const workspace = readApiData<CheckinWorkspaceValue | undefined>(payload)
  if (!workspace?.guests) return payload
  return withApiData(payload, {
    ...workspace,
    guests: patchCheckinGuestsValue(workspace.guests, previousGuest, nextGuest),
  })
}
