'use client'

import type { AdminUserListItemResponse } from '@/models/User'

interface UserListActionsMenuProps {
  user: AdminUserListItemResponse
  canDelete: boolean
  onEdit: (user: AdminUserListItemResponse) => void
  onDelete: (user: AdminUserListItemResponse) => void
  onEditIntent?: () => void
  onDeleteIntent?: () => void
}

export function UserListActionsMenu({
  user,
  canDelete,
  onEdit,
  onDelete,
  onEditIntent,
  onDeleteIntent,
}: UserListActionsMenuProps) {
  return (
    <div
      role="group"
      aria-label={`Más acciones para ${user.first_name} ${user.last_name}`}
      className="absolute top-full right-0 z-30 mt-2 w-48 rounded-xl border border-border-subtle bg-surface-raised/95 p-1 shadow-[0_20px_60px_var(--app-shadow-strong)] backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={() => onEdit(user)}
        onFocus={onEditIntent}
        onPointerDown={onEditIntent}
        onPointerEnter={onEditIntent}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink"
      >
        Editar usuario
      </button>

      {canDelete && !user.is_root && user.clients === 0 && (
        <button
          type="button"
          onClick={() => onDelete(user)}
          onFocus={onDeleteIntent}
          onPointerDown={onDeleteIntent}
          onPointerEnter={onDeleteIntent}
          className="mt-1 flex w-full items-center gap-2.5 border-t border-border-subtle px-3 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-500/8 dark:text-red-400"
        >
          Eliminar usuario
        </button>
      )}
    </div>
  )
}
