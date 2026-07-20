import { preloadStudioPanel, preloadStudioWorkspace } from '@/components/studio/preload-studio-panel'
import { describe, expect, it, vi } from 'vitest'
import type { ScopedFetcherScope } from '@/lib/request-context'

const loaded = vi.hoisted(() => ({
  sections: vi.fn(),
  config: vi.fn(),
  design: vi.fn(),
}))
const preloadData = vi.hoisted(() => vi.fn((_path: string, _fetcher: unknown) => Promise.resolve({})))

vi.mock('swr', () => ({ preload: preloadData }))

vi.mock('@/components/studio/draggable-section-list', () => {
  loaded.sections()
  return { DraggableSectionList: () => null }
})

vi.mock('@/components/studio/quick-config-panel', () => {
  loaded.config()
  return { QuickConfigPanel: () => null }
})

vi.mock('@/components/events/event-design-picker', () => {
  loaded.design()
  return { EventDesignPicker: () => null }
})

describe('preloadStudioPanel', () => {
  const scope: ScopedFetcherScope = (path) => [path, 'eventiapp', 'organization', 'client-1']
  it('imports only the panel requested by user intent', async () => {
    expect(loaded.sections).not.toHaveBeenCalled()
    expect(loaded.config).not.toHaveBeenCalled()
    expect(loaded.design).not.toHaveBeenCalled()

    await preloadStudioPanel('config')

    expect(loaded.config).toHaveBeenCalledTimes(1)
    expect(loaded.sections).not.toHaveBeenCalled()
    expect(loaded.design).not.toHaveBeenCalled()

    await preloadStudioPanel('design')

    expect(loaded.design).toHaveBeenCalledTimes(1)
    expect(loaded.sections).not.toHaveBeenCalled()
  })

  it('preloads the default editor and its composed bootstrap together', async () => {
    await preloadStudioWorkspace('event-1', scope)

    expect(loaded.sections).toHaveBeenCalledTimes(1)
    expect(preloadData).toHaveBeenCalledTimes(1)
    expect(preloadData.mock.calls.map(([path]) => path)).toEqual([
      ['/events/event-1/studio-workspace', 'eventiapp', 'organization', 'client-1'],
    ])
  })
})
