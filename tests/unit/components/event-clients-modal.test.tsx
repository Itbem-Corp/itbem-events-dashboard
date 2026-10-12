import { EventClientsModal } from '@/components/events/event-clients-modal'
import { api } from '@/lib/api'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toast, swrData, globalMutate } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  swrData: new Map<string, unknown>(),
  globalMutate: vi.fn(),
}))

vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() } }))
vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherKey: (path: string | null) => path }))
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: <T,>(value: T) => value }))
vi.mock('swr', () => ({
  default: (key: string | null) => {
    if (!key) return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
    const entry = [...swrData.entries()].find(([prefix]) => key.startsWith(prefix))
    const value = entry?.[1]
    if (value instanceof Error) return { data: undefined, error: value, isLoading: false, mutate: vi.fn() }
    return { data: value, error: undefined, isLoading: false, mutate: vi.fn().mockResolvedValue(undefined) }
  },
  mutate: globalMutate,
}))

const ana = {
  user_id: 'u-ana',
  email: 'ana@ejemplo.mx',
  first_name: 'Ana',
  last_name: 'López',
  granted_at: '2026-10-01T12:00:00Z',
  granted_by_user_id: 'u-mgr',
}

const apiError = (status: number, error: string, data?: unknown) =>
  Object.assign(new Error('request failed'), {
    response: { status, data: { status, message: 'x', error, ...(data ? { data } : {}) } },
  })

function renderModal() {
  return render(<EventClientsModal eventId="evt-1" isOpen onClose={vi.fn()} />)
}

