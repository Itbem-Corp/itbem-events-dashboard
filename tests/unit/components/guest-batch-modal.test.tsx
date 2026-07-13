import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GUEST_CSV_MAX_BYTES, GuestBatchModal } from '@/components/guests/forms/guest-batch-modal'
import { api } from '@/lib/api'
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
    post: vi.fn().mockResolvedValue({
      data: { status: 201, message: 'Guests created', data: [{ id: 'guest-1' }] },
    }),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function inputByPlaceholder(container: HTMLElement, text: string): HTMLInputElement {
  const input = Array.from(container.querySelectorAll('input')).find((item) => item.placeholder.includes(text))
  if (!input) throw new Error(`Missing input with placeholder containing "${text}"`)
  return input
}

async function uploadCsv(text: string) {
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement | null
  if (!input) throw new Error('Missing CSV file input')

  const file = new File([text], 'guests.csv', { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })

  await waitFor(() => {
    expect(inputByPlaceholder(document.body, 'Ana').value).toBe('Ana')
  })
}

describe('GuestBatchModal', () => {
  beforeEach(() => {
    let id = 0
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: vi.fn(() => `row-${++id}`),
    })
    vi.clearAllMocks()
  })

  it('submits public roles for imported guests', async () => {
    const setIsOpen = vi.fn()
    const onPublicContentChanged = vi.fn()
    const onCreated = vi.fn()
    render(
      <GuestBatchModal
        isOpen
        setIsOpen={setIsOpen}
        eventId="event-1"
        onPublicContentChanged={onPublicContentChanged}
        onCreated={onCreated}
      />
    )

    fireEvent.change(inputByPlaceholder(document.body, 'Ana'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Garc'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getAllByLabelText('Rol publico')[0], { target: { value: 'graduate' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/guests/batch', [
        expect.objectContaining({
          event_id: 'event-1',
          first_name: 'Ana',
          last_name: 'Garcia',
          role: 'graduate',
          is_host: false,
        }),
      ], expect.objectContaining({ timeout: 120_000 }))
    })
    expect(onPublicContentChanged).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it('sends the host flag for batch guests with host roles', async () => {
    const setIsOpen = vi.fn()
    render(<GuestBatchModal isOpen setIsOpen={setIsOpen} eventId="event-1" />)

    fireEvent.change(inputByPlaceholder(document.body, 'Ana'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Garc'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getAllByLabelText('Rol publico')[0], { target: { value: 'host' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/guests/batch', [
        expect.objectContaining({
          role: 'host',
          is_host: true,
        }),
      ], expect.objectContaining({ timeout: 120_000 }))
    })
  })

  it('submits public order for imported guests', async () => {
    const setIsOpen = vi.fn()
    render(<GuestBatchModal isOpen setIsOpen={setIsOpen} eventId="event-1" />)

    fireEvent.change(inputByPlaceholder(document.body, 'Ana'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Garc'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getAllByLabelText('Orden publico')[0], { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/guests/batch', [
        expect.objectContaining({
          order: 2,
        }),
      ], expect.objectContaining({ timeout: 120_000 }))
    })
  })

  it('parses public order and role from current CSV templates', async () => {
    const setIsOpen = vi.fn()
    render(<GuestBatchModal isOpen setIsOpen={setIsOpen} eventId="event-1" />)

    await uploadCsv(
      'nombre,apellido,correo,telefono,acompanantes,mesa,orden,rol\nAna,Garcia,ana@example.com,,1,Mesa 1,2,graduate\n'
    )
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/guests/batch', [
        expect.objectContaining({
          order: 2,
          role: 'graduate',
        }),
      ], expect.objectContaining({ timeout: 120_000 }))
    })
  })

  it('keeps legacy CSV role columns without public order', async () => {
    const setIsOpen = vi.fn()
    render(<GuestBatchModal isOpen setIsOpen={setIsOpen} eventId="event-1" />)

    await uploadCsv(
      'nombre,apellido,correo,telefono,acompanantes,mesa,rol\nAna,Garcia,ana@example.com,,1,Mesa 1,graduate\n'
    )
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/guests/batch', [
        expect.objectContaining({
          role: 'graduate',
        }),
      ], expect.objectContaining({ timeout: 120_000 }))
    })
    expect(api.post).toHaveBeenCalledWith(
      '/guests/batch',
      expect.arrayContaining([expect.not.objectContaining({ order: expect.any(Number) })]),
      expect.objectContaining({ timeout: 120_000 })
    )
  })

  it('keeps the modal open when the server does not confirm created guests', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { status: 200, message: 'Guests created', data: [] },
    } as never)
    const setIsOpen = vi.fn()
    render(<GuestBatchModal isOpen setIsOpen={setIsOpen} eventId="event-1" />)

    fireEvent.change(inputByPlaceholder(document.body, 'Ana'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Garc'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'El servidor no confirmó la importación. Reintenta sin cerrar esta ventana.'
      )
    })
    expect(screen.getByRole('button', { name: /Importar 1 invitado/i })).toBeEnabled()
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining('agregado'))
  })

  it('rejects empty and oversized CSV files before reading them', () => {
    const setIsOpen = vi.fn()
    render(<GuestBatchModal isOpen setIsOpen={setIsOpen} eventId="event-1" />)
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    const empty = new File([], 'empty.csv', { type: 'text/csv' })
    const oversized = new File(['csv'], 'huge.csv', { type: 'text/csv' })
    Object.defineProperty(oversized, 'size', { value: GUEST_CSV_MAX_BYTES + 1 })

    fireEvent.change(input, { target: { files: [empty] } })
    fireEvent.change(input, { target: { files: [oversized] } })

    expect(toast.error).toHaveBeenCalledWith('El archivo CSV está vacío')
    expect(toast.error).toHaveBeenCalledWith('El CSV no puede superar los 2 MB')
  })
})
