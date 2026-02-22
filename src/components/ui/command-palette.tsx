'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { motion, AnimatePresence } from 'motion/react'
import type { Event } from '@/models/Event'
import type { User } from '@/models/User'
import {
  MagnifyingGlassIcon,
  Square2StackIcon,
  UsersIcon,
  PlusIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
} from '@heroicons/react/20/solid'
import { XMarkIcon } from '@heroicons/react/16/solid'

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
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: events = [] } = useSWR<Event[]>(
    open ? '/events/all' : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const { data: users = [] } = useSWR<User[]>(
    open ? '/users/all' : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const staticActions: CommandItem[] = useMemo(() => [
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
    {
      id: 'users',
      title: 'Ir a Usuarios',
      type: 'action',
      subtitle: 'Gestión de usuarios',
      href: '/users',
      icon: UsersIcon,
      color: 'text-amber-400',
    },
  ], [])

  const items = useMemo<CommandItem[]>(() => {
    const q = query.toLowerCase().trim()

    const eventItems: CommandItem[] = events
      .filter((e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        (e.address ?? '').toLowerCase().includes(q) ||
        (e.organizer_name ?? '').toLowerCase().includes(q)
      )
      .slice(0, 6)
      .map((e) => ({
        id: `event-${e.id}`,
        type: 'event' as const,
        title: e.name,
        subtitle: new Date(e.event_date_time).toLocaleDateString('es-MX', { dateStyle: 'medium' }),
        href: `/events/${e.id}`,
        icon: Square2StackIcon,
        color: e.is_active ? 'text-lime-400' : 'text-zinc-600',
      }))

    const userItems: CommandItem[] = users
      .filter((u) =>
        !q ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      )
      .slice(0, 4)
      .map((u) => ({
        id: `user-${u.id}`,
        type: 'user' as const,
        title: `${u.first_name} ${u.last_name}`,
        subtitle: u.email,
        href: `/users/${u.id}/clients`,
        icon: UsersIcon,
        color: 'text-zinc-400',
      }))

    const actionItems = staticActions.filter(
      (a) => !q || a.title.toLowerCase().includes(q) || (a.subtitle ?? '').toLowerCase().includes(q)
    )

    if (!q) {
      // No query: show actions first, then recent events
      return [...actionItems, ...eventItems.slice(0, 5)]
    }

    return [...eventItems, ...userItems, ...actionItems]
  }, [query, events, users, staticActions])

  const selectItem = useCallback((item: CommandItem) => {
    if (item.onSelect) {
      item.onSelect()
    } else if (item.href) {
      router.push(item.href)
    }
    onClose()
  }, [router, onClose])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
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
  }, [activeIndex])

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
            className="fixed left-1/2 top-20 z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5">
              <MagnifyingGlassIcon className="size-5 text-zinc-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar eventos, usuarios, comandos…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="text-zinc-600 hover:text-zinc-400"
                  >
                    <XMarkIcon className="size-4" />
                  </button>
                )}
                <kbd className="hidden sm:block rounded border border-zinc-800 bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                  ESC
                </kbd>
              </div>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-zinc-600">Sin resultados para &quot;{query}&quot;</p>
                </div>
              ) : (
                <>
                  {!query && (
                    <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-700">
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
                        onMouseEnter={() => setActiveIndex(index)}
                        className={[
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          isActive ? 'bg-white/5' : 'hover:bg-white/5',
                        ].join(' ')}
                      >
                        <div className={[
                          'flex size-8 shrink-0 items-center justify-center rounded-lg',
                          item.type === 'event' ? 'bg-indigo-500/10' :
                          item.type === 'user' ? 'bg-zinc-800' : 'bg-zinc-800',
                        ].join(' ')}>
                          <Icon className={`size-4 ${item.color ?? 'text-zinc-400'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-200 truncate">{item.title}</p>
                          {item.subtitle && (
                            <p className="text-xs text-zinc-600 truncate">{item.subtitle}</p>
                          )}
                        </div>
                        {isActive && (
                          <ArrowRightIcon className="size-4 text-zinc-600 shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 border-t border-white/5 px-4 py-2.5">
              <span className="flex items-center gap-1 text-[10px] text-zinc-700">
                <kbd className="rounded border border-zinc-800 bg-zinc-800 px-1 py-0.5 font-mono text-[9px]">↑↓</kbd>
                navegar
              </span>
              <span className="flex items-center gap-1 text-[10px] text-zinc-700">
                <kbd className="rounded border border-zinc-800 bg-zinc-800 px-1 py-0.5 font-mono text-[9px]">↵</kbd>
                abrir
              </span>
              <span className="flex items-center gap-1 text-[10px] text-zinc-700">
                <kbd className="rounded border border-zinc-800 bg-zinc-800 px-1 py-0.5 font-mono text-[9px]">esc</kbd>
                cerrar
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
