import { ClientListActionsMenu } from '@/components/clients/client-list-actions-menu'
import { InviteForm } from '@/components/clients/client-members-modal'
import { ClientFormModal } from '@/components/clients/forms/client-form-modal'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post, put } = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { post, put } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('swr', () => ({
  default: () => ({
    data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Agencia', code: 'AGENCY' }],
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  }),
  mutate: vi.fn(),
}))
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial: _i, animate: _a, exit: _e, ...props }: HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

const client = {
  id: 'client-1',
  name: 'Organización demo',
  code: 'demo',
  client_type_id: '11111111-1111-4111-8111-111111111111',
  client_type: { id: '11111111-1111-4111-8111-111111111111', name: 'Agencia', code: 'AGENCY', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const callbacks = { onAddSubClient: vi.fn(), onManageMembers: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() }

describe('organization delete guard (ADM-6)', () => {
  it('disables delete and explains why when the organization has children', () => {
    render(
      <ClientListActionsMenu client={client} canHaveSubClients canManageMembers canEditOrganization canDeleteOrganization hasChildren {...callbacks} />
    )
    const button = screen.getByRole('button', { name: 'Eliminar organización' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Tiene suborganizaciones. Elimínalas o muévelas primero.')
  })

  it('keeps delete available for an organization without children', () => {
    render(
      <ClientListActionsMenu client={client} canHaveSubClients canManageMembers canEditOrganization canDeleteOrganization {...callbacks} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar organización' }))
    expect(callbacks.onDelete).toHaveBeenCalledWith(client)
  })
})

describe('organization type on edit (ADM-5)', () => {
  it('shows the type read-only and does not send it on update', async () => {
    put.mockResolvedValue({ data: client })
    render(<ClientFormModal isOpen setIsOpen={vi.fn()} client={client} />)

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Agencia')).toBeDisabled()
    expect(screen.getByText('El tipo no se puede cambiar después de crear la organización.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    const body = put.mock.calls[0][1] as FormData
    expect(body.has('client_type_id')).toBe(false)
  })
})

describe('invite existing member (ADM-13)', () => {
  beforeEach(() => post.mockReset())

  it('sends one invitation for a burst of Enter presses', async () => {
    let resolve!: () => void
    post.mockReturnValue(new Promise<void>((done) => (resolve = done)))
    render(
      <InviteForm
        clientId="client-1"
        roles={[{ id: 'role-1', name: 'Administrador', code: 'ADMIN' } as never]}
        onDone={vi.fn()}
      />
    )
    const input = screen.getByRole('textbox', { name: 'Correo electrónico' })
    fireEvent.change(input, { target: { value: 'ana@example.com' } })

    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: /Invitar|Enviando/ }))

    expect(post).toHaveBeenCalledTimes(1)
    resolve()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Invitar' })).toBeEnabled())
  })
})

describe('Root 2 member management (API-4)', () => {
  it('offers member management to every platform root, not only Root 1', async () => {
    const { readFileSync } = await import('node:fs')
    const page = readFileSync('src/app/(app)/clients/page.tsx', 'utf8')
    expect(page).toContain("canAssignMembers || Boolean(user?.is_root) || roleCode === 'OWNER' || roleCode === 'ADMIN'")
  })
})
