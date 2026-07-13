'use client'

import { useCallback, useSyncExternalStore } from 'react'

export function useOnlineStatus(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener('online', onStoreChange)
    window.addEventListener('offline', onStoreChange)
    return () => {
      window.removeEventListener('online', onStoreChange)
      window.removeEventListener('offline', onStoreChange)
    }
  }, [])

  const getSnapshot = useCallback(() => navigator.onLine, [])
  const getServerSnapshot = useCallback(() => true, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
