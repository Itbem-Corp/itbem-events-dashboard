import {
  canCreateInAnyOrganization,
  eventRoleAllowanceSummary,
  eventRowActions,
  eventRowCapabilities,
} from '@/features/events/event-row-capabilities'
import { describe, expect, it } from 'vitest'

const session = {
  organizations: [
    { id: 'org-editor', capabilities: ['events:view', 'events:manage', 'events:create'] },
    { id: 'org-checkin', capabilities: ['events:view', 'checkin:run'] },
  ],
  event_access: { assigned_events: 1, capabilities: ['events:view', 'events:manage', 'guests:manage', 'checkin:run'] },
} as never
const profile = { capabilities: ['events:view', 'events:manage', 'events:create', 'events:delete', 'checkin:run'] }

describe('eventRowCapabilities', () => {
  it('uses the grant for event_client rows', () => {
    const actions = eventRowActions(eventRowCapabilities({ viewer_access: 'event_client', client_id: 'org-x' }, session, profile))
    expect(actions).toEqual({ canEdit: true, canDuplicate: false, canDelete: false })
  })

  it("uses the row's organization for organization rows", () => {
    expect(eventRowActions(eventRowCapabilities({ viewer_access: 'organization', client_id: 'org-editor' }, session, profile))).toEqual({
      canEdit: true,
      canDuplicate: true,
      canDelete: false,
    })
    expect(eventRowActions(eventRowCapabilities({ viewer_access: 'organization', client_id: 'org-checkin' }, session, profile))).toEqual({
      canEdit: false,
      canDuplicate: false,
      canDelete: false,
    })
  })

  it('gives no actions to an organization row missing from the session', () => {
    expect(eventRowCapabilities({ viewer_access: 'organization', client_id: 'org-gap' }, session, profile)).toEqual([])
  })

  it('falls back to the workspace profile without viewer_access', () => {
    expect(eventRowActions(eventRowCapabilities({ client_id: 'org-editor' }, session, profile))).toEqual({
      canEdit: true,
      canDuplicate: true,
      canDelete: true,
    })
  })
})

describe('list helpers', () => {
  it('lets portfolio users create when any organization allows it', () => {
    expect(canCreateInAnyOrganization(session)).toBe(true)
    expect(canCreateInAnyOrganization({ organizations: [], event_access: null } as never)).toBe(false)
  })

  it('summarises what a role allows', () => {
    expect(eventRoleAllowanceSummary(['events:view', 'checkin:run'])).toBe('operar el check-in')
    expect(eventRoleAllowanceSummary(['guests:manage', 'checkin:run', 'analytics:view'])).toBe(
      'gestionar invitados, operar el check-in y consultar métricas'
    )
    expect(eventRoleAllowanceSummary(['events:view'])).toBe('ver los eventos')
  })
})
