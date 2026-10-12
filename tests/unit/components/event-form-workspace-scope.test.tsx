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
import type { ApplicationSession } from '@/models/ApplicationSession'
import type { Event } from '@/models/Event'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'

const editorSession = {
  application: {
    id: 'application-eventiapp',
    code: 'eventiapp',
    name: 'EventiApp',
    product_label: 'Event operations',
    modules: ['home', 'events', 'metrics'],
    allows_platform_admin: true,
    is_active: true,
  },
  user: { id: 'editor', email: 'editor@example.test', first_name: 'Ana', last_name: 'Editora', is_root: false, root_level: 0 },
  organizations: [
    { id: 'org-a', name: 'Organización A', code: 'org-a', access_role: 'EDITOR', capabilities: ['events:view', 'events:manage', 'events:create'] },
  ],
  capabilities: ['events:view', 'events:manage', 'events:create'],
} as unknown as ApplicationSession

const event = {
  id: 'event-1',
  name: 'Boda de prueba',
  identifier: 'boda-de-prueba',
  client_id: 'org-a',
  is_active: true,
  event_date_time: '2026-12-10T18:00:00.000Z',
  timezone: 'America/Mexico_City',
  event_type_id: '',
} as unknown as Event

function renderInEventiApp(ui: ReactNode) {
  return render(<ProductProvider product={getProductManifest('eventiapp')}>{ui}</ProductProvider>)
}

describe('EventFormModal in the caller-access workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.put.mockResolvedValue({ data: { data: event } })
    useStore.getState().clearSession()
    // Members work without a selected organization in EventiApp.
    useStore.setState({ applicationSession: editorSession, user: editorSession.user, profileLoaded: true, currentClient: null })
  })

  it('never sends client_id when an event is edited without choosing an organization', async () => {
    renderInEventiApp(<EventFormModal isOpen setIsOpen={vi.fn()} event={event} />)

    await waitFor(() => expect(screen.getByDisplayValue('Boda de prueba')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('submit-event-form'))

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1))
    const [, payload] = mocks.put.mock.calls[0]
    expect(payload).not.toHaveProperty('client_id')
    expect(payload).toMatchObject({ name: 'Boda de prueba' })
  })

  it('still requires an organization to create an event', async () => {
    renderInEventiApp(<EventFormModal isOpen setIsOpen={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Ej. Boda García & López'), { target: { value: 'Evento nuevo' } })
    fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: '2026-12-10T18:00' } })
    fireEvent.click(screen.getByTestId('submit-event-form'))

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Selecciona una organizacion para crear el evento')
    )
    expect(mocks.post).not.toHaveBeenCalled()
  })
})
