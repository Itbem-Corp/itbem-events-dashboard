import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/page.tsx'), 'utf8')
const menu = readFileSync(resolve(process.cwd(), 'src/components/events/event-list-actions-menu.tsx'), 'utf8')

// QA EVT-90 / EVT-91: the last row's menu was clipped by the list and the next
// row showed through it.
describe('events list row actions menu', () => {
  it('does not clip the menu with an overflow-hidden list', () => {
    const list = page.match(/<ul className="mt-6 divide-y[^"]*"/)?.[0] ?? ''
    expect(list).not.toBe('')
    expect(list).not.toContain('overflow-hidden')
  })

  it('lifts the row whose menu is open above the following rows', () => {
    expect(page).toContain("openActionEventId === event.id ? 'z-30' : ''")
  })

  it('paints an opaque menu panel', () => {
    expect(menu).not.toContain('bg-surface-raised/95')
    expect(menu).not.toContain('backdrop-blur')
  })

  it('drops the removed event capacity copy from list cards (EVT-13)', () => {
    expect(page).not.toContain('Capacidad sin definir')
    expect(page).not.toContain('Capacidad para')
  })
})

describe('events list cards', () => {
  it('marks inactive events in the list (EVT-12)', () => {
    expect(page).toContain('{!event.is_active && (')
    expect(page).toMatch(/>\s*Inactivo\s*</)
  })

  it('lets names wrap to two lines on mobile and filter chips wrap (EVT-14)', () => {
    expect(page).toContain('line-clamp-2 max-w-full min-w-0')
    expect(page).toContain('flex max-w-full flex-wrap gap-0.5 self-start')
  })
})
