'use client'

import { useProductShell } from '@/products/core/product-context'
import { BellIcon } from '@heroicons/react/20/solid'
import dynamic from 'next/dynamic'
import { useState } from 'react'

const loadNotificationBell = () => import('@/components/ui/notification-bell')
function NotificationBellLoading() {
  const accessibleShell = Boolean(useProductShell()?.accessibleShell)
  return (
    <span
      role="status"
      aria-label="Preparando notificaciones"
      className={`flex ${accessibleShell ? 'size-11 lg:size-9' : 'size-8'} items-center justify-center rounded-lg text-ink-muted`}
    >
      <BellIcon className="size-5" />
    </span>
  )
}

const NotificationBell = dynamic(() => loadNotificationBell().then((module) => module.NotificationBell), {
  ssr: false,
  loading: () => <NotificationBellLoading />,
})

export function LazyNotificationButton() {
  const accessibleShell = Boolean(useProductShell()?.accessibleShell)
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
      className={`flex ${accessibleShell ? 'size-11 lg:size-9' : 'size-8'} items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-interactive hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)`}
    >
      <BellIcon className="size-5" />
    </button>
  )
}
