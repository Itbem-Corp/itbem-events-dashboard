import { EventDuplicateModal } from '@/components/events/event-duplicate-modal'
import { api } from '@/lib/api'
import type { Event } from '@/models/Event'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
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

function renderModal(props: Partial<React.ComponentProps<typeof EventDuplicateModal>> = {}) {
  const setIsOpen = vi.fn()
  const onCreated = vi.fn()
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <EventDuplicateModal event={event()} isOpen setIsOpen={setIsOpen} onCreated={onCreated} {...props} />
    </SWRConfig>
  )
  return { setIsOpen, onCreated }
}

describe('EventDuplicateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: { id: 'evt-001', event_id: 'evt-001', is_public: true } })
    vi.mocked(api.post).mockResolvedValue({ data: event({ id: 'evt-copy', is_active: false }) })
    vi.mocked(api.put).mockResolvedValue({ data: {} })
  })

  it('uses the backend duplicate endpoint with only explicit overrides', async () => {
    const { setIsOpen, onCreated } = renderModal()

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
        shift_dates: true,
      })
    })

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-copy', is_active: false }))
    )
    expect(setIsOpen).toHaveBeenCalledWith(false)
    expect(api.put).not.toHaveBeenCalled()
  })

  // EVT-87: the backend now answers 409 event_name_taken instead of renaming the copy in silence.
  it('shows a taken name inline and keeps the modal open', async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'event_name_taken', message: 'Ya existe un evento con ese nombre en esta organización.' },
      },
    })
    const { setIsOpen } = renderModal()
    // Headless UI may report an outside focus on mount in happy-dom; only calls after submitting count.
    const closeCallsBeforeSubmit = setIsOpen.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar evento' }))

    expect(await screen.findByText('Ya existe un evento con ese nombre en esta organización.')).toBeInTheDocument()
    expect(setIsOpen).toHaveBeenCalledTimes(closeCallsBeforeSubmit)
    expect(toast.error).not.toHaveBeenCalled()
  })

  // EVT-86: the copy kept an RSVP deadline that had already passed.
  it('asks the backend to shift the dates and says what it will do with a past deadline', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 'evt-001', event_id: 'evt-001', is_public: true, rsvp_deadline: '2026-01-25T06:00:00Z' },
    })
    renderModal()

    expect(
      await screen.findByText(
        /la copia nacería cerrada \(la fecha límite para confirmar asistencia ya pasó\)\. Al duplicar se recorrerán/
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar evento' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/events/evt-001/duplicate', expect.objectContaining({ shift_dates: true }))
    )
    expect(api.put).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Evento duplicado correctamente')
  })

  it('copies the dates unchanged when the organizer unticks the shift', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 'evt-001', event_id: 'evt-001', is_public: true, rsvp_deadline: '2026-01-25T06:00:00Z' },
    })
    renderModal()

    fireEvent.click(await screen.findByRole('checkbox', { name: /Mover la fecha límite/ }))
    expect(screen.getByText(/La copia conservará las fechas del original y nacerá cerrada/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar evento' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/events/evt-001/duplicate',
        expect.objectContaining({ shift_dates: false })
      )
    )
  })

  it('shows a name over the backend limit inline', async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'event_name_too_long', message: 'El nombre del evento admite máximo 120 caracteres.' },
      },
    })
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar evento' }))

    expect(await screen.findByText('El nombre del evento admite máximo 120 caracteres.')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
