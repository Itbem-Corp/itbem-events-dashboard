'use client'

import { Link } from '@/components/link'
import type { ApplicationRoute } from '@/lib/application-navigation'
import clsx from 'clsx'

type AutomationSection = {
  href: Extract<ApplicationRoute, `/automation${string}`>
  label: string
  mobileLabel?: string
  accessibleLabel?: string
  matches: (pathname: string) => boolean
}

const sections: readonly AutomationSection[] = [
  {
    href: '/automation',
    label: 'Centro',
    matches: (pathname) => pathname === '/automation' || pathname.startsWith('/automation/work-items'),
  },
  {
    href: '/automation/projects',
    label: 'Proyectos',
    matches: (pathname) => pathname.startsWith('/automation/projects'),
  },
  {
    href: '/automation/agents',
    label: 'Agentes',
    matches: (pathname) => pathname.startsWith('/automation/agents'),
  },
  {
    href: '/automation/dispatch',
    label: 'Colas',
    accessibleLabel: 'Colas y despacho',
    matches: (pathname) => pathname.startsWith('/automation/dispatch'),
  },
  {
    href: '/automation/recurrences',
    label: 'Recurrentes',
    mobileLabel: 'Recur.',
    matches: (pathname) => pathname.startsWith('/automation/recurrences'),
  },
  {
    href: '/automation/clients',
    label: 'Portafolio',
    matches: (pathname) => pathname.startsWith('/automation/clients'),
  },
  {
    href: '/automation/costs',
    label: 'Costos',
    accessibleLabel: 'Uso y costos',
    matches: (pathname) => pathname.startsWith('/automation/costs'),
  },
  {
    href: '/automation/settings',
    label: 'Configuración',
    mobileLabel: 'Config.',
    accessibleLabel: 'Configuración de IA',
    matches: (pathname) => pathname.startsWith('/automation/settings'),
  },
]

export function AutomationSectionNavigation({
  pathname,
  onIntent,
  canManageConfiguration = false,
}: {
  pathname: string
  onIntent: (href: ApplicationRoute) => void
  canManageConfiguration?: boolean
}) {
  const visibleSections = canManageConfiguration ? sections : sections.filter((section) => section.href !== '/automation/settings')
  return (
    <nav
      aria-label="Secciones de automatización"
      className="relative mb-1 max-w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised p-1 shadow-sm lg:hidden"
    >
      <div className={`grid gap-1 ${canManageConfiguration ? 'grid-cols-8' : 'grid-cols-7'}`}>
        {visibleSections.map((section) => {
          const current = section.matches(pathname)
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={current ? 'page' : undefined}
              aria-label={section.accessibleLabel ?? section.label}
              onPointerEnter={() => onIntent(section.href)}
              onPointerDown={() => onIntent(section.href)}
              onFocus={() => onIntent(section.href)}
              className={clsx(
                'flex min-h-11 min-w-0 items-center justify-center rounded-xl px-1 text-center text-[10px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) motion-reduce:transition-none sm:px-2 sm:text-xs',
                current
                  ? 'bg-(--tenant-accent)/10 text-(--tenant-accent) ring-1 ring-(--tenant-accent)/18'
                  : 'text-ink-secondary hover:bg-surface-soft hover:text-ink'
              )}
            >
              <span className="max-w-full truncate whitespace-nowrap sm:hidden">{section.mobileLabel ?? section.label}</span>
              <span className="hidden max-w-full truncate whitespace-nowrap sm:inline">{section.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
