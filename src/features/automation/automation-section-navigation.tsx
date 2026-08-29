'use client'

import { Link } from '@/components/link'
import type { ApplicationRoute } from '@/lib/application-navigation'
import clsx from 'clsx'

type AutomationSection = {
  href: Extract<ApplicationRoute, `/automation${string}`>
  label: string
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
    label: 'Resultados',
    matches: (pathname) => pathname.startsWith('/automation/projects'),
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
]

export function AutomationSectionNavigation({
  pathname,
  onIntent,
}: {
  pathname: string
  onIntent: (href: ApplicationRoute) => void
}) {
  return (
    <nav
      aria-label="Secciones de automatización"
      className="relative mb-1 max-w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised p-1 shadow-sm lg:hidden"
    >
      <div className="grid grid-cols-4 gap-1">
        {sections.map((section) => {
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
                'flex min-h-11 min-w-0 items-center justify-center rounded-xl px-1.5 text-center text-[10px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) motion-reduce:transition-none sm:px-2 sm:text-xs',
                current
                  ? 'bg-(--tenant-accent)/10 text-(--tenant-accent) ring-1 ring-(--tenant-accent)/18'
                  : 'text-ink-secondary hover:bg-surface-soft hover:text-ink'
              )}
            >
              <span className="truncate whitespace-nowrap">{section.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
