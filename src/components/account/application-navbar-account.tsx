'use client'

import { ApplicationAccountMenu } from '@/components/account/application-account-menu'
import { Dropdown, DropdownButton } from '@/components/dropdown'
import { NavbarItem } from '@/components/navbar'
import UserAvatar, { type UserAvatarUser } from '@/components/ui/UserAvatar'
import { memo } from 'react'

export const ApplicationNavbarAccount = memo(function ApplicationNavbarAccount({ user, clearSession, onProfileIntent }: {
  user: UserAvatarUser | null
  clearSession: () => void
  onProfileIntent: () => void
}) {
  return (
    <Dropdown>
      <DropdownButton as={NavbarItem} aria-label="Abrir menú de cuenta" onFocus={onProfileIntent} onPointerDown={onProfileIntent} onPointerEnter={onProfileIntent}>
        <UserAvatar user={user} size="sm" />
      </DropdownButton>
      <ApplicationAccountMenu anchor="bottom end" clearSession={clearSession} onProfileIntent={onProfileIntent} />
    </Dropdown>
  )
})
