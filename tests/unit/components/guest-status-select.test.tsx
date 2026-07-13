import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GuestStatusSelect } from '@/components/guests/guest-status-select'
import { api } from '@/lib/api'
import type { Guest } from '@/models/Guest'
import type { GuestStatus } from '@/models/GuestStatus'
import { mutate } from 'swr'

vi.mock('@/lib/api', () => ({ api: { put: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('swr', () => ({ mutate: vi.fn() }))

const pending = { id: 'status-pending', code: 'PENDING', name: 'Pendiente' } as GuestStatus
const confirmed = { id: 'status-confirmed', code: 'CONFIRMED', name: 'Confirmado' } as GuestStatus
const guest = {
  id: 'guest-1',
  event_id: 'event-1',
  first_name: 'Ana',
  last_name: 'Prueba',
  status_id: pending.id,
  guest_status_id: pending.id,
  status: pending,
  guest_status: pending,
} as Guest

describe('GuestStatusSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mutate).mockResolvedValue(undefined)
  })

  it('patches the guest immediately and confirms without a list refetch', async () => {
    let resolveRequest!: (value: { data: Guest }) => void
    vi.mocked(api.put).mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve }))
    render(
      <GuestStatusSelect guest={guest} eventIdentifier="event-1" eventId="event-1" statuses={[pending, confirmed]} />
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Estado de Ana Prueba' }), {
      target: { value: 'CONFIRMED' },
    })

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const optimisticUpdater = vi.mocked(mutate).mock.calls[0][1] as (current: unknown) => Guest[]
    expect(vi.mocked(mutate).mock.calls[0][2]).toEqual({ revalidate: false })
    expect(optimisticUpdater([guest])[0]).toMatchObject({
      id: guest.id,
      status_id: confirmed.id,
      guest_status_id: confirmed.id,
      status: confirmed,
    })

    resolveRequest({ data: { ...guest, status: confirmed, guest_status: confirmed } })
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(3))
    expect(vi.mocked(mutate).mock.calls[1][2]).toEqual({ revalidate: false })
    expect(vi.mocked(mutate).mock.calls[2][0]).toBe('/guests/summary:event-1')
  })

  it('restores the original guest when the request fails', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('network'))
    render(
      <GuestStatusSelect guest={guest} eventIdentifier="event-1" eventId="event-1" statuses={[pending, confirmed]} />
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Estado de Ana Prueba' }), {
      target: { value: 'CONFIRMED' },
    })

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    const rollbackUpdater = vi.mocked(mutate).mock.calls[1][1] as (current: unknown) => Guest[]
    expect(rollbackUpdater([{ ...guest, status: confirmed }])[0]).toMatchObject({
      status_id: pending.id,
      status: pending,
    })
    expect(vi.mocked(mutate).mock.calls[1][2]).toEqual({ revalidate: false })
  })
})
