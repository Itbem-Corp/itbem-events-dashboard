import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/page.tsx'), 'utf8')

// QA EVT-14: on a phone, names of events with a chip ("Inactivo", "2 pendientes")
// were cut to "QA-AUTOTE…" because the chips shared the row with the name.
describe('events list row title on mobile', () => {
  it('stacks the name and the chips on phones and keeps them in one row from sm up', () => {
    const block = page.slice(page.indexOf('data-testid="event-row-title"'), page.indexOf('<EventMomentsBadge'))
    expect(block).toContain('flex-col')
    expect(block).toContain('sm:flex-row')
    expect(block).toContain('line-clamp-2')
    expect(block).toContain('Inactivo')
  })
})
