import { useStore } from '@/store/useStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const preloadData = vi.hoisted(() => vi.fn((_path: string, _fetcher: unknown) => Promise.resolve({})))
vi.mock('swr', () => ({ preload: preloadData }))
vi.mock('@/components/events/forms/event-form-modal', () => ({ EventFormModal: () => null }))

describe('preloadEventFormIntent', () => {
  beforeEach(() => {
    preloadData.mockClear()
    useStore.setState({ user: null })
  })

  it('warms the event type catalog for every event form', async () => {
    const { preloadEventFormIntent } = await import('@/components/events/preload-event-form')
    await preloadEventFormIntent()
    expect(preloadData.mock.calls.map(([path]) => path)).toEqual(['/event-types'])
  })

  it('also warms the bounded organization selector for root users', async () => {
    useStore.setState({ user: { id: 'root', email: 'root@example.com', first_name: 'Root', last_name: 'User', is_root: true } })
    const { preloadEventFormIntent } = await import('@/components/events/preload-event-form')
    await preloadEventFormIntent()
    expect(preloadData.mock.calls.map(([path]) => path)).toEqual([
      '/event-types',
      '/clients?page=1&page_size=25',
    ])
  })
})
