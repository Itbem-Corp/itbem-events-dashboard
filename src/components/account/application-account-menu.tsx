'use client'

import { DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { ArrowRightStartOnRectangleIcon, UserCircleIcon } from '@heroicons/react/16/solid'
import { endSession } from '@/lib/end-session'

export function ApplicationAccountMenu({ anchor, clearSession, onProfileIntent }: {
  anchor: 'top start' | 'bottom end'
  clearSession: () => void
  onProfileIntent: () => void
}) {
  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="/settings/profile" onFocus={onProfileIntent} onPointerDown={onProfileIntent} onPointerEnter={onProfileIntent}>
        <UserCircleIcon />
        <DropdownLabel>Mi perfil</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={() => { void endSession(clearSession) }}>
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>Cerrar sesión</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}
