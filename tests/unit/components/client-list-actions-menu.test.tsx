import { ClientListActionsMenu } from '@/components/clients/client-list-actions-menu'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const client = {
  id: 'client-1',
  name: 'Organización demo',
  code: 'demo',
  client_type_id: 'type-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const callbacks = {
  onAddSubClient: vi.fn(),
  onManageMembers: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

describe('ClientListActionsMenu', () => {
  it('only exposes actions granted by organization capability', () => {
    render(
      <ClientListActionsMenu
        client={client}
        canHaveSubClients
        canManageMembers
        canEditOrganization={false}
        canDeleteOrganization={false}
        {...callbacks}
      />
    )

    expect(screen.getByRole('button', { name: 'Gestionar miembros' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar sub-cliente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar organización' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar organización' })).not.toBeInTheDocument()
  })
})
