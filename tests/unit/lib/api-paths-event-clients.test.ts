import {
  eventClientAssignmentsPath,
  eventClientCandidatesPath,
  eventClientPath,
  eventClientsPath,
  organizationEventClientPath,
  organizationEventClientsPath,
} from '@/lib/api-paths'
import { describe, expect, it } from 'vitest'

describe('event client api paths', () => {
  it('builds the event-scoped routes', () => {
    expect(eventClientsPath('evt-1')).toBe('/events/evt-1/clients')
    expect(eventClientPath('evt-1', 'user 1')).toBe('/events/evt-1/clients/user%201')
    expect(eventClientCandidatesPath('evt-1')).toBe('/events/evt-1/clients/candidates')
    expect(eventClientCandidatesPath('evt-1', ' ana ')).toBe('/events/evt-1/clients/candidates?search=ana')
    expect(eventClientAssignmentsPath('evt-1', 'u-1', { page: 2, page_size: 20, search: '' })).toBe(
      '/events/evt-1/clients/u-1/assignments?page=2&page_size=20'
    )
  })

  it('builds the organization oversight routes', () => {
    expect(organizationEventClientsPath('org-1', { page: 1, page_size: 20 })).toBe(
      '/clients/org-1/members/event-clients?page=1&page_size=20'
    )
    expect(organizationEventClientPath('org-1', 'u-1')).toBe('/clients/org-1/members/event-clients/u-1')
  })
})
