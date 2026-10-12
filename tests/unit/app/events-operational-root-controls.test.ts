import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/page.tsx'), 'utf8')

describe('Events operational-root controls', () => {
  it('derives governance controls from explicit server capabilities, per row', () => {
    // Updated deliberately (dash-client): row actions come from the row's own
    // capabilities (viewer_access), and portfolio users create only when a
    // session organization allows it.
    expect(source).toContain("accessCan(accessProfile, 'events:create')")
    expect(source).toContain('canCreateInAnyOrganization(applicationSession)')
    expect(source).toMatch(/actions=\{\s*canCreateEvents\s*\?\s*\(\s*<Button/)
    expect(source).toContain('const rowActions = eventRowActions(eventRowCapabilities(event, applicationSession, accessProfile))')
    expect(source).toContain('canDuplicate={rowActions.canDuplicate}')
    expect(source).toContain('canDelete={rowActions.canDelete}')
    expect(source).toContain('{hasAnyEventRowAction(rowActions) && (')
  })

  it('does not open the creation flow from a deep link for Root 2', () => {
    expect(source).toContain("if (params.get('create') !== '1' || !canCreateEvents) return")
  })
})
