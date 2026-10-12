'use client'

import { RouteErrorPanel } from '@/components/route-error-panel'
import { useEffect } from 'react'

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[AuthRouteError]', error)
  }, [error])

  return <RouteErrorPanel digest={error.digest} homeHref="/login" homeLabel="Volver al acceso" onRetry={reset} />
}
