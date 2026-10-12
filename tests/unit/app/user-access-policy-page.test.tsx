import UserAccessPage from '@/app/(app)/users/[id]/access/page'
import { isAccessPolicyDirty, readAccessPolicy } from '@/features/users/access-policy'
import { useStore } from '@/store/useStore'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get, put } }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'user-1' }), useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function respond(data: unknown) {
  return Promise.resolve({ data })
}

describe('access policy helpers', () => {
  it('reads the inherited mode instead of treating it as "no capabilities"', () => {
    expect(readAccessPolicy({ mode: 'inherited', is_active: true, capabilities: [] })).toEqual({
      mode: 'inherited',
      isActive: true,
      capabilities: [],
    })
  })

  it('is dirty only when the draft differs from what was loaded', () => {
    const loaded = { mode: 'explicit' as const, isActive: true, capabilities: ['a', 'b'] }
    expect(isAccessPolicyDirty(loaded, { isActive: true, capabilities: ['b', 'a'] })).toBe(false)
    expect(isAccessPolicyDirty(loaded, { isActive: false, capabilities: ['a', 'b'] })).toBe(true)
    expect(isAccessPolicyDirty(loaded, { isActive: true, capabilities: ['a'] })).toBe(true)
    expect(isAccessPolicyDirty(null, { isActive: true, capabilities: [] })).toBe(false)
  })
})

describe('UserAccessPage', () => {
  beforeEach(() => {
    get.mockReset()
    put.mockReset()
    useStore.setState({ user: { id: 'root', email: 'r@x.com', first_name: 'R', last_name: 'R', is_root: true, root_level: 1 } })
  })

  it('shows the inherited state and keeps Save disabled until something changes', async () => {
    get.mockReturnValue(respond({ mode: 'inherited', is_active: true, capabilities: [] }))
    render(<UserAccessPage />)

    expect(await screen.findByText('Heredado.')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Guardar cambios' })
    expect(save).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Ver auditoría' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver métricas' }))
    expect(save).toBeEnabled()
  })

  it('disables Save and offers a retry when the policy fails to load', async () => {
    get.mockReturnValueOnce(Promise.reject(new Error('offline')))
    render(<UserAccessPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la política de acceso')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: 'Ver métricas' })).not.toBeInTheDocument()

    get.mockReturnValueOnce(respond({ mode: 'explicit', is_active: true, capabilities: ['metrics:view'] }))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('checkbox', { name: 'Ver métricas' })).toBeChecked()
  })

  it('does not carry capabilities from one product tab to another', async () => {
    get.mockImplementation((path: string) =>
      path.includes('eventiapp')
        ? new Promise(() => undefined)
        : respond({ mode: 'explicit', is_active: true, capabilities: ['members:manage'] })
    )
    render(<UserAccessPage />)
    expect(await screen.findByRole('checkbox', { name: 'Administrar miembros' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'EventiApp' }))

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Administrar miembros' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    expect(put).not.toHaveBeenCalled()
  })

  it('saves only the edited product and switches to the explicit state', async () => {
    get.mockReturnValue(respond({ mode: 'inherited', is_active: true, capabilities: [] }))
    put.mockReturnValue(respond({ mode: 'explicit', is_active: true, capabilities: ['metrics:view'] }))
    render(<UserAccessPage />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Ver métricas' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(expect.stringContaining('itbem'), { is_active: true, capabilities: ['metrics:view'] })
    )
    expect(await screen.findByText('Política explícita.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  })
})
