import { getAvailableEventDetailTabs } from '@/components/events/event-detail-tab-state'
import type { EventCapabilities } from '@/models/EventMember'
import { describe, expect, it } from 'vitest'

const capabilities = (overrides: Partial<EventCapabilities> = {}): EventCapabilities => ({
  'event:manage': false,
  'event:delete': false,
  'guest:manage': false,
  'checkin:run': false,
  'analytics:view': false,
  'members:manage': false,
  ...overrides,
})

describe('getAvailableEventDetailTabs', () => {
  it('fails closed while capabilities are unavailable', () => {
    expect(getAvailableEventDetailTabs(undefined)).toEqual(['resumen'])
  })

  it('only exposes workspaces supported by resolved capabilities', () => {
    expect(
      getAvailableEventDetailTabs(
        capabilities({
          'guest:manage': true,
          'analytics:view': true,
        })
      )
    ).toEqual(['resumen', 'momentos', 'invitados', 'invitaciones', 'asientos', 'rsvp', 'analiticas'])
  })

  it('adds configuration only for event managers', () => {
    expect(getAvailableEventDetailTabs(capabilities({ 'event:manage': true }))).toEqual([
      'resumen',
      'momentos',
      'configuracion',
    ])
  })
})
