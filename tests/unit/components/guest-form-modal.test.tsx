import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GuestFormModal } from '@/components/guests/forms/guest-form-modal'
import { api } from '@/lib/api'
import type { Guest } from '@/models/Guest'
import { toast } from 'sonner'

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
}))

vi.mock('swr', () => ({
  mutate: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: { data: { id: 'guest-1' } } }),
    put: vi.fn().mockResolvedValue({ data: { data: { id: 'guest-1' } } }),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('GuestFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks guests as hosts when the public role is a host alias', async () => {
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={{
          id: 'guest-1',
          event_id: 'event-1',
          first_name: 'Ana',
          last_name: 'Garcia',
          role: 'co-host',
          is_host: false,
        } as Guest}
      />
    )

    const hostCheckbox = screen.getByRole('checkbox', { name: /Es anfitri/i })

    await waitFor(() => {
      expect(hostCheckbox).toBeChecked()
    })
  })

  it('clears the automatic host flag when the host role changes away', async () => {
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    const hostCheckbox = screen.getByRole('checkbox', { name: /Es anfitri/i })
    const roleSelect = screen.getByLabelText('Rol')

    fireEvent.change(roleSelect, { target: { value: 'host' } })
    await waitFor(() => {
      expect(hostCheckbox).toBeChecked()
    })

    fireEvent.change(roleSelect, { target: { value: 'guest' } })
    await waitFor(() => {
      expect(hostCheckbox).not.toBeChecked()
    })
  })

  it('keeps manually marked hosts even when the role is not host', async () => {
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    const hostCheckbox = screen.getByRole('checkbox', { name: /Es anfitri/i })

    fireEvent.click(hostCheckbox)
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'vip' } })

    await waitFor(() => {
      expect(hostCheckbox).toBeChecked()
    })
  })

  it('sends public profile order when creating guests', async () => {
    const onPublicContentChanged = vi.fn()
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        onPublicContentChanged={onPublicContentChanged}
      />
    )

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Perfil/i }))
    fireEvent.change(screen.getByLabelText('Orden publico'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/guests',
        expect.objectContaining({
          event_id: 'event-1',
          first_name: 'Ana',
          last_name: 'Garcia',
          order: 4,
        })
      )
    })
    expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
  })

  it('saves a declined guest without asking for an attendee count or sending guests_count (GST-16)', async () => {
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={
          {
            id: 'guest-1',
            event_id: 'event-1',
            first_name: 'Ana',
            last_name: 'Garcia',
            guests_count: 0,
            max_guests: 2,
            rsvp_status: 'declined',
          } as Guest
        }
      />
    )

    expect(screen.queryByLabelText('Asistentes')).not.toBeInTheDocument()
    expect(screen.getByText('Declinó la invitación.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+52 55 1111 2222' } })
    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(api.put).mock.calls[0][1] as Record<string, unknown>
    expect(payload).toMatchObject({ phone: '+52 55 1111 2222' })
    expect(payload).not.toHaveProperty('guests_count')
  })

  it('does not overwrite the RSVP party size when an unrelated field changes (GST-16)', async () => {
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={
          {
            id: 'guest-1',
            event_id: 'event-1',
            first_name: 'Ana',
            last_name: 'Garcia',
            guests_count: 2,
            max_guests: 4,
            rsvp_status: 'confirmed',
          } as Guest
        }
      />
    )

    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+52 55 3333 4444' } })
    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.put).mock.calls[0][1]).not.toHaveProperty('guests_count')
  })

  it('sends a changed party size for a confirmed guest and keeps it within the maximum (GST-16)', async () => {
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={
          {
            id: 'guest-1',
            event_id: 'event-1',
            first_name: 'Ana',
            last_name: 'Garcia',
            guests_count: 2,
            max_guests: 3,
            rsvp_status: 'confirmed',
          } as Guest
        }
      />
    )

    fireEvent.change(screen.getByLabelText('Asistentes'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))
    expect(await screen.findByText('No puede superar el máximo')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Asistentes'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/guests/guest-1', expect.objectContaining({ guests_count: 3 }))
    })
  })

  it('shows the seating table read-only and never sends the legacy table_number (GST-18)', async () => {
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={
          {
            id: 'guest-1',
            event_id: 'event-1',
            first_name: 'Ana',
            last_name: 'Garcia',
            table_id: 'table-2',
            table_number: '5',
            table: { id: 'table-2', name: 'Mesa 2' },
          } as Guest
        }
      />
    )

    expect(screen.queryByLabelText('Mesa asignada')).not.toBeInTheDocument()
    expect(screen.getByText('Mesa 2')).toBeInTheDocument()
    expect(screen.getByText('Asigna o cambia la mesa en la pestaña Mesas.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(api.put).mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('table_number')
    expect(payload).toMatchObject({ table_id: 'table-2' })
  })

  it('shows the server party-size error on the Asistentes field (400 party_size_exceeds_max_guests)', async () => {
    vi.mocked(api.put).mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          status: 400,
          error: 'party_size_exceeds_max_guests',
          message: 'Los asistentes (3) superan el máximo de invitados (2).',
        },
      },
    })
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={
          {
            id: 'guest-1',
            event_id: 'event-1',
            first_name: 'Ana',
            last_name: 'Garcia',
            guests_count: 2,
            rsvp_status: 'confirmed',
          } as Guest
        }
      />
    )

    fireEvent.change(screen.getByLabelText('Asistentes'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))

    expect(await screen.findByText('Los asistentes (3) superan el máximo de invitados (2).')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('Los asistentes (3) superan el máximo de invitados (2).')
  })

  it('shows guest_field_too_long on the named field and opens the public profile when needed', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: {
        status: 400,
        data: { status: 400, error: 'guest_field_too_long', message: 'El campo «Firma» admite máximo 300 caracteres.' },
      },
    })
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar invitado/i }))

    expect(await screen.findByText('El campo «Firma» admite máximo 300 caracteres.')).toBeInTheDocument()
    expect(screen.getByLabelText('Dedicatoria / firma')).toBeInTheDocument()
  })

  it('shows invalid_rsvp_status as a Spanish toast', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: { status: 400, data: { status: 400, error: 'invalid_rsvp_status', message: 'Estado de confirmación inválido. Usa pendiente, confirmado o declinado.' } },
    })
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar invitado/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Estado de confirmación inválido. Usa pendiente, confirmado o declinado.')
    })
  })

  it('shows the Spanish e-mail message instead of the browser bubble (GST-4)', async () => {
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'no-es-correo' } })
    const submit = screen.getByRole('button', { name: /Agregar invitado/i })
    expect(submit.closest('form')).toHaveAttribute('novalidate')
    fireEvent.click(submit)

    expect(await screen.findByText('Correo inválido')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('mirrors the server limits before sending (text length, attendees within Máximo)', async () => {
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '5'.repeat(51) } })
    fireEvent.change(screen.getByLabelText('Asistentes'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Máximo'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar invitado/i }))

    expect(await screen.findByText('Máximo 50 caracteres')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+52 55 1' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar invitado/i }))
    expect(await screen.findByText('No puede superar el máximo')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('accepts a party above the old 20 limit and treats Máximo 0 as no cap', async () => {
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getByLabelText('Asistentes'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Máximo'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/guests', expect.objectContaining({ guests_count: 30, max_guests: 0 }))
    })
  })

  it('sends table_id null instead of an empty string when creating a guest', async () => {
    render(<GuestFormModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/guests', expect.objectContaining({ table_id: null }))
    })
  })

  it('sends table_id null when editing a guest without a table', async () => {
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={{ id: 'guest-1', event_id: 'event-1', first_name: 'Ana', last_name: 'Garcia' } as Guest}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/guests/guest-1', expect.objectContaining({ table_id: null }))
    })
  })

  it('keeps the assigned table when editing a seated guest', async () => {
    render(
      <GuestFormModal
        isOpen
        setIsOpen={vi.fn()}
        eventId="event-1"
        guest={{ id: 'guest-1', event_id: 'event-1', first_name: 'Ana', last_name: 'Garcia', table_id: 'table-9' } as Guest}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Actualizar invitado/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/guests/guest-1', expect.objectContaining({ table_id: 'table-9' }))
    })
  })
})
