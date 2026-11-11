import { EventDetailGuestsPanel } from '@/components/events/event-detail-guests-panel'
import { initialEventDetailGuestsViewState } from '@/components/events/event-detail-guests-state'
import { api } from '@/lib/api'
import { guestStatusesPath } from '@/lib/api-paths'
import type { CheckinGuestsPageResponse, Guest } from '@/models/Guest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  page: undefined as CheckinGuestsPageResponse | undefined,
  error: undefined as Error | undefined,
  loading: false,
  validating: false,
  requests: vi.fn(),
}))

// Replace transport/cache boundaries; retain the real form, validation,
// onSaved handler and upsertGuestCacheValue.
vi.mock('swr', async () => {
  const { useCallback, useState } = await import('react')
  return {
    default: function useGuestData(key: string) {
      const [, renderMutation] = useState(0)
      const mutate = useCallback(async (update?: (current: unknown) => unknown) => {
        if (update) {
          state.page = update(state.page) as CheckinGuestsPageResponse
          renderMutation((revision) => revision + 1)
        }
      }, [])
      state.requests(key)
      return key === guestStatusesPath()
        ? { data: [], mutate }
        : { data: state.page, error: state.error, isLoading: state.loading, isValidating: state.validating, mutate }
    },
    mutate: vi.fn(),
    preload: vi.fn(),
  }
})
vi.mock('next/dynamic', async () => {
  const { lazy, Suspense } = await import('react')
  return {
    default: (load: () => Promise<ComponentType<Record<string, unknown>>>) => {
      const Component = lazy(async () => ({ default: await load() }))
      return function DynamicComponent(props: Record<string, unknown>) {
        return <Suspense fallback={null}><Component {...props} /></Suspense>
      }
    },
  }
})
vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }))
vi.mock('@/lib/fetcher', () => ({ fetcher: vi.fn() }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherKey: (key: string) => key, useScopedFetcherScope: () => (key: string) => key }))

const summary = { total: 0, confirmed: 0, pending: 0, declined: 0, total_attendees: 0 }
const savedGuest = { id: 'guest-1', event_id: 'event-1', first_name: 'Ana', last_name: 'Garcia', guests_count: 1, status_id: 'pending' } as Guest
function panel(options: { total?: number | null; search?: string; status?: string; canManage?: boolean } = {}) {
  return <EventDetailGuestsPanel canManage={options.canManage ?? true} event={{ id: 'event-1', identifier: 'event' } as never} summary={options.total === null ? null : { ...summary, total: options.total ?? 0 }} viewState={{ ...initialEventDetailGuestsViewState, search: options.search ?? '', status: options.status ?? 'ALL' }} onViewStateChange={vi.fn()} onPublicContentChanged={vi.fn()} />
}
async function openForm(name = 'Agregar el primer invitado') {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name }))
  await screen.findByRole('dialog', { name: 'Nuevo invitado' })
  return user
}

describe('guest empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.page = { data: [], total: 0, total_pages: 1, page: 1, page_size: 50 }
    state.error = undefined
    state.loading = false
    state.validating = false
    vi.mocked(api.post).mockResolvedValue({ data: { data: savedGuest } })
  })

  it('shows exact copy once and both triggers open the existing form', async () => {
    render(panel())
    expect(screen.getAllByText('Aún no hay invitados')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Agregar el primer invitado' })).toHaveLength(1)
    const user = await openForm()
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Aún no hay invitados')).toBeInTheDocument()
    await openForm('Agregar')
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('saves the first guest through the existing form and replaces the empty state with the list', async () => {
    render(panel())
    const user = await openForm()
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Garcia')
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/guests', expect.objectContaining({ event_id: 'event-1', first_name: 'Ana', last_name: 'Garcia' })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Ana Garcia')).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar el primer invitado' })).not.toBeInTheDocument()
  })

  it('retains form values after a failed save', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('offline'))
    render(panel())
    const user = await openForm()
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Garcia')
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana')
    expect(screen.getByLabelText('Apellido')).toHaveValue('Garcia')
  })

  it('does not expose triggers, a form or the keyboard shortcut without guest:manage', () => {
    render(panel({ canManage: false }))
    expect(screen.queryByRole('button', { name: /^Agregar/ })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'n' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(state.requests).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it.each([{ search: 'Ana', total: 2 }, { status: 'PENDING', total: 0 }, { search: ' ', total: 0 }])('shows filtered no-results for %o', (options) => {
    render(panel(options))
    expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeInTheDocument()
    expect(screen.getByText('Ningún invitado coincide con los filtros aplicados.')).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })

  it.each([null, 0])('preserves the generic fallback without filters when total is %s and validation is pending', (total) => {
    state.validating = true
    render(panel({ total }))
    expect(screen.getByRole('heading', { name: 'Sin invitados' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar invitado' })).toBeInTheDocument()
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })

  it('keeps an unconfirmed total distinct from filtered results', () => {
    render(panel({ total: null }))
    expect(screen.getByRole('heading', { name: 'Sin invitados' })).toBeInTheDocument()
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })

  it('does not infer an empty event from a vacant page of an existing collection', () => {
    render(panel({ total: 2 }))
    expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })

  it('renders existing guests instead of the empty state', () => {
    state.page = { ...state.page!, data: [savedGuest], total: 1 }
    render(panel({ total: 1 }))
    expect(screen.getByText('Ana Garcia')).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })

  it('preserves fatal errors and never presents them as an empty event', () => {
    state.page = undefined
    state.error = new Error('offline')
    render(panel())
    expect(screen.getByText('No pudimos cargar los invitados')).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
  })

  it('keeps the status region mounted through loading and preserves heading semantics', () => {
    state.loading = true
    const { rerender } = render(panel())
    const status = screen.getByRole('status', { name: 'Estado de invitados' })
    expect(status).toBeEmptyDOMElement()
    expect(screen.queryByText('Aún no hay invitados')).not.toBeInTheDocument()
    state.loading = false
    rerender(panel())
    expect(screen.getByRole('status', { name: 'Estado de invitados' })).toBe(status)
    expect(status).toHaveTextContent('La lista de invitados está vacía.')
    expect(screen.getByRole('heading', { name: 'Aún no hay invitados' })).toBeInTheDocument()
    expect(status.querySelector('button')).toBeNull()
    state.validating = true
    rerender(panel())
    expect(status).toHaveTextContent('La lista de invitados está vacía.')
  })
})
