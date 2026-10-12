'use client'

import { RouteErrorPanel } from '@/components/route-error-panel'
import { useEffect } from 'react'

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[RootRouteError]', error)
  }, [error])

  return <RouteErrorPanel digest={error.digest} onRetry={reset} />
}
