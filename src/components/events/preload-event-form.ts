import { clientsPagePath, eventTypesPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { useStore } from '@/store/useStore'
import { preload } from 'swr'

export const loadEventFormModal = () => import('@/components/events/forms/event-form-modal')

export function preloadEventFormIntent(): Promise<unknown> {
  const isRoot = Boolean(useStore.getState().user?.is_root)
  const tasks: Promise<unknown>[] = [loadEventFormModal(), Promise.resolve(preload(eventTypesPath(), fetcher))]
  if (isRoot) {
    tasks.push(Promise.resolve(preload(clientsPagePath({ page: 1, page_size: 25 }), fetcher)))
  }
  return Promise.all(tasks)
}
