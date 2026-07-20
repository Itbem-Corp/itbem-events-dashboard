'use client'

import { fetcher } from '@/lib/fetcher'
import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { scopedEventsPagePath } from '@/lib/api-paths'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { preload } from 'swr'

const loadCommandPalette = () => import('@/components/ui/command-palette')

function CommandPaletteFallback() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preparando búsqueda global"
      aria-busy="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-sm"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-canvas shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <MagnifyingGlassIcon className="size-5 text-ink-muted" />
          <div className="h-4 w-44 animate-pulse rounded bg-surface-raised" />
        </div>
        <div className="space-y-2 p-3" role="status" aria-live="polite">
          <span className="sr-only">Preparando búsqueda…</span>
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <div className="size-9 animate-pulse rounded-lg bg-surface" />
              <div className="space-y-2">
                <div className="h-3 w-36 animate-pulse rounded bg-surface-raised" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-surface" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const CommandPalette = dynamic(() => loadCommandPalette().then((module) => module.CommandPalette), {
  ssr: false,
  loading: CommandPaletteFallback,
})

const PRELOAD_EVENT = 'eventi:command-palette:preload'
let paletteOpen = false
const paletteListeners = new Set<() => void>()

function setPaletteOpen(open: boolean) {
  paletteOpen = open
  for (const listener of paletteListeners) listener()
}

function subscribePalette(listener: () => void) {
  paletteListeners.add(listener)
  return () => paletteListeners.delete(listener)
}

export function openApplicationCommandPalette() {
  setPaletteOpen(true)
}

export function preloadApplicationCommandPalette() {
  window.dispatchEvent(new Event(PRELOAD_EVENT))
}

export function ApplicationCommandPaletteController({
  clientId,
  enabled,
  isRoot,
}: {
  clientId?: string
  enabled: boolean
  isRoot: boolean
}) {
  const open = useSyncExternalStore(subscribePalette, () => paletteOpen, () => false)
  const scopeFetcherKey = useScopedFetcherScope()

  const preloadResources = useCallback(() => {
    const eventsPath = enabled
      ? scopedEventsPagePath(clientId, isRoot, { page: 1, page_size: 6, filter: 'all' })
      : null
    const tasks: Promise<unknown>[] = [loadCommandPalette()]
    if (eventsPath) tasks.push(Promise.resolve(preload(scopeFetcherKey(eventsPath), fetcher)))
    void Promise.all(tasks).catch(() => undefined)
  }, [clientId, enabled, isRoot, scopeFetcherKey])

  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (!enabled || !(event.metaKey || event.ctrlKey) || event.key !== 'k') return
      event.preventDefault()
      preloadResources()
      setPaletteOpen(!paletteOpen)
    }
    window.addEventListener(PRELOAD_EVENT, preloadResources)
    window.addEventListener('keydown', handle)
    return () => {
      window.removeEventListener(PRELOAD_EVENT, preloadResources)
      window.removeEventListener('keydown', handle)
    }
  }, [enabled, preloadResources])

  return open ? (
    <CommandPalette open onClose={() => setPaletteOpen(false)} isRoot={isRoot} clientId={clientId} />
  ) : null
}