describe('EventClientsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrData.clear()
    swrData.set('/events/evt-1/clients/candidates', [
      {
        user_id: 'u-luis',
        email: 'luis@ejemplo.mx',
        first_name: 'Luis',
        last_name: 'Paz',
        assigned_events: 2,
        assigned_to_event: false,
      },
    ])
    swrData.set('/events/evt-1/clients/u-ana/assignments', {
      data: [
        { event_id: 'evt-1', name: 'Boda', event_date_time: '2026-12-01T00:00:00Z', timezone: 'UTC', is_active: true, assigned: true, can_manage: true },
        { event_id: 'evt-2', name: 'Fiesta', event_date_time: '2026-12-02T00:00:00Z', timezone: 'UTC', is_active: true, assigned: false, can_manage: true },
        { event_id: 'evt-3', name: 'Ajeno', event_date_time: '2026-12-03T00:00:00Z', timezone: 'UTC', is_active: true, assigned: false, can_manage: false },
      ],
      total: 3,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    swrData.set('/events/evt-1/clients', [ana])
  })

  it('lists clients with access and the intro copy', () => {
    renderModal()
    expect(screen.getByText('Clientes del evento')).toBeTruthy()
    expect(screen.getByText(/Los clientes ven solo los eventos que les asignes/)).toBeTruthy()
    expect(screen.getByText('Ana López')).toBeTruthy()
    expect(screen.getByText('ana@ejemplo.mx')).toBeTruthy()
    expect(screen.getByText(/^Desde /)).toBeTruthy()
  })

  it('confirms before revoking, then DELETEs and refreshes', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { data: { revoked: true } } })
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Confirmar quitar acceso' })
    expect(confirm.textContent).toContain(
      '¿Quitar el acceso de Ana López a este evento? Seguirá viendo los demás eventos que tenga asignados.'
    )
    expect(api.delete).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Quitar acceso' }))
    })
    expect(api.delete).toHaveBeenCalledWith('/events/evt-1/clients/u-ana')
    expect(globalMutate).toHaveBeenCalled()
  })

  it.each([
    ['created', { account: 'created', already_assigned: false }, 'success', 'Invitamos a nuevo@ejemplo.mx. Recibirá un correo para crear su contraseña.'],
    ['existing', { account: 'existing', already_assigned: false }, 'success', 'Nuevo Cliente podrá ver este evento al iniciar sesión.'],
    ['already assigned', { account: 'existing', already_assigned: true }, 'info', 'Nuevo Cliente ya tenía acceso a este evento.'],
  ])('new client: %s toast', async (_name, result, kind, message) => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        status: 201,
        message: 'Cliente asignado',
        data: {
          client: { ...ana, user_id: 'u-new', email: 'nuevo@ejemplo.mx', first_name: 'Nuevo', last_name: 'Cliente' },
          ...result,
        },
      },
    })
    renderModal()

    fireEvent.click(screen.getByRole('tab', { name: 'Nuevo cliente' }))
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'Nuevo@Ejemplo.mx ' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Cliente' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Invitar y asignar' }))
    })

    expect(api.post).toHaveBeenCalledWith('/events/evt-1/clients', {
      email: 'nuevo@ejemplo.mx',
      first_name: 'Nuevo',
      last_name: 'Cliente',
    })
    expect(toast[kind as 'success' | 'info']).toHaveBeenCalledWith(message)
  })

  it('assigns an existing candidate by user_id', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { status: 201, message: 'ok', data: { client: { ...ana, user_id: 'u-luis', first_name: 'Luis', last_name: 'Paz' }, account: 'existing', already_assigned: false } },
    })
    renderModal()

    expect(screen.getByText('2 eventos asignados')).toBeTruthy()
    expect(screen.getByText('¿No aparece? Escribe su correo en Nuevo cliente.')).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /Luis Paz/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Asignar a este evento' }))
    })
    expect(api.post).toHaveBeenCalledWith('/events/evt-1/clients', { user_id: 'u-luis' })
    expect(toast.success).toHaveBeenCalledWith('Luis Paz podrá ver este evento al iniciar sesión.')
  })

  it.each([
    [409, 'event_client_unavailable', 'No podemos asignar esta cuenta como cliente. Verifica el correo o contacta a soporte.'],
    [409, 'event_client_is_org_member', 'Esta persona pertenece o perteneció a la organización del evento. Gestiona su acceso desde Equipo.'],
    [409, 'event_client_self', 'No puedes asignarte a ti mismo como cliente.'],
    [429, '', 'Demasiados intentos. Espera un momento.'],
  ])('shows the Spanish message for %s %s', async (status, code, message) => {
    vi.mocked(api.post).mockRejectedValue(apiError(status, code))
    renderModal()

    fireEvent.click(screen.getByRole('tab', { name: 'Nuevo cliente' }))
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'x@ejemplo.mx' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Y' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Invitar y asignar' }))
    })

    expect(screen.getByRole('alert').textContent).toBe(message)
    expect(toast.error).toHaveBeenCalledWith(message)
  })

  it('maps a 404 on revoke to the not-found copy', async () => {
    vi.mocked(api.delete).mockRejectedValue(apiError(404, 'event_client_not_found'))
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar acceso' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Quitar acceso' }))
    })
    expect(toast.error).toHaveBeenCalledWith('Ese cliente ya no tiene acceso a este evento.')
  })

  it('resends the invitation', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { resent: true } } })
    renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reenviar invitación' }))
    })
    expect(api.post).toHaveBeenCalledWith('/events/evt-1/clients/u-ana/resend-invitation', {})
    expect(toast.success).toHaveBeenCalledWith('Reenviamos la invitación a ana@ejemplo.mx.')
  })

  it('renders nothing actionable when the feature is off (404 event_client_access_disabled)', () => {
    swrData.set('/events/evt-1/clients', apiError(404, 'event_client_access_disabled'))
    renderModal()
    expect(screen.getByText('Esta función todavía no está disponible.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Invitar y asignar' })).toBeNull()
  })

  describe('Gestionar eventos', () => {
    function openPanel() {
      renderModal()
      fireEvent.click(screen.getByRole('button', { name: 'Gestionar eventos' }))
    }

    it('disables events the manager cannot manage, with the explanation', () => {
      openPanel()
      const locked = screen.getByRole('checkbox', { name: /Ajeno/ }) as HTMLInputElement
      expect(locked.disabled).toBe(true)
      expect(screen.getByText('No puedes gestionar clientes en este evento')).toBeTruthy()
    })

    it('saves only the delta', async () => {
      vi.mocked(api.patch).mockResolvedValue({ data: { status: 200, message: 'ok', data: { assigned: ['evt-2'], unassigned: ['evt-1'], assigned_events: 1 } } })
      openPanel()

      const save = screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement
      expect(save.disabled).toBe(true)
      fireEvent.click(screen.getByRole('checkbox', { name: /Fiesta/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /Boda/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /Boda/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /Boda/ }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      })

      expect(api.patch).toHaveBeenCalledWith('/events/evt-1/clients/u-ana/assignments', {
        assign: ['evt-2'],
        unassign: ['evt-1'],
      })
      expect(toast.success).toHaveBeenCalledWith('Ana López tiene 1 evento asignado.')
    })

    it('keeps the panel open on 422 and marks the rejected events', async () => {
      vi.mocked(api.patch).mockRejectedValue(apiError(422, 'event_outside_organization', { event_ids: ['evt-2'] }))
      openPanel()
      fireEvent.click(screen.getByRole('checkbox', { name: /Fiesta/ }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      })

      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: /Fiesta/ }).getAttribute('aria-invalid')).toBe('true')
      )
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy()
      expect(toast.error).toHaveBeenCalledWith('Uno o más eventos no pertenecen a esta organización.')
    })
  })
})
