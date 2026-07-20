'use client'

import { ApplicationAccountMenu } from '@/components/account/application-account-menu'
import { Dropdown, DropdownButton } from '@/components/dropdown'
import { SidebarFooter, SidebarItem } from '@/components/sidebar'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { ApplicationSearchButton } from '@/components/ui/application-search-button'
import { LazyNotificationButton } from '@/components/ui/lazy-notification-button'
import UserAvatar, { type UserAvatarUser } from '@/components/ui/UserAvatar'
import { ChevronUpIcon } from '@heroicons/react/16/solid'
import { memo } from 'react'

export const ApplicationSidebarFooter = memo(function ApplicationSidebarFooter({ user, clearSession, onProfileIntent, onSearchIntent, onSearchOpen }: {
  user: UserAvatarUser | null
  clearSession: () => void
  onProfileIntent: () => void
  onSearchIntent: () => void
  onSearchOpen: () => void
}) {
  return (
    <SidebarFooter className="border-t border-border-subtle pt-4 max-lg:hidden dark:border-white/10">
      <div className="mb-2 flex items-center gap-2 px-2">
        <ApplicationSearchButton compact onOpen={onSearchOpen} onIntent={onSearchIntent} />
        <LazyNotificationButton />
        <ThemeToggle className="size-8" />
      </div>
      <Dropdown>
        <DropdownButton as={SidebarItem} aria-label="Abrir menú de cuenta" onFocus={onProfileIntent} onPointerDown={onProfileIntent} onPointerEnter={onProfileIntent}>
          <span className="flex min-w-0 items-center gap-3">
            <UserAvatar user={user} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user?.first_name} {user?.last_name}</span>
              <span className="block truncate text-xs text-ink-muted dark:text-ink-secondary">{user?.email}</span>
            </span>
          </span>
          <ChevronUpIcon />
        </DropdownButton>
        <ApplicationAccountMenu anchor="top start" clearSession={clearSession} onProfileIntent={onProfileIntent} />
      </Dropdown>
    </SidebarFooter>
  )
})
