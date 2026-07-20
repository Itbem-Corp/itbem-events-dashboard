import type { PanelId } from '@/components/studio/studio-constants'
import { studioWorkspacePath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import type { ScopedFetcherScope } from '@/lib/request-context'
import { preload } from 'swr'

export function preloadStudioPanel(panel: PanelId): Promise<unknown> {
  if (panel === 'sections') return import('@/components/studio/draggable-section-list')
  if (panel === 'config') return import('@/components/studio/quick-config-panel')
  return import('@/components/events/event-design-picker')
}

export function preloadStudioWorkspace(eventId: string, scope: ScopedFetcherScope): Promise<unknown> {
  return Promise.all([
    preloadStudioPanel('sections'),
    Promise.resolve(preload(scope(studioWorkspacePath(eventId)), fetcher)),
  ])
}
