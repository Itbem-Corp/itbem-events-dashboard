import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserListActionsMenu } from '@/components/users/user-list-actions-menu'
import type { AdminUserListItemResponse } from '@/models/User'

const user: AdminUserListItemResponse = {
  id: 'user-001',
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: 'Lopez',
  is_active: true,
  is_root: false,
  clients: 0,
  created_at: '2026-01-01T00:00:00Z',
}

describe('UserListActionsMenu', () => {
  it('does not expose deletion to an operational root', () => {
    render(<UserListActionsMenu user={user} canDelete={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Editar usuario' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar usuario' })).not.toBeInTheDocument()
  })

  it('exposes deletion only when platform policy permits it', () => {
    const onDelete = vi.fn()
    render(<UserListActionsMenu user={user} canDelete onEdit={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario' }))
    expect(onDelete).toHaveBeenCalledWith(user)
  })
})
