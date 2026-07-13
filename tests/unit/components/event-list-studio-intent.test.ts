import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/page.tsx'), 'utf8')
const detailPage = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/[id]/page.tsx'), 'utf8')
const menu = readFileSync(resolve(process.cwd(), 'src/components/events/event-list-actions-menu.tsx'), 'utf8')

describe('event list Studio intent', () => {
  it('warms both the Studio route and its critical workspace before navigation', () => {
    expect(page).toContain('router.prefetch(`/events/${event.id}/studio`)')
    expect(page).toContain("import('@/components/studio/preload-studio-panel')")
    expect(page).toContain('module.preloadStudioWorkspace(event.id)')
    expect(page).toContain('onStudioIntent={preloadEventStudio}')
  })

  it('handles mouse, touch/pointer, and keyboard intent on the Studio action', () => {
    expect(menu).toContain('onFocus={() => onStudioIntent?.(event)}')
    expect(menu).toContain('onPointerDown={() => onStudioIntent?.(event)}')
    expect(menu).toContain('onPointerEnter={() => onStudioIntent?.(event)}')
  })

  it('warms the Studio route and workspace from the event detail primary action', () => {
    expect(detailPage).toContain('router.prefetch(`/events/${id}/studio`)')
    expect(detailPage).toContain('void preloadStudioWorkspace(id)')
    expect(detailPage).toContain('onFocus={preloadStudioRoute}')
    expect(detailPage).toContain('onPointerDown={preloadStudioRoute}')
    expect(detailPage).toContain('onPointerEnter={preloadStudioRoute}')
  })
})
