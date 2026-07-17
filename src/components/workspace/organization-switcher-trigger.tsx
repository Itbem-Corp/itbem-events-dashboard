'use client'

import { Avatar } from '@/components/avatar'
import type { OrganizationOption } from '@/components/workspace/organization-option'
import type { AccessProfile } from '@/lib/access-profile'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

interface OrganizationSwitcherTriggerProps {
  accessProfile: AccessProfile
  currentClient: OrganizationOption | null
  onOpen: () => void
  onOpenIntent: () => void
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  PLATFORM: 'Plataforma',
  AGENCY: 'Agencia',
  CUSTOMER: 'Cliente',
}

export function OrganizationSwitcherTrigger({
  accessProfile,
  currentClient,
  onOpen,
  onOpenIntent,
}: OrganizationSwitcherTriggerProps) {
  const platformLabel = accessProfile.platformLevel === 'root_2' ? 'Centro de soporte' : 'Vista de plataforma'
  const activeLabel = accessProfile.isPlatformContext ? platformLabel : currentClient?.name || 'Elegir organización'
  const activeDescription = accessProfile.isPlatformContext
    ? 'Todas las organizaciones'
    : currentClient?.client_type?.code
      ? CLIENT_TYPE_LABELS[currentClient.client_type.code.toUpperCase()] || 'Organización'
      : 'Organización activa'

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onFocus={onOpenIntent}
      onPointerEnter={onOpenIntent}
      aria-haspopup="dialog"
      className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border-subtle bg-canvas/[0.025] px-3 py-2.5 text-left transition-[border-color,background-color,transform] hover:border-border-subtle hover:bg-canvas/[0.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) active:scale-[0.99] motion-reduce:transition-none dark:border-white/[0.09] dark:bg-white/[0.035] dark:hover:border-white/[0.16] dark:hover:bg-white/[0.06]"
    >
      <Avatar
        src={currentClient?.logo}
        initials={currentClient?.name?.substring(0, 2).toUpperCase() || (accessProfile.isPlatformContext ? 'PL' : 'OR')}
        className="size-10 bg-(--tenant-accent) text-ink"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
          {activeDescription}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-ink dark:text-white">{activeLabel}</span>
      </span>
      <ChevronDownIcon className="size-4 shrink-0 text-ink-muted transition-transform group-hover:text-ink-secondary" />
    </button>
  )
}
