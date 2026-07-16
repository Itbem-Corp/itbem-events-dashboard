import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/page.tsx'), 'utf8')

describe('Events operational-root controls', () => {
  it('derives governance controls from explicit server capabilities', () => {
    expect(source).toContain("const canCreateEvents = accessCan(accessProfile, 'events:create')")
    expect(source).toContain("const canEditEvents = accessCan(accessProfile, 'events:manage')")
    expect(source).toContain("const canDeleteEvents = accessCan(accessProfile, 'events:delete')")
    expect(source).toMatch(/actions=\{\s*canCreateEvents\s*\?\s*\(\s*<Button/)
    expect(source).toContain('canDuplicate={canCreateEvents && canEditEvents}')
    expect(source).toContain('canDelete={canDeleteEvents}')
  })

  it('does not open the creation flow from a deep link for Root 2', () => {
    expect(source).toContain("if (params.get('create') !== '1' || !canCreateEvents) return")
  })
})
