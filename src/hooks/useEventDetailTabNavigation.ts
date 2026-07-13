'use client'

import {
  DEFAULT_EVENT_DETAIL_TAB,
  getEventDetailTabHref,
  isEventDetailTabId,
  resolveEventDetailTab,
  type EventDetailTabId,
} from '@/components/events/event-detail-tab-state'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export function useEventDetailTabNavigation() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentSearch = searchParams.toString()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTabState] = useState<EventDetailTabId>(() => resolveEventDetailTab(tabParam))

  useEffect(() => {
    setActiveTabState(resolveEventDetailTab(tabParam))
  }, [tabParam])

  useEffect(() => {
    if (tabParam === null || isEventDetailTabId(tabParam)) return

    window.history.replaceState(
      window.history.state,
      '',
      getEventDetailTabHref(pathname, currentSearch, DEFAULT_EVENT_DETAIL_TAB)
    )
  }, [currentSearch, pathname, tabParam])

  useEffect(() => {
    const restoreTabFromHistory = () => {
      const nextParam = new URLSearchParams(window.location.search).get('tab')
      setActiveTabState(resolveEventDetailTab(nextParam))
    }

    window.addEventListener('popstate', restoreTabFromHistory)
    return () => window.removeEventListener('popstate', restoreTabFromHistory)
  }, [])

  const setActiveTab = useCallback(
    (nextTab: EventDetailTabId) => {
      if (nextTab === activeTab) return

      const latestSearch = window.location.search.replace(/^\?/, '')
      setActiveTabState(nextTab)
      window.history.pushState(window.history.state, '', getEventDetailTabHref(pathname, latestSearch, nextTab))
    },
    [activeTab, pathname]
  )

  const replaceActiveTab = useCallback(
    (nextTab: EventDetailTabId) => {
      const latestSearch = window.location.search.replace(/^\?/, '')
      setActiveTabState(nextTab)
      window.history.replaceState(window.history.state, '', getEventDetailTabHref(pathname, latestSearch, nextTab))
    },
    [pathname]
  )

  return { activeTab, setActiveTab, replaceActiveTab }
}
