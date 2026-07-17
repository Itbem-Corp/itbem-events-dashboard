'use client'

import { useColorTheme } from '@/components/theme/theme-provider'
import { MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useColorTheme()
  const nextTheme = theme === 'dark' ? 'claro' : 'oscuro'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Cambiar al tema ${nextTheme}`}
      title={`Cambiar al tema ${nextTheme}`}
      className={clsx(
        className,
        'group flex size-10 items-center justify-center rounded-xl border border-[var(--app-border-subtle)] bg-[var(--app-surface-interactive)] text-[var(--app-text-secondary)] shadow-sm transition-[border-color,background-color,color,transform] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-raised)] hover:text-[var(--app-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) active:scale-[0.97] motion-reduce:transition-none'
      )}
    >
      {theme === 'dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </button>
  )
}
