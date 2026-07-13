import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/[id]/studio/page.tsx'), 'utf8')
const sectionsHook = readFileSync(resolve(process.cwd(), 'src/components/studio/use-studio-sections.ts'), 'utf8')

describe('Studio stale-data policy', () => {
  it('reuses all workspace data warmed by navigation intent', () => {
    expect(page.match(/responsiveListSwrOptions/g)).toHaveLength(2)
    expect(page).toContain('studioWorkspacePath(id)')
    expect(page).toContain('const event = workspace?.event')
    expect(page).toContain('const config = workspace?.config')
    expect(page).toContain('initialConfig={config}')
    expect(page).not.toContain('eventDetailPath')
    expect(sectionsHook).toContain('responsiveListSwrOptions')
    expect(sectionsHook).toContain('fallbackData: initialSections')
  })

  it('only blocks publish when required workspace data was never available', () => {
    expect(page).toContain('workspaceFatalError')
    expect(page).toContain('workspaceStaleError')
    expect(page).toContain('<StaleDataNotice')
    expect(page).toContain('disabled={workspaceLoading || workspaceFatalError || publishing || isPublic}')
    expect(page).not.toContain('Boolean(workspaceError)')
  })
})
