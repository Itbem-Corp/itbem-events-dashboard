import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  post: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div> },
}))
vi.mock('swr', () => ({
  default: () => ({ data: undefined }),
  mutate: vi.fn(() => Promise.resolve()),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ api: { put: mocks.put, post: mocks.post } }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))

import { EventFormModal } from '@/components/events/forms/event-form-modal'
import type { Event } from '@/models/Event'
import { useStore } from '@/store/useStore'

const event = {
  id: 'event-1',
  name: 'Boda de prueba',
  identifier: 'boda-de-prueba',
  client_id: 'org-a',
  is_active: true,
  event_date_time: '2026-12-10T18:00:00.000Z',
  timezone: 'America/Mexico_City',
  event_type_id: null,
} as unknown as Event

function conflict(error: string, message: string, status = 409) {
  return Object.assign(new Error('Request failed'), { response: { status, data: { status, message, error } } })
}

function renderForm() {
  return render(<EventFormModal isOpen setIsOpen={vi.fn()} event={event} />)
}

async function submit() {
  await waitFor(() => expect(screen.getByDisplayValue('Boda de prueba')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('submit-event-form'))
}

describe('EventFormModal backend field errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ currentClient: { id: 'org-a', name: 'Organización A' } as never, profileLoaded: true })
  })

  it('shows event_name_taken under the name field', async () => {
    mocks.put.mockRejectedValueOnce(conflict('event_name_taken', 'Ya existe un evento con ese nombre en esta organización.'))
    renderForm()
    await submit()

    expect(await screen.findByText('Ya existe un evento con ese nombre en esta organización.')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('shows event_identifier_taken under the URL field when editing', async () => {
    mocks.put.mockRejectedValueOnce(conflict('event_identifier_taken', 'Esa URL del evento ya está en uso. Elige otra.'))
    renderForm()
    await submit()

    const message = await screen.findByText('Esa URL del evento ya está en uso. Elige otra.')
    expect(message.closest('[data-slot="control"], div')?.parentElement?.textContent).toContain('URL del evento')
  })

  it('shows invalid_timezone under the timezone field', async () => {
    mocks.put.mockRejectedValueOnce(conflict('invalid_timezone', 'Zona horaria inválida', 400))
    renderForm()
    await submit()

    expect(await screen.findByText('Zona horaria inválida')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps the toast for other errors', async () => {
    mocks.put.mockRejectedValueOnce(conflict('', 'Algo falló', 500))
    renderForm()
    await submit()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Algo falló'))
  })
})
