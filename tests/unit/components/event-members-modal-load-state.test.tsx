import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const swr = vi.hoisted(() => ({ useSWR: vi.fn() }))

vi.mock('swr', () => ({ default: swr.useSWR }))
vi.mock('@/lib/api', () => ({ api: { put: vi.fn(), delete: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { EventMembersModal } from '@/components/events/event-members-modal'

type SwrState = { data?: unknown; error?: unknown; isLoading?: boolean; isValidating?: boolean; mutate?: () => void }

function mockMembers(members: SwrState) {
  swr.useSWR.mockImplementation((key: string | null) => {
    if (key && key.includes('/members') && key.includes('/events/')) {
      return { mutate: vi.fn(), isLoading: false, isValidating: false, ...members }
    }
    return { data: [], mutate: vi.fn(), isLoading: false, isValidating: false }
  })
}

function renderModal() {
  return render(<EventMembersModal eventId="evt-1" clientId="client-1" isOpen onClose={vi.fn()} />)
}

describe('EventMembersModal load states (EVT-14)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows an error with retry instead of "Sin restricciones" when the members load fails', () => {
    const mutate = vi.fn()
    mockMembers({ data: undefined, error: new Error('offline'), mutate })
    renderModal()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el equipo del evento.')
    expect(screen.queryByText(/Sin restricciones por evento/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(mutate).toHaveBeenCalledOnce()
  })

  it('shows a loading state, not "Sin restricciones", while members load', () => {
    mockMembers({ data: undefined, isLoading: true })
    renderModal()

    expect(screen.getByRole('status')).toHaveTextContent('Cargando equipo del evento')
    expect(screen.queryByText(/Sin restricciones por evento/)).not.toBeInTheDocument()
  })

  it('says "Sin restricciones" only after an empty list really loaded', () => {
    mockMembers({ data: [] })
    renderModal()

    expect(screen.getByText(/Sin restricciones por evento/)).toBeInTheDocument()
  })
})

// QA ROLES-90 / EVT-41 / ROLES-89: the add row overflowed the card at 1280px and
// the role names were in English.
describe('EventMembersModal layout and copy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets both selects shrink inside the card and labels roles in Spanish', () => {
    mockMembers({ data: [{ event_id: 'evt-1', user_id: 'u1', role: 'ANALYST', first_name: '', last_name: '', email: 'ana@example.com', created_at: '' }] })
    renderModal()

    const roleSelect = screen.getByLabelText('Rol en el evento')
    expect(roleSelect).toHaveClass('w-full', 'min-w-0')
    expect(screen.getByLabelText('Miembro de la organización')).toHaveClass('w-full', 'min-w-0')
    const labels = Array.from(roleSelect.querySelectorAll('option')).map((option) => option.textContent)
    expect(labels).toEqual(['Responsable del evento', 'Gestor del evento', 'Editor', 'Check-in', 'Analista', 'Solo lectura'])
    expect(screen.getAllByText('Analista').length).toBeGreaterThanOrEqual(2)
    // A member without a name shows the email once, not " " plus the email.
    expect(screen.getAllByText('ana@example.com')).toHaveLength(1)
  })
})
