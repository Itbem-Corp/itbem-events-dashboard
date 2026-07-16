'use client'

import { Link } from '@/components/link'
import { BuildingOfficeIcon, HomeIcon, Square2StackIcon, UsersIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

type PrimaryHref = '/' | '/events' | '/team' | '/users' | '/clients'

interface MobilePrimaryNavigationProps {
  pathname: string
  showEvents: boolean
  showTeam: boolean
  showUsers: boolean
  showOrganizations: boolean
  onIntent: (href: PrimaryHref) => void
}

const PRIMARY_ITEMS = [
  { href: '/', label: 'Inicio', icon: HomeIcon, rootOnly: false },
  { href: '/events', label: 'Eventos', icon: Square2StackIcon, rootOnly: false },
  { href: '/team', label: 'Equipo', icon: UsersIcon, rootOnly: false },
  { href: '/users', label: 'Usuarios', icon: UsersIcon, rootOnly: true },
  { href: '/clients', label: 'Clientes', icon: BuildingOfficeIcon, rootOnly: true },
] as const

export function MobilePrimaryNavigation({
  pathname,
  showEvents,
  showTeam,
  showUsers,
  showOrganizations,
  onIntent,
}: MobilePrimaryNavigationProps) {
  const items = PRIMARY_ITEMS.filter((item) =>
    item.href === '/'
      ? true
      : item.href === '/events'
        ? showEvents
        : item.href === '/team'
          ? showTeam
          : item.href === '/users'
            ? showUsers
            : showOrganizations
  )

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-30 grid w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[1.35rem] border border-white/[0.12] bg-zinc-950/88 p-1.5 shadow-[0_20px_64px_rgba(0,0,0,0.52)] ring-1 ring-black/20 backdrop-blur-2xl lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ href, label, icon: Icon }) => {
        const current = href === '/' ? pathname === '/' : pathname.startsWith(href)

        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            onPointerEnter={() => onIntent(href)}
            onPointerDown={() => onIntent(href)}
            onFocus={() => onIntent(href)}
            className={clsx(
              'group relative flex min-h-13 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl px-1 text-[11px] font-medium transition-[color,background-color,box-shadow,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) active:scale-[0.98] motion-reduce:transition-none',
              current
                ? 'bg-gradient-to-b from-white/[0.13] to-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_22px_rgba(0,0,0,0.2)] ring-1 ring-white/[0.09]'
                : 'text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100'
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
                current ? 'bg-white/[0.06] text-(--tenant-accent)' : 'text-zinc-500 group-hover:text-zinc-300'
              )}
            >
              <Icon aria-hidden="true" className="size-[1.15rem]" />
            </span>
            <span className="max-w-full truncate leading-none">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
