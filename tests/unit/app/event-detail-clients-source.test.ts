import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/app/(app)/events/[id]/page.tsx'), 'utf8')

describe('event detail: event clients', () => {
  it("offers 'Clientes del evento' only with the event's event:clients:manage capability", () => {
    expect(page).toContain("Boolean(eventCapabilities?.['event:clients:manage']) && Boolean(event.client_id)")
    expect(page).toMatch(/\{canManageClients && \(\s*<Button/)
    expect(page).toContain('Clientes del evento')
    // The modal mounts only when allowed and open, so clients and editors never request /clients.
    expect(page).toContain('{canManageClients && clientsOpen && (')
  })

  it('shows the access-lost panel on a 403 instead of a generic error', () => {
    expect(page).toContain('httpStatusOf(error) === 403 || httpStatusOf(eventCapabilitiesError) === 403')
    expect(page).toContain('<EventAccessLost eventsLabel={eventsLabel} />')
  })

  it('uses the shared summary and the navigation events label', () => {
    expect(page).toContain('eventAccessSummary(eventCapabilities, { isEventClient })')
    expect(page).not.toContain('Puedes operar check-in y RSVP')
    expect(page).toContain("accessProfile.isEventClientOnly ? 'Mis eventos' : 'Eventos'")
    expect(page).toContain('<EventCapabilityError')
  })
})
