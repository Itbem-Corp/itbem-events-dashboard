import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GuestDeleteModal } from '@/components/guests/guest-delete-modal'
import { api } from '@/lib/api'
import type { Guest } from '@/models/Guest'

vi.mock('swr', () => ({
  mutate: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const guest = {
  id: 'guest-1',
  event_id: 'event-1',
  first_name: 'Ana',
  last_name: 'Garcia',
} as Guest

describe('GuestDeleteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies public content refresh after deleting a guest', async () => {
    const onPublicContentChanged = vi.fn()
    const onClose = vi.fn()

    render(
      <GuestDeleteModal
        guest={guest}
        eventIdentifier="evento-test"
        eventId="event-1"
        onClose={onClose}
        onPublicContentChanged={onPublicContentChanged}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Eliminar invitado/i }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/guests/guest-1')
      expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalled()
    })
  })
})
