'use client'

import { useApplicationRequestContext } from '@/hooks/useApplicationRequestContext'
import { scopedFetcherKey, type ScopedFetcherKey, type ScopedFetcherScope } from '@/lib/request-context'
import { useCallback, useMemo } from 'react'

export function useScopedFetcherKey(path: string | null): ScopedFetcherKey | null {
  const requestContext = useApplicationRequestContext()
  return useMemo(() => scopedFetcherKey(path, requestContext), [path, requestContext])
}

export function useScopedFetcherScope(): ScopedFetcherScope {
  const requestContext = useApplicationRequestContext()
  return useCallback(
    (path: string) => scopedFetcherKey(path, requestContext) as ScopedFetcherKey,
    [requestContext]
  )
}
