'use client'

import { preloadEventWorkspace } from '@/components/events/preload-event-workspace'
import { useDebounce } from '@/hooks/useDebounce'
import { useScopedFetcherKey, useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { readApiData } from '@/lib/api-envelope'
import { scopedEventsPagePath, userSummaryPath, usersAllPath } from '@/lib/api-paths'
import { beginNavigationProgress } from '@/lib/navigation-progress'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import type { Event, EventListPage } from '@/models/Event'
import type { AdminUsersPageResponse } from '@/models/User'
import { XMarkIcon } from '@heroicons/react/16/solid'
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  Square2StackIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import { AnimatePresence, motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { preload } from 'swr'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string
  type: 'event' | 'user' | 'action'
  title: string
  subtitle?: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  color?: string
  onSelect?: () => void
  recordId?: string
  event?: Event
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  isRoot?: boolean
  clientId?: string
}

export function CommandPalette({ open, onClose, isRoot = false, clientId }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query.trim(), 180)
  const eventsKey = open
    ? scopedEventsPagePath(clientId, isRoot, {
        page: 1,
        page_size: 6,
        search: debouncedQuery,
        filter: 'all',
      })
    : null
  const usersKey =
    open && isRoot && debouncedQuery ? usersAllPath({ page: 1, page_size: 4, search: debouncedQuery }) : null
  const scopedEventsKey = useScopedFetcherKey(eventsKey)
  const scopedUsersKey = useScopedFetcherKey(usersKey)
  const scopeFetcherKey = useScopedFetcherScope()
  const {
    data: rawEvents,
    isLoading: eventsLoading,
    error: eventsError,
    mutate: retryEvents,
  } = useSWR<EventListPage>(scopedEventsKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const {
    data: rawUsers,
    isLoading: usersLoading,
    error: usersError,
    mutate: retryUsers,
  } = useSWR<AdminUsersPageResponse>(scopedUsersKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
    shouldRetryOnError: false,
  })
  const events = useMemo(() => readApiData<EventListPage | undefined>(rawEvents)?.data ?? [], [rawEvents])
  const users = useMemo(() => readApiData<AdminUsersPageResponse | undefined>(rawUsers)?.data ?? [], [rawUsers])
  const waitingForQuery = query.trim() !== debouncedQuery
  const remoteLoading = waitingForQuery || eventsLoading || Boolean(usersKey && usersLoading)

  const staticActions: CommandItem[] = useMemo(() => {
    const actions: CommandItem[] = [
      {
        id: 'new-event',
        type: 'action',
        title: 'Ir a Eventos',
        subtitle: 'Lista de todos los eventos',
        href: '/events',
        icon: Square2StackIcon,
        color: 'text-indigo-400',
      },
      {
        id: 'dashboard',
        title: 'Ir al Dashboard',
        type: 'action',
        subtitle: 'Inicio / resumen general',
        href: '/',
        icon: CalendarDaysIcon,
        color: 'text-violet-400',
      },
    ]

    if (isRoot) {
      actions.push({
        id: 'users',
        title: 'Ir a Usuarios',
        type: 'action',
        subtitle: 'Gestión de usuarios',
        href: '/users',
        icon: UsersIcon,
        color: 'text-amber-400',
      })
    }

    return actions
  }, [isRoot])

  const items = useMemo<CommandItem[]>(() => {
    const q = query.toLowerCase().trim()

    const eventItems: CommandItem[] = (waitingForQuery ? [] : events).map((e) => ({
      id: `event-${e.id}`,
      type: 'event' as const,
      title: e.name,
      subtitle: new Date(e.event_date_time).toLocaleDateString('es-MX', { dateStyle: 'medium' }),
      href: `/events/${e.id}`,
      icon: Square2StackIcon,
      color: e.is_active ? 'text-lime-400' : 'text-ink-muted',
      recordId: e.id,
      event: e,
    }))

    const userItems: CommandItem[] = (waitingForQuery ? [] : users).map((u) => ({
      id: `user-${u.id}`,
      type: 'user' as const,
      title: `${u.first_name} ${u.last_name}`,
      subtitle: u.email,
      href: `/users/${u.id}/clients`,
      icon: UsersIcon,
      color: 'text-ink-secondary',
      recordId: u.id,
    }))

    const actionItems = staticActions.filter(
      (a) => !q || a.title.toLowerCase().includes(q) || (a.subtitle ?? '').toLowerCase().includes(q)
    )

    if (!q) {
      // No query: show actions first, then recent events
      return [...actionItems, ...eventItems.slice(0, 5)]
    }

    return [...eventItems, ...userItems, ...actionItems]
  }, [query, events, users, staticActions, waitingForQuery])

  const selectItem = useCallback(
    (item: CommandItem) => {
      if (item.onSelect) {
        item.onSelect()
      } else if (item.href) {
        beginNavigationProgress()
        router.push(item.href)
      }
      onClose()
    },
    [router, onClose]
  )

  const preloadItem = useCallback(
    (item: CommandItem | undefined) => {
      if (!item?.href) return
      router.prefetch(item.href)

      if (item.type === 'event' && item.event) {
        void preloadEventWorkspace(item.event, scopeFetcherKey).catch(() => undefined)
      } else if (item.type === 'user' && item.recordId) {
        void preload(scopeFetcherKey(userSummaryPath(item.recordId)), fetcher).catch(() => undefined)
      }
    },
    [router, scopeFetcherKey]
  )

  // Reset on open
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(focusTimer)
  }, [open])

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function handle(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[activeIndex]
        if (item) selectItem(item)
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, items, activeIndex, selectItem, onClose])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
    preloadItem(items[activeIndex])
  }, [activeIndex, items, preloadItem])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-20 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-[0_24px_72px_var(--app-shadow-strong)]"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3.5">
              <MagnifyingGlassIcon className="size-5 shrink-0 text-ink-muted" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar eventos, usuarios, comandos…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
              />
              <div className="flex items-center gap-2">
                {query && (
                  <button onClick={() => setQuery('')} className="text-ink-muted hover:text-ink-secondary">
                    <XMarkIcon className="size-4" />
                  </button>
                )}
                <kbd className="hidden rounded border border-border-subtle bg-surface-raised/80 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted sm:block">
                  ESC
                </kbd>
              </div>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
              {remoteLoading && query ? (
                <div className="flex items-center gap-3 px-4 py-8" role="status" aria-label="Buscando">
                  <span className="size-4 animate-spin rounded-full border-2 border-indigo-400/25 border-t-indigo-400" />
                  <p className="text-sm text-ink-muted">Buscando en eventos y usuarios…</p>
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-ink-muted">Sin resultados para &quot;{query}&quot;</p>
                </div>
              ) : (
                <>
                  {!query && (
                    <p className="px-4 pb-1 text-[10px] font-semibold tracking-wider text-ink-muted uppercase">
                      Acceso rápido
                    </p>
                  )}
                  {items.map((item, index) => {
                    const Icon = item.icon
                    const isActive = index === activeIndex
                    return (
                      <button
                        key={item.id}
                        data-index={index}
                        onClick={() => selectItem(item)}
                        onFocus={() => preloadItem(item)}
                        onPointerDown={() => preloadItem(item)}
                        onMouseEnter={() => {
                          setActiveIndex(index)
                          preloadItem(item)
                        }}
                        className={[
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          isActive ? 'bg-surface-interactive' : 'hover:bg-surface-interactive',
                        ].join(' ')}
                      >
                        <div
                          className={[
                            'flex size-8 shrink-0 items-center justify-center rounded-lg',
                            item.type === 'event'
                              ? 'bg-(--tenant-accent)/10'
                              : item.type === 'user'
                                ? 'bg-surface-raised'
                                : 'bg-surface-raised',
                          ].join(' ')}
                        >
                          <Icon className={`size-4 ${item.color ?? 'text-ink-secondary'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                          {item.subtitle && <p className="truncate text-xs text-ink-muted">{item.subtitle}</p>}
                        </div>
                        {isActive && <ArrowRightIcon className="size-4 shrink-0 text-ink-muted" />}
                      </button>
                    )
                  })}
                </>
              )}
              {(eventsError || usersError) && !remoteLoading && (
                <div
                  className="mx-3 my-2 flex items-center justify-between gap-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-xs text-amber-300"
                  role="alert"
                >
                  <span>No pudimos completar todos los resultados.</span>
                  <button
                    type="button"
                    onClick={() => void Promise.all([retryEvents(), usersKey ? retryUsers() : undefined])}
                    className="font-semibold hover:text-ink"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 border-t border-border-subtle px-4 py-2.5">
              <span className="flex items-center gap-1 text-[10px] text-ink-muted">
                <kbd className="rounded border border-border-subtle bg-surface-raised px-1 py-0.5 font-mono text-[9px]">↑↓</kbd>
                navegar
              </span>
              <span className="flex items-center gap-1 text-[10px] text-ink-muted">
                <kbd className="rounded border border-border-subtle bg-surface-raised px-1 py-0.5 font-mono text-[9px]">↵</kbd>
                abrir
              </span>
              <span className="flex items-center gap-1 text-[10px] text-ink-muted">
                <kbd className="rounded border border-border-subtle bg-surface-raised px-1 py-0.5 font-mono text-[9px]">esc</kbd>
                cerrar
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
