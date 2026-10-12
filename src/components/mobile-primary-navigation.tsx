'use client'

import { Link } from '@/components/link'
import type { ApplicationRoute } from '@/lib/application-navigation'
import { useProductShell } from '@/products/core/product-context'
import {
  BuildingOfficeIcon,
  ChartBarSquareIcon,
  HomeIcon,
  SparklesIcon,
  Square2StackIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import clsx from 'clsx'

type PrimaryHref = Exclude<ApplicationRoute, '/audit'>

type MobilePrimaryNavigationFlags = {
  /** Inicio is shown unless the product's route policy removes it. */
  showHome?: boolean
  showEvents: boolean
  showMetrics: boolean
  showTeam: boolean
  showUsers: boolean
  showOrganizations: boolean
  showAutomation: boolean
}

interface MobilePrimaryNavigationProps extends MobilePrimaryNavigationFlags {
  pathname: string
  /** Keep the ITBEM platform directory distinct from Delivery clients on mobile too. */
  tenantCode?: string
  /** 'Mis eventos' for client-only accounts. */
  eventsLabel?: string
  onIntent: (href: PrimaryHref) => void
}

const PRIMARY_ITEMS = [
  { href: '/', label: 'Inicio', icon: HomeIcon, rootOnly: false },
  { href: '/events', label: 'Eventos', icon: Square2StackIcon, rootOnly: false },
  { href: '/metrics', label: 'Métricas', icon: ChartBarSquareIcon, rootOnly: false },
  { href: '/team', label: 'Equipo', icon: UsersIcon, rootOnly: false },
  { href: '/users', label: 'Usuarios', icon: UsersIcon, rootOnly: true },
  { href: '/clients', label: 'Clientes', mobileLabel: 'Orgs.', icon: BuildingOfficeIcon, rootOnly: true },
  { href: '/automation', label: 'Centro', icon: SparklesIcon, rootOnly: true },
] as const

export function mobilePrimaryNavigationItems({
  showHome = true,
  showEvents,
  showMetrics,
  showTeam,
  showUsers,
  showOrganizations,
  showAutomation,
}: MobilePrimaryNavigationFlags) {
  return PRIMARY_ITEMS.filter((item) =>
    item.href === '/'
      ? showHome
      : item.href === '/events'
        ? showEvents
        : item.href === '/metrics'
          ? showMetrics
          : item.href === '/team'
            ? showTeam
            : item.href === '/users'
              ? showUsers
              : item.href === '/clients'
                ? showOrganizations
                : showAutomation
  )
}

export function MobilePrimaryNavigation({
  pathname,
  tenantCode,
  eventsLabel = 'Eventos',
  onIntent,
  ...flags
}: MobilePrimaryNavigationProps) {
  const accessibleShell = Boolean(useProductShell()?.accessibleShell)
  const items = mobilePrimaryNavigationItems(flags)

  // A bar with a single destination only covers content: that destination is
  // already the page the user is on.
  if (accessibleShell && items.length < 2) return null

  return (
    <nav
      aria-label={accessibleShell ? 'Navegación inferior' : 'Navegación principal'}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] left-1/2 z-30 grid w-[calc(100%-1rem)] max-w-md -translate-x-1/2 rounded-2xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-raised)]/95 p-1 shadow-[0_8px_24px_var(--app-shadow-strong)] lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const { href, label: defaultLabel, icon: Icon } = item
        const baseLabel = href === '/events' ? eventsLabel : defaultLabel
        const label = href === '/clients' && tenantCode === 'itbem' ? 'Organizaciones' : baseLabel
        const compactLabel = href === '/clients' && tenantCode === 'itbem' ? ('mobileLabel' in item ? item.mobileLabel ?? label : label) : baseLabel
        const current = href === '/' ? pathname === '/' : pathname.startsWith(href)
        const accessibleLabel = href === '/automation' ? 'Centro de automatización' : label

        return (
          <Link
            key={href}
            href={href}
            aria-label={accessibleLabel}
            aria-current={current ? 'page' : undefined}
            onPointerEnter={() => onIntent(href)}
            onPointerDown={() => onIntent(href)}
            onFocus={() => onIntent(href)}
            className={clsx(
              `group relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl px-0.5 ${accessibleShell ? 'text-xs' : 'text-[10px]'} leading-none font-medium transition-[color,background-color,box-shadow,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) active:scale-[0.98] motion-reduce:transition-none max-[359px]:gap-0`,
              current
                ? 'bg-(--tenant-accent)/10 text-[var(--app-text-primary)] ring-1 ring-(--tenant-accent)/18'
                : 'text-[var(--app-text-secondary)] hover:bg-(--tenant-accent)/7 hover:text-[var(--app-text-primary)]'
            )}
          >
            {current && (
              <span
                aria-hidden="true"
                className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-(--tenant-accent) to-transparent"
              />
            )}
            <span
              className={clsx(
                'flex size-6 items-center justify-center rounded-lg transition-colors',
                current
                  ? 'bg-(--tenant-accent)/10 text-(--tenant-accent)'
                  : 'text-[var(--app-text-muted)] group-hover:text-[var(--app-text-primary)]'
              )}
            >
              <Icon aria-hidden="true" className="size-[1.15rem]" />
            </span>
            <span aria-hidden className="max-w-full truncate px-0.5 leading-none max-[359px]:sr-only">
              {compactLabel}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
