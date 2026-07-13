'use client'

import { useStore } from '@/store/useStore'
import { useEffect, useSyncExternalStore } from 'react'

let hydrationPromise: Promise<void> | null = null

export function ensureStoreHydrated(): Promise<void> {
  if (useStore.persist.hasHydrated()) return Promise.resolve()
  if (!hydrationPromise) {
    hydrationPromise = Promise.resolve(useStore.persist.rehydrate()).finally(() => {
      hydrationPromise = null
    })
  }
  return hydrationPromise
}

function subscribe(onStoreChange: () => void) {
  const unsubscribeHydrate = useStore.persist.onHydrate(onStoreChange)
  const unsubscribeFinishHydration = useStore.persist.onFinishHydration(onStoreChange)

  return () => {
    unsubscribeHydrate()
    unsubscribeFinishHydration()
  }
}

function getSnapshot() {
  return useStore.persist.hasHydrated()
}

function getServerSnapshot() {
  return false
}

export function useStoreHydration() {
  const hydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    void ensureStoreHydrated()
  }, [])

  return hydrated
}
