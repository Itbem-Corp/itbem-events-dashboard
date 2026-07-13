import { patchCheckinGuestsValue, patchCheckinWorkspaceValue } from '@/lib/checkin-cache'
import type { Guest } from '@/models/Guest'
import { describe, expect, it } from 'vitest'

const pending = {
  id: 'guest-1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  guests_count: 2,
  status_id: 'pending',
  status: { id: 'pending', code: 'PENDING' },
} as Guest

const confirmed = {
  ...pending,
  status_id: 'confirmed',
  status: { id: 'confirmed', code: 'CONFIRMED' },
} as Guest

const page = {
  data: [pending],
  total: 1,
  page: 1,
  page_size: 60,
  total_pages: 1,
  summary: { total: 1, confirmed: 0, pending: 1, declined: 0, total_attendees: 0 },
}

describe('checkin cache', () => {
  it('actualiza invitado y contadores en la misma mutacion', () => {
    const result = patchCheckinGuestsValue(page, pending, confirmed) as typeof page
    expect(result.data[0].status?.code).toBe('CONFIRMED')
    expect(result.summary).toMatchObject({ confirmed: 1, pending: 0, total_attendees: 2 })
  })

  it('revierte fila y contadores sin perder el workspace', () => {
    const workspace = { event: { id: 'event-1' }, statuses: [], guests: page }
    const optimistic = patchCheckinWorkspaceValue(workspace, pending, confirmed)
    const rolledBack = patchCheckinWorkspaceValue(optimistic, confirmed, pending) as typeof workspace
    expect(rolledBack.event).toEqual(workspace.event)
    expect(rolledBack.guests.data[0].status?.code).toBe('PENDING')
    expect(rolledBack.guests.summary).toEqual(page.summary)
  })

  it('no cuenta dos veces una confirmacion repetida', () => {
    const alreadyConfirmed = { ...page, data: [confirmed], summary: { ...page.summary, confirmed: 1, pending: 0 } }
    const result = patchCheckinGuestsValue(alreadyConfirmed, confirmed, confirmed) as typeof alreadyConfirmed
    expect(result.summary.confirmed).toBe(1)
    expect(result.summary.pending).toBe(0)
  })
})
