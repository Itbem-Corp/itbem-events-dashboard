'use client'

import type { EventDetailTabId } from '@/components/events/event-detail-tab-state'
import {
  ChartBarIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  HomeIcon,
  InboxArrowDownIcon,
  PhotoIcon,
  RectangleGroupIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import { motion, useReducedMotion } from 'motion/react'
import type { KeyboardEvent } from 'react'
import { useEffect, useRef } from 'react'

const EVENT_DETAIL_TABS = [
  { id: 'resumen', label: 'Resumen', group: 'General', icon: HomeIcon },
  { id: 'invitados', label: 'Invitados', group: 'Operación', icon: UsersIcon },
  { id: 'invitaciones', label: 'Invitaciones', group: 'Operación', icon: InboxArrowDownIcon },
  { id: 'asientos', label: 'Mesas', group: 'Operación', icon: RectangleGroupIcon },
  { id: 'rsvp', label: 'RSVP', group: 'Operación', icon: EnvelopeIcon },
  { id: 'momentos', label: 'Momentos', group: 'Experiencia', icon: PhotoIcon },
  { id: 'analiticas', label: 'Analíticas', group: 'Gestión', icon: ChartBarIcon },
  {
    id: 'configuracion',
    label: 'Configuración',
    group: 'Gestión',
    icon: Cog6ToothIcon,
  },
] as const satisfies ReadonlyArray<{
  id: EventDetailTabId
  label: string
  group: 'General' | 'Operación' | 'Experiencia' | 'Gestión'
  icon: typeof HomeIcon
}>

const EVENT_DETAIL_TAB_GROUPS = ['General', 'Operación', 'Experiencia', 'Gestión'] as const

export type { EventDetailTabId } from '@/components/events/event-detail-tab-state'

interface EventDetailTabsProps {
  activeTab: EventDetailTabId
  availableTabs: readonly EventDetailTabId[]
  guestCount?: number
  pendingInvitationCount?: number
  onTabChange: (tab: EventDetailTabId) => void
  onTabIntent?: (tab: EventDetailTabId) => void
}

export function EventDetailTabs({
  activeTab,
  availableTabs,
  guestCount = 0,
  pendingInvitationCount = 0,
  onTabChange,
  onTabIntent,
}: EventDetailTabsProps) {
  const reducedMotion = useReducedMotion()
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Partial<Record<EventDetailTabId, HTMLButtonElement | null>>>({})
  const visibleTabs = EVENT_DETAIL_TABS.filter((tab) => availableTabs.includes(tab.id))
  const visibleGroups = EVENT_DETAIL_TAB_GROUPS.map((group) => ({
    group,
    tabs: visibleTabs.filter((tab) => tab.group === group),
  })).filter(({ tabs }) => tabs.length > 0)

  useEffect(() => {
    const tabList = tabListRef.current
    const activeElement = tabRefs.current[activeTab]
    if (!tabList || !activeElement || typeof tabList.scrollTo !== 'function') return

    const listRect = tabList.getBoundingClientRect()
    const tabRect = activeElement.getBoundingClientRect()
    const edgePadding = 8
    let nextScrollLeft = tabList.scrollLeft

    if (tabRect.left < listRect.left + edgePadding) {
      nextScrollLeft += tabRect.left - listRect.left - edgePadding
    } else if (tabRect.right > listRect.right - edgePadding) {
      nextScrollLeft += tabRect.right - listRect.right + edgePadding
    } else {
      return
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    tabList.scrollTo({ left: Math.max(0, nextScrollLeft), behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeTab, guestCount, pendingInvitationCount])

  const activateTab = (tab: EventDetailTabId) => {
    onTabIntent?.(tab)
    onTabChange(tab)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: EventDetailTabId) => {
    const currentIndex = visibleTabs.findIndex(({ id }) => id === tab)
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % visibleTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = visibleTabs.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = visibleTabs[nextIndex].id
    activateTab(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  return (
    <div className="sticky top-[4.75rem] z-20 -mx-1 rounded-xl border border-white/[0.09] bg-zinc-950/90 p-1 shadow-[0_14px_38px_rgba(0,0,0,0.28)] ring-1 ring-black/20 backdrop-blur-2xl md:-mx-2 md:rounded-2xl md:p-1.5 lg:top-2">
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Secciones del evento"
        aria-orientation="horizontal"
        className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleGroups.map(({ group, tabs }, groupIndex) => (
          <div
            key={group}
            role="presentation"
            className={`flex shrink-0 md:flex-col md:gap-1 ${groupIndex > 0 ? 'md:border-l md:border-white/[0.07] md:pl-1.5' : ''}`}
          >
            <span
              aria-hidden="true"
              className="hidden px-2 pt-0.5 text-[10px] font-semibold tracking-[0.14em] text-zinc-500 uppercase md:block"
            >
              {group}
            </span>
            <div role="presentation" className="flex gap-1">
              {tabs.map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id

                return (
                  <motion.button
                    key={id}
                    ref={(element) => {
                      tabRefs.current[id] = element
                    }}
                    type="button"
                    id={`event-tab-${id}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`event-panel-${id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => activateTab(id)}
                    onFocus={() => onTabIntent?.(id)}
                    onPointerEnter={() => onTabIntent?.(id)}
                    onKeyDown={(event) => handleKeyDown(event, id)}
                    layout
                    transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                    whileHover={reducedMotion || isActive ? undefined : { y: -1 }}
                    className={[
                      'group relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none sm:px-3 sm:text-sm md:rounded-xl md:px-3.5 md:py-2',
                      isActive
                        ? 'bg-gradient-to-b from-indigo-400/20 to-indigo-500/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_22px_rgba(0,0,0,0.18)] ring-1 ring-indigo-300/20'
                        : 'text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100',
                    ].join(' ')}
                  >
                    <Icon
                      aria-hidden="true"
                      className={`size-4 shrink-0 ${isActive ? 'text-indigo-300' : 'text-zinc-500 group-hover:text-zinc-300'}`}
                    />
                    <span>{label}</span>
                    {id === 'invitados' && guestCount > 0 && (
                      <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-xs text-zinc-300 ring-1 ring-white/[0.06]">
                        {guestCount}
                      </span>
                    )}
                    {id === 'invitaciones' && pendingInvitationCount > 0 && (
                      <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-xs text-amber-300 ring-1 ring-amber-300/15">
                        {pendingInvitationCount}
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
