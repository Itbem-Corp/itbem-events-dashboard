'use client'

import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { SignalIcon, SignalSlashIcon } from '@heroicons/react/20/solid'
import { useEffect, useRef, useState } from 'react'

const ONLINE_CONFIRMATION_MS = 2800

export function ConnectionStatusBanner() {
  const online = useOnlineStatus()
  const wasOffline = useRef(false)
  const [showRecovered, setShowRecovered] = useState(false)

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      setShowRecovered(false)
      return
    }

    if (!wasOffline.current) return
    wasOffline.current = false
    setShowRecovered(true)
    const timeout = window.setTimeout(() => setShowRecovered(false), ONLINE_CONFIRMATION_MS)
    return () => window.clearTimeout(timeout)
  }, [online])

  if (online && !showRecovered) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 top-3 z-[80] mx-auto flex min-h-11 max-w-lg items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-center text-xs font-semibold shadow-[0_18px_48px_var(--app-shadow-strong)] backdrop-blur-xl sm:text-sm ${
        online
          ? 'border-emerald-400/20 bg-emerald-950/90 text-emerald-100'
          : 'border-amber-400/20 bg-[#241d12]/95 text-amber-100'
      }`}
    >
      {online ? (
        <SignalIcon aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <SignalSlashIcon aria-hidden="true" className="size-4 shrink-0" />
      )}
      {online
        ? 'Conexión recuperada. Estamos actualizando tus datos.'
        : 'Sin conexión. Puedes seguir consultando los datos que ya cargaron.'}
    </div>
  )
}
