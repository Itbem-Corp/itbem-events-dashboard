'use client'

import { BellIcon } from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'
import { useState } from 'react'

const loadNotificationBell = () => import('@/components/ui/notification-bell')
const NotificationBell = dynamic(() => loadNotificationBell().then((module) => module.NotificationBell), {
  ssr: false,
  loading: () => (
    <span role="status" aria-label="Preparando notificaciones" className="flex size-8 items-center justify-center rounded-lg text-ink-muted">
      <BellIcon className="size-5" />
    </span>
  ),
})

export function LazyNotificationButton() {
  const [requested, setRequested] = useState(false)
  const [openRequested, setOpenRequested] = useState(false)

  if (requested) return <NotificationBell initialOpen={openRequested} />

  return (
    <button
      type="button"
      aria-label="Notificaciones"
      onPointerEnter={() => setRequested(true)}
      onFocus={() => void loadNotificationBell()}
      onClick={() => {
        setOpenRequested(true)
        setRequested(true)
      }}
      className="flex size-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
    >
      <BellIcon className="size-5" />
    </button>
  )
}
