import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/[id]/studio/page.tsx'), 'utf8')
const sectionsHook = readFileSync(resolve(process.cwd(), 'src/components/studio/use-studio-sections.ts'), 'utf8')
const sectionsSwr = readFileSync(resolve(process.cwd(), 'src/lib/event-sections-swr.ts'), 'utf8')
const workspaceHook = readFileSync(resolve(process.cwd(), 'src/features/events/studio/use-studio-workspace.ts'), 'utf8')
const capabilitiesHook = readFileSync(resolve(process.cwd(), 'src/features/events/use-event-capabilities.ts'), 'utf8')

describe('Studio stale-data policy', () => {
  it('validates access before reusing all workspace data warmed by navigation intent', () => {
    expect(page).toContain('useEventCapabilities(id)')
    expect(page).toContain('useStudioWorkspace(id, canManageEvent)')
    expect(capabilitiesHook).toContain('eventCapabilitiesPath(eventId)')
    expect(workspaceHook).toContain('eventId && enabled ? studioWorkspacePath(eventId) : null')
    expect(workspaceHook).toContain('responsiveListSwrOptions')
    expect(page).toContain('const event = workspace?.event')
    expect(page).toContain('const config = workspace?.config')
    expect(page).toContain('initialConfig={config}')
    expect(page).not.toContain('eventDetailPath')
    expect(sectionsHook).toContain('useEventSectionsSWR(eventId, initialSections)')
    expect(sectionsSwr).toContain('responsiveListSwrOptions')
    expect(sectionsSwr).toContain('fallbackData: initialSections')
  })

  it('only blocks publish when required workspace data was never available', () => {
    expect(page).toContain('workspaceFatalError')
    expect(page).toContain('workspaceStaleError')
    expect(page).toContain('<StaleDataNotice')
    expect(page).toContain('disabled={workspaceLoading || workspaceFatalError || publishing || isPublished}')
    expect(page).not.toContain('Boolean(workspaceError)')
  })

  it('publishes by also activating an inactive event, after confirmation (SET-3)', () => {
    expect(page).toContain('const isPublished = publishState.published')
    expect(page).toContain('window.confirm(PUBLISH_ACTIVATES_EVENT_CONFIRMATION)')
    expect(page).toContain("api.put<Event>(eventPath(event.id), { is_active: true })")
    expect(page).not.toContain('Ya esta visible al publico')
  })

  it('warns before leaving Studio while a section save is pending or failed (STU-20)', () => {
    expect(page).toContain('useUnsavedChangesWarning(hasUnsavedChanges)')
    expect(page).toContain('onClick={handleBackClick}')
  })
})
