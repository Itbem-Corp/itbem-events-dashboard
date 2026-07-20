'use client'

import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { useEffect, useState } from 'react'

export function ApplicationSearchButton({
  compact = false,
  onIntent,
  onOpen,
}: {
  compact?: boolean
  onIntent: () => void
  onOpen: () => void
}) {
  const [shortcut, setShortcut] = useState('Ctrl K')

  useEffect(() => {
    if (/Mac|iPhone|iPad|iPod/i.test(navigator.platform)) setShortcut('⌘ K')
  }, [])

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={onIntent}
      onPointerDown={onIntent}
      onFocus={onIntent}
      aria-label="Buscar"
      className={
        compact
          ? 'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-interactive hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)'
          : 'flex min-h-10 items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:border-border-strong hover:bg-surface-interactive hover:text-ink sm:min-h-0 sm:px-3'
      }
    >
      <MagnifyingGlassIcon className={compact ? 'size-4 shrink-0' : 'size-4 sm:size-3.5'} />
      <span className={compact ? undefined : 'hidden sm:inline'}>{compact ? 'Buscar' : 'Buscar…'}</span>
      <kbd
        className={
          compact
            ? 'ml-auto rounded border border-border-subtle px-1 py-0.5 font-mono text-[9px] text-ink-muted'
            : 'hidden rounded border border-border-subtle bg-surface-raised px-1 py-0.5 font-mono text-[9px] text-ink-muted sm:inline'
        }
      >
        {shortcut}
      </kbd>
    </button>
  )
}
