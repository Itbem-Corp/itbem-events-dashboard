import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/page.tsx'), 'utf8')

describe('Events operational-root controls', () => {
  it('keeps Root 2 out of event-governance controls', () => {
    expect(source).toContain('const isOperationalRoot = user?.root_level === 2')
    expect(source).toContain("const organizationCanManageEvents = ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'EDITOR', 'MEMBER'].includes(organizationRole)")
    expect(source).toContain('const canManageEventPortfolio = !isOperationalRoot && (isRoot || organizationCanManageEvents)')
    expect(source).toMatch(/\{canManageEventPortfolio\s*&&\s*\(\s*<Button/)
    expect(source).toMatch(/\{canManageEventPortfolio\s*&&\s*\(\s*<details/)
  })

  it('does not open the creation flow from a deep link for Root 2', () => {
    expect(source).toContain("if (params.get('create') !== '1' || !canManageEventPortfolio) return")
  })
})
