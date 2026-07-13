import { EventDuplicateModal } from '@/components/events/event-duplicate-modal'
import { api } from '@/lib/api'
import type { Event } from '@/models/Event'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-001',
    name: 'Boda Ana y Luis',
    identifier: 'boda-ana-luis',
    is_active: true,
    event_date_time: '2026-02-01T20:00:00Z',
    timezone: 'America/Mexico_City',
    event_type_id: 'type-001',
    client_id: 'client-001',
    language: 'es',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Event
}

describe('EventDuplicateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.post).mockResolvedValue({ data: event({ id: 'evt-copy', is_active: false }) })
  })

  it('uses the backend duplicate endpoint with only explicit overrides', async () => {
    const setIsOpen = vi.fn()
    const onCreated = vi.fn()
    render(<EventDuplicateModal event={event()} isOpen setIsOpen={setIsOpen} onCreated={onCreated} />)

    fireEvent.change(screen.getByDisplayValue('Boda Ana y Luis (copia)'), {
      target: { value: 'Boda Ana y Luis copia marzo' },
    })

    fireEvent.change(screen.getByLabelText('Fecha y hora'), { target: { value: '2026-03-01T18:30' } })

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar evento' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/events/evt-001/duplicate', {
        name: 'Boda Ana y Luis copia marzo',
        event_date_time: '2026-03-01T18:30:00-06:00',
        timezone: 'America/Mexico_City',
        is_active: false,
      })
    })

    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-copy', is_active: false }))
    expect(setIsOpen).toHaveBeenCalledWith(false)
  })
})
