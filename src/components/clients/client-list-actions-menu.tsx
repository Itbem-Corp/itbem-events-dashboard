'use client'

import type { Client } from '@/models/Client'
import { PlusIcon } from '@heroicons/react/20/solid'

interface ClientListActionsMenuProps {
  client: Client
  canHaveSubClients: boolean
  canManageMembers: boolean
  canEditOrganization: boolean
  canDeleteOrganization: boolean
  /** The backend refuses to delete an organization with sub-organizations. */
  hasChildren?: boolean
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
  hasChildren = false,
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
      className="absolute top-full right-0 z-30 mt-2 w-52 rounded-xl border border-border-subtle bg-surface-raised/95 p-1 shadow-[0_20px_60px_var(--app-shadow-strong)] backdrop-blur-xl"
    >
      {canHaveSubClients && canEditOrganization && (
        <button
          type="button"
          onClick={() => onAddSubClient(client)}
          onFocus={onFormIntent}
          onPointerDown={onFormIntent}
          onPointerEnter={onFormIntent}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink"
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
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink"
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
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink"
        >
          Editar organización
        </button>
      )}
      {canDeleteOrganization && hasChildren && (
        <div className="mt-1 border-t border-border-subtle px-3 py-2.5">
          <button
            type="button"
            disabled
            aria-describedby={`delete-blocked-${client.id}`}
            className="w-full cursor-not-allowed text-left text-sm text-ink-muted"
          >
            Eliminar organización
          </button>
          <p id={`delete-blocked-${client.id}`} className="mt-1 text-xs text-ink-muted">
            Tiene suborganizaciones. Elimínalas o muévelas primero.
          </p>
        </div>
      )}
      {canDeleteOrganization && !hasChildren && (
        <button
          type="button"
          onClick={() => onDelete(client)}
          onFocus={onDeleteIntent}
          onPointerDown={onDeleteIntent}
          onPointerEnter={onDeleteIntent}
          className="mt-1 flex w-full items-center gap-2.5 border-t border-border-subtle px-3 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-500/8 dark:text-red-400"
        >
          Eliminar organización
        </button>
      )}
    </div>
  )
}
