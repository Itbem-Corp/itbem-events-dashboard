import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/[id]/checkin/page.tsx'), 'utf8')
const workspaceHook = readFileSync(resolve(process.cwd(), 'src/features/events/checkin/use-checkin-workspace.ts'), 'utf8')
const capabilitiesHook = readFileSync(resolve(process.cwd(), 'src/features/events/use-event-capabilities.ts'), 'utf8')

describe('check-in stale-data policy', () => {
  it('reuses intent-preloaded data and deduplicates requests on entry', () => {
    expect(page).toContain('useEventCapabilities(id)')
    expect(page).toContain('useCheckinWorkspace(id, canRunCheckin)')
    expect(capabilitiesHook).toContain('eventCapabilitiesPath(eventId)')
    expect(workspaceHook).toContain('eventId && enabled ? checkinWorkspacePath(eventId) : null')
    expect(workspaceHook).toContain('responsiveListSwrOptions')
    expect(page).toContain('const event = workspace?.event')
    expect(page).toContain('const rawGuestStatuses = workspace?.statuses')
    expect(page).toContain('workspace?.guests')
    expect(page).toContain('eventCheckinGuestsPath')
    expect(page).not.toContain('eventGuestsPath')
    expect(page).not.toContain('eventDetailPath')
    expect(page).not.toContain('guestStatusesPath')
    expect(page).toContain('refreshInterval: isPageActive && liveRefreshEnabled ? 10000 : 0')
  })

  it('keeps cached guests and scanning available after a live refresh failure', () => {
    expect(page).toContain('getDataErrorState(effectiveGuestsError, rawGuests ?? workspace?.guests)')
    expect(page).toContain("guestsErrorState === 'stale'")
    expect(page).toContain("guestsErrorState === 'fatal'")
    expect(page).toContain('<StaleDataNotice')
    expect(page).not.toContain('guestsLoading || Boolean(guestsError)')
  })
})
