import { EventDeleteModal } from '@/components/events/event-delete-modal'
import { api } from '@/lib/api'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { success, error } = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: { delete: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success, error } }))

describe('EventDeleteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.delete).mockResolvedValue({ data: {} })
  })

  it('deletes the event after the optimistic update and requests selective revalidation', async () => {
    const onClose = vi.fn()
    const onDeleted = vi.fn()
    const onOptimisticDelete = vi.fn().mockResolvedValue(undefined)
    const onRevalidate = vi.fn()
    const targetEvent = { id: 'evt-1', name: 'Evento premium' } as never

    render(
      <EventDeleteModal
        event={targetEvent}
        open
        onClose={onClose}
        onDeleted={onDeleted}
        onOptimisticDelete={onOptimisticDelete}
        onRevalidate={onRevalidate}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar evento' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/events/evt-1'))
    expect(onOptimisticDelete).toHaveBeenCalledWith(targetEvent)
    expect(onRevalidate).toHaveBeenCalledOnce()
    expect(success).toHaveBeenCalledWith('"Evento premium" fue eliminado')
    expect(onDeleted).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
