'use client'

import type { Client } from '@/models/Client'
import { PlusIcon } from '@heroicons/react/20/solid'

interface ClientListActionsMenuProps {
  client: Client
  canHaveSubClients: boolean
  canManageMembers: boolean
  canEditOrganization: boolean
  canDeleteOrganization: boolean
  onAddSubClient: (client: Client) => void
  onManageMembers: (client: Client) => void
  onEdit: (client: Client) => void
  onDelete: (client: Client) => void
  onFormIntent?: () => void
  onMembersIntent?: (client: Client) => void
  onDeleteIntent?: () => void
}

export function ClientListActionsMenu({
  client,
  canHaveSubClients,
  canManageMembers,
  canEditOrganization,
  canDeleteOrganization,
  onAddSubClient,
  onManageMembers,
  onEdit,
  onDelete,
  onFormIntent,
  onMembersIntent,
  onDeleteIntent,
}: ClientListActionsMenuProps) {
  return (
    <div
      role="group"
      aria-label={`Más acciones para ${client.name}`}
      className="absolute top-full right-0 z-30 mt-2 w-52 rounded-xl border border-white/10 bg-surface/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      {canHaveSubClients && canEditOrganization && (
        <button
          type="button"
          onClick={() => onAddSubClient(client)}
          onFocus={onFormIntent}
          onPointerDown={onFormIntent}
          onPointerEnter={onFormIntent}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-white"
        >
          <PlusIcon className="size-4 text-ink-muted" />
          Agregar sub-cliente
        </button>
      )}
      {canManageMembers && (
        <button
          type="button"
          onClick={() => onManageMembers(client)}
          onFocus={() => onMembersIntent?.(client)}
          onPointerDown={() => onMembersIntent?.(client)}
          onPointerEnter={() => onMembersIntent?.(client)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-white"
        >
          Gestionar miembros
        </button>
      )}
      {canEditOrganization && (
        <button
          type="button"
          onClick={() => onEdit(client)}
          onFocus={onFormIntent}
          onPointerDown={onFormIntent}
          onPointerEnter={onFormIntent}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-white"
        >
          Editar organización
        </button>
      )}
      {canDeleteOrganization && (
        <button
          type="button"
          onClick={() => onDelete(client)}
          onFocus={onDeleteIntent}
          onPointerDown={onDeleteIntent}
          onPointerEnter={onDeleteIntent}
          className="mt-1 flex w-full items-center gap-2.5 border-t border-white/8 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/8"
        >
          Eliminar organización
        </button>
      )}
    </div>
  )
}
