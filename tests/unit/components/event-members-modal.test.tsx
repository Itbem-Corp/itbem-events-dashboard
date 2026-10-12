import { EventMembersModal, eventMemberRoleOptions } from '@/components/events/event-members-modal'
import { api } from '@/lib/api'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { put: vi.fn(), delete: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))
vi.mock('swr', () => ({
  default: (key: string | null) => {
    if (!key) return { data: undefined, mutate: vi.fn() }
    if (key.includes('/members') && key.startsWith('/events/'))
      return {
        data: [{ event_id: 'evt-1', user_id: 'u-2', role: 'CHECKIN', first_name: 'Luis', last_name: 'Paz', email: 'luis@x.mx', created_at: '' }],
        mutate: vi.fn(),
      }
    return {
      data: [{ user_id: 'u-1', first_name: 'Ana', last_name: 'López', email: 'ana@x.mx', user: { is_active: true } }],
      mutate: vi.fn(),
    }
  },
}))

describe('EventMembersModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the Spanish event role labels', () => {
    const labels = Object.fromEntries(eventMemberRoleOptions.map((option) => [option.value, option.label]))
    expect(labels.EVENT_OWNER).toBe('Responsable del evento')
    expect(labels.ANALYST).toBe('Analista')
    expect(labels.VIEWER).toBe('Solo lectura')
    expect(eventMemberRoleOptions.find((option) => option.value === 'CHECKIN')?.description).toBe('Opera el check-in.')
    expect(JSON.stringify(eventMemberRoleOptions)).not.toMatch(/Owner del evento|Analyst|Viewer/)
  })

  it('shows an error toast when saving fails', async () => {
    vi.mocked(api.put).mockRejectedValueOnce({ response: { data: { status: 403, message: 'Access denied', error: 'x' } } })
    render(<EventMembersModal eventId="evt-1" clientId="org-1" isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Miembro de la organización'), { target: { value: 'u-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
  })

  it('shows an error toast when removing fails', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new Error(''))
    render(<EventMembersModal eventId="evt-1" clientId="org-1" isOpen onClose={vi.fn()} />)

    expect(screen.getByText('luis@x.mx')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No se pudo actualizar el acceso al evento'))
  })
})
