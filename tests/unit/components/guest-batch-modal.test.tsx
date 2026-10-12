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
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
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
    expect(inputByPlaceholder(document.body, 'Nombre').value).toBe('Ana')
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

  it('shows neutral placeholders in empty cells, never sample data (GST-27)', () => {
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)
    const placeholders = Array.from(document.body.querySelectorAll('input')).map((input) => input.placeholder)
    expect(placeholders).toEqual(expect.arrayContaining(['Nombre', 'Apellido', 'Correo', 'Teléfono']))
    expect(placeholders.join('|')).not.toMatch(/Ana|García|@ejemplo|\+52/)
    expect(screen.getAllByLabelText('Correo electrónico').length).toBeGreaterThan(0)
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

    fireEvent.change(inputByPlaceholder(document.body, 'Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getAllByLabelText('Rol público')[0], { target: { value: 'graduate' } })
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

    fireEvent.change(inputByPlaceholder(document.body, 'Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getAllByLabelText('Rol público')[0], { target: { value: 'host' } })
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

    fireEvent.change(inputByPlaceholder(document.body, 'Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getAllByLabelText('Orden público')[0], { target: { value: '2' } })
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

    fireEvent.change(inputByPlaceholder(document.body, 'Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia' } })
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

  it('gives each imported guest room for themselves plus their companions (GST-2)', async () => {
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    await uploadCsv('nombre,apellido,correo,telefono,acompanantes\nAna,Garcia,ana@example.com,,1\n')
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/guests/batch',
        [expect.objectContaining({ guests_count: 2, max_guests: 2 })],
        expect.anything()
      )
    })
    expect(api.post).toHaveBeenCalledWith(
      '/guests/batch',
      [expect.not.objectContaining({ table_number: expect.anything() })],
      expect.anything()
    )
  })

  it('imports a Windows-1252 semicolon file and keeps a header-less first row (GST-12)', async () => {
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    // "Ana;Peña;;;0\nLuis;Pérez;;;2\n" encoded as Windows-1252 (ñ = 0xF1, é = 0xE9).
    const encoded = new Uint8Array([
      ...Array.from('Ana;Pe', (c) => c.charCodeAt(0)), 0xf1, ...Array.from('a;;;0\nLuis;P', (c) => c.charCodeAt(0)),
      0xe9, ...Array.from('rez;;;2\n', (c) => c.charCodeAt(0)),
    ])
    fireEvent.change(input, { target: { files: [new File([encoded], 'guests.csv', { type: 'text/csv' })] } })

    await waitFor(() => expect(screen.getByRole('button', { name: /Importar 2 invitados/i })).toBeInTheDocument())
    expect(screen.getAllByDisplayValue('Peña').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Importar 2 invitados/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/guests/batch',
        [
          expect.objectContaining({ first_name: 'Ana', last_name: 'Peña', max_guests: 1 }),
          expect.objectContaining({ first_name: 'Luis', last_name: 'Pérez', max_guests: 3 }),
        ],
        expect.anything()
      )
    })
  })

  it('reports invalid rows with their file line in Spanish and does not send them (GST-13)', async () => {
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    await uploadCsv('nombre,apellido,correo\nAna,Garcia,ana@example.com\nLuis,Perez,no-es-correo\n')
    fireEvent.click(screen.getByRole('button', { name: /Importar 2 invitados/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Fila 3 del archivo: Correo inválido')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('reuses the idempotency key when the same import is retried after a timeout (GST-13)', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(inputByPlaceholder(document.body, 'Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no se duplicarán'))
    })

    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))

    const firstKey = vi.mocked(api.post).mock.calls[0][2]?.headers?.['Idempotency-Key']
    const secondKey = vi.mocked(api.post).mock.calls[1][2]?.headers?.['Idempotency-Key']
    expect(firstKey).toEqual(expect.any(String))
    expect(secondKey).toBe(firstKey)
  })

  it('uses a new idempotency key when the rows change between attempts', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 500, data: { message: 'Error creating guests' } } })
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(inputByPlaceholder(document.body, 'Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No pudimos crear los invitados y no se guardó ninguno. Revisa los datos y reintenta.')
    })

    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia Lopez' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))

    const firstKey = vi.mocked(api.post).mock.calls[0][2]?.headers?.['Idempotency-Key']
    const secondKey = vi.mocked(api.post).mock.calls[1][2]?.headers?.['Idempotency-Key']
    expect(secondKey).not.toBe(firstKey)
  })

  it('marks the row the server refused with its Spanish message (400 Invitado N)', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          status: 400,
          error: 'invalid_party_size',
          message: 'Invitado 2: Los asistentes admiten hasta 100 personas.',
        },
      },
    })
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    await uploadCsv('nombre,apellido,acompanantes\nAna,Garcia,0\nLuis,Perez,1\n')
    fireEvent.click(screen.getByRole('button', { name: /Importar 2 invitados/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Fila 3 del archivo: Los asistentes admiten hasta 100 personas.')
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Fila 3 del archivo: Los asistentes admiten hasta 100 personas.')
  })

  it('accepts up to 99 companions, the server party limit of 100', async () => {
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    await uploadCsv('nombre,apellido,acompanantes\nAna,Garcia,99\n')
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/guests/batch',
        [expect.objectContaining({ guests_count: 100, max_guests: 100 })],
        expect.anything()
      )
    })
  })

  it('warns about guests already in the event before sending and can skip them (GST-21)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        data: [
          { id: 'g-1', first_name: 'Ana', last_name: 'García', email: 'ANA@example.com', phone: "'+52 55 9999 0000" },
        ],
      },
    })
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    await uploadCsv(
      '﻿Nombre,Apellido,Email,Teléfono,Mesa,Asistentes,Acompañantes,Estado\n' +
        "Ana,García,ana@example.com,'+52 55 9999 0000,,2,1,PENDIENTE\n" +
        'Luis,Pérez,luis@example.com,,,1,0,PENDIENTE\n'
    )

    const warning = await screen.findByTestId('guest-import-duplicates')
    expect(warning).toHaveTextContent('1 fila parece repetir un invitado')
    expect(warning).toHaveTextContent('Fila 2 del archivo: Ana García — ya está en el evento (mismo correo)')
    // The export's formula guard is gone from the phone.
    expect(inputByPlaceholder(document.body, 'Teléfono').value).toBe('+52 55 9999 0000')

    fireEvent.click(screen.getByRole('button', { name: /Importar 2 invitados/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('1 fila repite invitados')))
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Omitir la fila repetida' }))
    expect(screen.queryByTestId('guest-import-duplicates')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/guests/batch',
        [expect.objectContaining({ first_name: 'Luis', last_name: 'Pérez' })],
        expect.anything()
      )
    })
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('creates repeated guests anyway on a second click', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: [{ id: 'g-1', first_name: 'Ana', last_name: 'Garcia', email: '', phone: '' }] },
    })
    render(<GuestBatchModal isOpen setIsOpen={vi.fn()} eventId="event-1" />)

    fireEvent.change(inputByPlaceholder(document.body, 'Nombre'), { target: { value: 'Ana' } })
    fireEvent.change(inputByPlaceholder(document.body, 'Apellido'), { target: { value: 'Garcia' } })
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('1 fila repite invitados')))
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Importar 1 invitado/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
  })
})
