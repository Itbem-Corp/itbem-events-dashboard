import { EventDetailGuestsPanel } from '@/components/events/event-detail-guests-panel'
import { initialEventDetailGuestsViewState } from '@/components/events/event-detail-guests-state'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ page: { data: [] as unknown[], total: 0, total_pages: 1 }, error: undefined as Error | undefined, loading: false, validating: false }))
vi.mock('swr', () => ({ default: () => ({ data: state.page, error: state.error, isLoading: state.loading, isValidating: state.validating, mutate: vi.fn() }), preload: vi.fn() }))
vi.mock('next/dynamic', () => ({ default: () => ({ eventId, setIsOpen, onSaved }: { eventId: string; setIsOpen: (open: boolean) => void; onSaved: (guest: unknown) => void }) => <div role="dialog">Formulario {eventId}<button onClick={() => setIsOpen(false)}>Cancelar</button><button onClick={() => onSaved({ id: '1', first_name: 'Ana', last_name: 'Pérez' })}>Guardar</button></div> }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherKey: (key: string) => key, useScopedFetcherScope: () => (key: string) => key }))

const summary = { total: 0, confirmed: 0, pending: 0, declined: 0, total_attendees: 0 }
function panel(options: { total?: number | null; search?: string; status?: string } = {}) {
  return <EventDetailGuestsPanel event={{ id: 'event-1', identifier: 'event' } as never} summary={options.total === null ? null : { ...summary, total: options.total ?? 0 }} viewState={{ ...initialEventDetailGuestsViewState, search: options.search ?? '', status: options.status ?? 'ALL' }} onViewStateChange={vi.fn()} onPublicContentChanged={vi.fn()} />
}

describe('guest empty state', () => {
  beforeEach(() => { state.page = { data: [], total: 0, total_pages: 1 }; state.error = undefined; state.loading = false; state.validating = false })
  it('shows exact copy once and opens the same event form as Agregar', () => {
    render(panel())
    expect(screen.getAllByText('Aún no hay invitados')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar el primer invitado' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Formulario event-1')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Formulario event-1')
  })
  it.each([{ total: 2 }, { total: null }, { search: 'Ana' }, { status: 'PENDING' }])('does not treat an unconfirmed or filtered page as an empty event: %o', (options) => {
    render(panel(options))
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })
  it('does not show the empty state during loading, validation or errors', () => {
    state.loading = true
    const { rerender } = render(panel())
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
    state.loading = false; state.validating = true
    rerender(panel())
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
    state.validating = false; state.error = new Error('offline')
    rerender(panel())
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })
})
