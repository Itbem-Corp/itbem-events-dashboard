import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const toolbar = readFileSync(resolve(process.cwd(), 'src/components/events/seating/seating-toolbar.tsx'), 'utf8')

describe('seating mobile save bar', () => {
  it('sits above the EventiApp bottom navigation and keeps the safe area when it is hidden', () => {
    expect(toolbar).toContain('fixed bottom-[var(--app-mobile-nav-offset,0px)] inset-x-0 z-30')
    expect(toolbar).toContain('in-data-[mobile-nav=hidden]:pb-[calc(0.75rem+env(safe-area-inset-bottom))]')
    expect(toolbar).not.toContain('fixed bottom-0 inset-x-0')
  })
})
