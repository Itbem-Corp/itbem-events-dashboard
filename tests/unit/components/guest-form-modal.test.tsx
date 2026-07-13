import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GuestFormModal } from '@/components/guests/forms/guest-form-modal'
import { api } from '@/lib/api'
import type { Guest } from '@/models/Guest'

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
})
