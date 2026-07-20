'use client'

import { Avatar } from '@/components/avatar'
import { Dialog, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import type { OrganizationOption } from '@/components/workspace/organization-option'
import type { AccessProfile } from '@/lib/access-profile'
import type { DataErrorState } from '@/lib/swr-data-state'
import type { TenantConfig } from '@/lib/tenant-config'
import {
  BuildingOfficeIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  Square2StackIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

interface OrganizationSwitcherProps {
  open: boolean
  onClose: () => void
  tenant: Omit<TenantConfig, 'clientId'>
  accessProfile: AccessProfile
  currentClient: OrganizationOption | null
  clients: OrganizationOption[]
  clientsTotal: number
  search: string
  loading: boolean
  validating: boolean
  errorState: DataErrorState
  onSearchChange: (value: string) => void
  onRetry: () => void
  onPreloadOrganization: (clientId: string) => void
  onSelectOrganization: (client: OrganizationOption) => Promise<void>
  onSelectPlatform: () => void
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  PLATFORM: 'Plataforma',
  AGENCY: 'Agencia',
  CUSTOMER: 'Cliente',
}

export function OrganizationSwitcher({
  open,
  onClose,
  tenant,
  accessProfile,
  currentClient,
  clients,
  clientsTotal,
  search,
  loading,
  validating,
  errorState,
  onSearchChange,
  onRetry,
  onPreloadOrganization,
  onSelectOrganization,
  onSelectPlatform,
}: OrganizationSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const platformLabel = accessProfile.platformLevel === 'root_2' ? 'Centro de soporte' : 'Vista de plataforma'

  function closeDialog() {
    onClose()
    onSearchChange('')
  }

  async function completeSwitch(action: () => void | Promise<void>, id: string) {
    if (switchingId) return
    setSwitchingId(id)
    setSwitchError(null)
    try {
      await action()
    } catch {
      setSwitchError('No pudimos validar el acceso a ese espacio. Reintenta sin cerrar tu sesión.')
      setSwitchingId(null)
      return
    }
    onClose()
    onSearchChange('')
    // The dashboard home already reacts to workspace state. Replacing the
    // same URL forces an unnecessary RSC navigation and made switching feel
    // several seconds slower on the first interaction.
    if (pathname === '/') {
      setSwitchingId(null)
      return
    }
    startTransition(() => {
      router.replace('/')
      setSwitchingId(null)
    })
  }

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      size="xl"
      className="max-h-[min(760px,calc(100dvh-1rem))] overflow-hidden bg-[var(--app-surface-raised)]! p-0! ring-[var(--app-border-subtle)]!"
    >
      <div className="border-b border-border-subtle px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-(--tenant-accent) uppercase">
              {tenant.name}
            </p>
            <DialogTitle className="text-xl! tracking-[-0.025em]">Cambiar espacio de trabajo</DialogTitle>
            <DialogDescription className="max-w-md text-sm leading-5 text-ink-muted">
              Elige el contexto que quieres administrar. Los datos y permisos cambian sin cerrar tu sesión.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            aria-label="Cerrar selector"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-interactive hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        <div className="relative mt-5">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            autoFocus
            aria-label="Buscar organización"
            placeholder="Buscar por nombre o código"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-12 w-full rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-interactive)] pr-4 pl-10 text-sm text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] focus:border-(--tenant-accent) focus:ring-3 focus:ring-(--tenant-accent)/12"
          />
        </div>
      </div>

      <DialogBody className="m-0! max-h-[min(500px,55dvh)] overflow-y-auto px-3 py-3 sm:px-4">
        {accessProfile.canUsePlatformMode && (
          <button
            type="button"
            onClick={() => void completeSwitch(onSelectPlatform, 'platform')}
            disabled={Boolean(switchingId)}
            className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-surface-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/12 text-(--tenant-accent)">
              <Square2StackIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{platformLabel}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">Administración global de {tenant.name}</span>
            </span>
            {accessProfile.isPlatformContext && <CheckIcon className="size-5 text-(--tenant-accent)" />}
          </button>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-border-subtle px-3 pt-4 pb-2">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-ink-muted uppercase">Organizaciones</p>
          <p className="text-[11px] text-ink-muted" aria-live="polite">
            {clients.length} de {clientsTotal}
          </p>
        </div>

        {switchError && (
          <p className="mx-3 mb-2 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-xs text-red-700 dark:text-red-200" role="alert">
            {switchError}
          </p>
        )}

        {loading && !errorState && (
          <p className="px-3 py-8 text-center text-sm text-ink-muted">Cargando organizaciones…</p>
        )}

        {errorState && (
          <div className="mx-2 my-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-800 dark:border-amber-500/15 dark:bg-amber-500/[0.06] dark:text-amber-200">
            <p>
              {errorState === 'stale' ? 'Mostrando organizaciones guardadas.' : 'No pudimos cargar las organizaciones.'}
            </p>
            <button
              type="button"
              onClick={onRetry}
              disabled={validating}
              className="mt-2 font-semibold text-amber-900 hover:text-ink disabled:cursor-wait disabled:opacity-60 dark:text-amber-100 dark:hover:text-white"
            >
              {validating ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        )}

        {!loading && !errorState && clients.length === 0 && (
          <div className="px-4 py-10 text-center">
            <BuildingOfficeIcon className="mx-auto size-7 text-ink-muted" />
            <p className="mt-3 text-sm font-medium text-ink-muted">No encontramos organizaciones</p>
            <p className="mt-1 text-xs text-ink-muted">Prueba con otro nombre o código.</p>
          </div>
        )}

        <div className="space-y-1">
          {clients.map((client) => {
            const selected = accessProfile.isOrganizationContext && currentClient?.id === client.id
            const type = CLIENT_TYPE_LABELS[(client.client_type?.code ?? '').toUpperCase()] || 'Organización'
            return (
              <button
                type="button"
                key={client.id}
                onClick={() => void completeSwitch(() => onSelectOrganization(client), client.id)}
                onFocus={() => onPreloadOrganization(client.id)}
                onPointerEnter={() => onPreloadOrganization(client.id)}
                disabled={Boolean(switchingId)}
                className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-surface-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) disabled:cursor-wait disabled:opacity-60"
              >
                <Avatar
                  src={client.logo}
                  initials={(client.name || 'OR').substring(0, 2).toUpperCase()}
                  className="size-10 bg-surface-soft text-ink"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {client.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                    {type}
                    {client.access_role ? ` · ${client.access_role}` : ''}
                  </span>
                </span>
                {selected && <CheckIcon className="size-5 shrink-0 text-(--tenant-accent)" />}
              </button>
            )
          })}
        </div>
      </DialogBody>
    </Dialog>
  )
}
