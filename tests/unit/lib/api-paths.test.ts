import {
  apiPath,
  batchGuestsPath,
  bulkGuestsPath,
  bulkGuestStatusPath,
  cacheFlushAllPath,
  cacheFlushPath,
  clientChildrenPath,
  clientInvitePath,
  clientMemberPath,
  clientMembersPath,
  clientPath,
  clientRolesPath,
  clientsPagePath,
  clientsPath,
  clientTypesPath,
  colorPalettesPath,
  designTemplatePath,
  designTemplatesPath,
  eventAnalyticsGuestsPath,
  eventAnalyticsPath,
  eventCheckinGuestsPath,
  eventConfigPath,
  eventCoverDeletePath,
  eventCoverPath,
  eventDetailPath,
  eventDuplicatePath,
  eventGuestShareSummaryPath,
  eventGuestsExportPath,
  eventGuestsPagePath,
  eventGuestsPath,
  eventGuestSummaryPath,
  eventInvitationsPath,
  eventInvitationsPagePath,
  eventPath,
  eventPreviewTokenPath,
  eventRepairPath,
  eventsAllPath,
  eventsDashboardPath,
  eventSeatingGuestsPath,
  eventSeatingWorkspacePath,
  eventSectionsPath,
  eventSectionsReorderPath,
  eventsPagePath,
  eventsPath,
  eventTablesAssignPath,
  eventTablesPath,
  eventTypesPath,
  fontSetsPath,
  fontUploadPath,
  guestPath,
  guestRsvpTokenPath,
  guestsPath,
  guestStatusesPath,
  inFlightMomentsPath,
  invitationResendPath,
  momentActivityPath,
  momentPath,
  momentRequeuePath,
  momentsBatchReoptimizePath,
  momentsBulkApprovePath,
  momentsBulkDeletePath,
  momentsPath,
  momentsReorderPath,
  momentSummaryPath,
  reoptimizingMomentsPath,
  resourceContentPath,
  resourcePath,
  resourceReplacePath,
  resourcesMultiplePath,
  resourcesPath,
  resourceTypesPath,
  scopedEventsDashboardPath,
  scopedEventsPagePath,
  scopedEventsPath,
  sectionPath,
  sectionResourcesPath,
  tablePath,
  userActivatePath,
  userAvatarPath,
  userClientsPath,
  userDeactivatePath,
  userInvitePath,
  userPath,
  usersAllPath,
  usersPath,
} from '@/lib/api-paths'
import { describe, expect, it } from 'vitest'

describe('api-paths', () => {
  it('builds relative API paths with encoded query params', () => {
    expect(apiPath('/clients/members', { client_id: 'client 1', empty: '', page: 2 })).toBe(
      '/clients/members?client_id=client+1&page=2'
    )
  })

  it('supports repeated query params from arrays', () => {
    expect(apiPath('/moments', { event_id: ['a', 'b'], include_failed: true })).toBe(
      '/moments?event_id=a&event_id=b&include_failed=true'
    )
  })

  it('builds event contract paths', () => {
    expect(eventsPath()).toBe('/events')
    expect(eventsAllPath()).toBe('/events/all')
    expect(eventsPath('client 1')).toBe('/events?client_id=client+1')
    expect(eventPath('event 1')).toBe('/events/event%201')
    expect(eventPath(' event%201 ')).toBe('/events/event%201')
    expect(eventDetailPath('event 1')).toBe('/events/event%201/detail')
    expect(eventConfigPath('event 1')).toBe('/events/event%201/config')
    expect(eventAnalyticsPath('event 1')).toBe('/events/event%201/analytics')
    expect(eventCoverPath('event 1')).toBe('/events/event%201/cover')
    expect(eventCoverDeletePath('event 1')).toBe('/events/event%201/cover')
    expect(eventInvitationsPath('event 1')).toBe('/events/event%201/invitations')
    expect(
      eventInvitationsPagePath('event/1', { page: 1, page_size: 25, filter: 'ALL', sort: 'name', direction: 'asc' })
    ).toBe('/guests/invitations:event%2F1?page=1&page_size=25&filter=ALL&sort=name&direction=asc')
    expect(eventSectionsPath('event 1')).toBe('/events/event%201/sections')
    expect(eventSectionsReorderPath('event 1')).toBe('/events/event%201/sections/reorder')
    expect(eventTablesPath('event 1')).toBe('/events/event%201/tables')
    expect(eventSeatingWorkspacePath('event 1')).toBe('/events/event%201/seating-workspace')
    expect(eventTablesAssignPath('event 1')).toBe('/events/event%201/tables/assign')
    expect(eventPreviewTokenPath('event/1')).toBe('/events/event%2F1/preview-token')
    expect(eventRepairPath('event/1')).toBe('/events/event%2F1/repair')
    expect(eventDuplicatePath('event/1')).toBe('/events/event%2F1/duplicate')
    expect(
      eventGuestsExportPath('event 1', {
        search: 'Ana María',
        filter: 'CONFIRMED',
        sort: 'table',
        direction: 'desc',
      })
    ).toBe('/events/event%201/guests/export?search=Ana+Mar%C3%ADa&filter=CONFIRMED&sort=table&direction=desc')
    expect(eventGuestsExportPath('event 1', { filter: 'PENDING', view: 'invitations' })).toBe(
      '/events/event%201/guests/export?filter=PENDING&view=invitations'
    )
    expect(eventGuestsExportPath('event 1', { filter: 'ALL', view: 'rsvp' })).toBe(
      '/events/event%201/guests/export?filter=ALL&view=rsvp'
    )
  })

  it('shares the same event scope between dashboard routes', () => {
    expect(scopedEventsPath('client 1', true)).toBe('/events?client_id=client+1')
    expect(scopedEventsPath('client 1', false)).toBe('/events?client_id=client+1')
    expect(scopedEventsPath(null, true)).toBe('/events')
    expect(scopedEventsPath(null, false)).toBeNull()
    expect(eventsPagePath('client 1', { page: 2, page_size: 12, search: 'boda civil', filter: 'past' })).toBe(
      '/events?client_id=client+1&page=2&page_size=12&search=boda+civil&filter=past'
    )
    expect(scopedEventsPagePath(null, true, { page: 1, page_size: 12, filter: 'all' })).toBe(
      '/events?page=1&page_size=12&filter=all'
    )
    expect(scopedEventsPagePath(null, false, { page: 1, page_size: 12 })).toBeNull()
    expect(eventsDashboardPath()).toBe('/events/dashboard')
    expect(eventsDashboardPath('client 1')).toBe('/events/dashboard?client_id=client+1')
    expect(scopedEventsDashboardPath('client 1', false)).toBe('/events/dashboard?client_id=client+1')
    expect(scopedEventsDashboardPath(null, true)).toBe('/events/dashboard')
    expect(scopedEventsDashboardPath(null, false)).toBeNull()
  })

  it('builds client member paths with scoped client query', () => {
    expect(clientsPath()).toBe('/clients')
    expect(clientsPagePath({ page: 2, page_size: 12, search: 'agencia norte' })).toBe(
      '/clients?page=2&page_size=12&search=agencia+norte'
    )
    expect(clientChildrenPath('client 1')).toBe('/clients/children?parent_id=client+1')
    expect(clientPath('client/1')).toBe('/clients/client%2F1')
    expect(clientPath('client%2F1')).toBe('/clients/client%2F1')
    expect(clientInvitePath()).toBe('/clients/invite')
    expect(clientMembersPath()).toBe('/clients/members')
    expect(clientMembersPath('client/1')).toBe('/clients/members?client_id=client%2F1')
    expect(clientTypesPath()).toBe('/catalogs/client-types')
    expect(clientTypesPath('AGENCY')).toBe('/catalogs/client-types?parent_type_code=AGENCY')
    expect(guestStatusesPath()).toBe('/catalogs/guest-statuses')
    expect(clientRolesPath('client 1')).toBe('/catalogs/roles?client_id=client+1')
    expect(clientMemberPath('user/1', 'client/1')).toBe('/clients/members/user%2F1?client_id=client%2F1')
  })

  it('builds user contract paths', () => {
    expect(usersPath()).toBe('/users')
    expect(usersAllPath()).toBe('/users/all')
    expect(usersAllPath({ page: 2, page_size: 10, search: 'ana lopez', status: 'active' })).toBe(
      '/users/all?page=2&page_size=10&search=ana+lopez&status=active'
    )
    expect(userPath('user/1')).toBe('/users/user%2F1')
    expect(userClientsPath('user/1')).toBe('/users/user%2F1/clients')
    expect(userInvitePath()).toBe('/users/invite')
    expect(userAvatarPath()).toBe('/users/avatar')
    expect(userActivatePath('user/1')).toBe('/users/user%2F1/activate')
    expect(userDeactivatePath('user/1')).toBe('/users/user%2F1/deactivate')
  })

  it('builds moment polling paths scoped by event', () => {
    expect(momentsPath('event 1')).toBe('/moments?event_id=event+1')
    expect(momentActivityPath('event 1')).toBe('/moments/activity?event_id=event+1')
    expect(inFlightMomentsPath('event 1')).toBe('/moments/in-flight?event_id=event+1')
    expect(reoptimizingMomentsPath('event 1')).toBe('/moments/reoptimizing?event_id=event+1')
    expect(momentSummaryPath(['event-1', 'event-2'])).toBe('/moments/summary?event_ids=event-1%2Cevent-2')
    expect(momentPath('moment/1')).toBe('/moments/moment%2F1')
    expect(momentPath('moment%2F1')).toBe('/moments/moment%2F1')
    expect(momentRequeuePath('moment/1')).toBe('/moments/moment%2F1/requeue')
    expect(momentsReorderPath()).toBe('/moments/reorder')
    expect(momentsBatchReoptimizePath()).toBe('/moments/batch/reoptimize')
    expect(momentsBulkApprovePath()).toBe('/moments/bulk-approve')
    expect(momentsBulkDeletePath()).toBe('/moments/bulk')
  })

  it('builds guest contract paths', () => {
    expect(
      eventCheckinGuestsPath('event/1', {
        page: 2,
        page_size: 60,
        search: 'ana mesa 4',
        filter: 'PENDING',
        qr: 'TOKEN 1',
      })
    ).toBe('/guests/checkin:event%2F1?page=2&page_size=60&search=ana+mesa+4&filter=PENDING&qr=TOKEN+1')
    expect(
      eventGuestsPagePath('event/1', {
        page: 3,
        page_size: 50,
        filter: 'DECLINED',
        sort: 'table',
        direction: 'desc',
      })
    ).toBe('/guests/page:event%2F1?page=3&page_size=50&filter=DECLINED&sort=table&direction=desc')
    expect(eventAnalyticsGuestsPath('event/1')).toBe('/guests/analytics:event%2F1')
    expect(eventSeatingGuestsPath('event/1')).toBe('/guests/seating:event%2F1')
    expect(eventGuestShareSummaryPath('event/1')).toBe('/guests/share:event%2F1')
    expect(eventGuestsPath('event/1')).toBe('/guests/all:event%2F1')
    expect(eventGuestSummaryPath('event/1')).toBe('/guests/summary:event%2F1')
    expect(guestPath('guest/1')).toBe('/guests/guest%2F1')
    expect(guestRsvpTokenPath('guest/1')).toBe('/guests/guest%2F1/rsvp-token')
    expect(bulkGuestsPath()).toBe('/guests/bulk')
    expect(bulkGuestStatusPath()).toBe('/guests/bulk/status')
    expect(batchGuestsPath()).toBe('/guests/batch')
    expect(guestsPath()).toBe('/guests')
  })

  it('builds section, table, and resource paths', () => {
    expect(sectionPath('section/1')).toBe('/sections/section%2F1')
    expect(sectionPath('section%2F1')).toBe('/sections/section%2F1')
    expect(tablePath('table/1')).toBe('/tables/table%2F1')
    expect(resourcesPath()).toBe('/resources')
    expect(resourcesMultiplePath()).toBe('/resources/multiple')
    expect(resourcePath('resource/1')).toBe('/resources/resource%2F1')
    expect(resourceContentPath('resource/1')).toBe('/resources/resource%2F1/content')
    expect(resourceReplacePath('resource/1')).toBe('/resources/resource%2F1/replace')
    expect(sectionResourcesPath('section/1')).toBe('/admin/resources/section/section%2F1')
    expect(resourceTypesPath()).toBe('/catalogs/resource-types')
  })

  it('keeps malformed encoded path segments safe', () => {
    expect(eventPath('event%ZZ')).toBe('/events/event%25ZZ')
  })

  it('builds catalog and invitation action paths', () => {
    expect(designTemplatesPath()).toBe('/catalogs/design-templates')
    expect(designTemplatePath('template/1')).toBe('/catalogs/design-templates/template%2F1')
    expect(colorPalettesPath()).toBe('/catalogs/color-palettes')
    expect(fontSetsPath()).toBe('/catalogs/font-sets')
    expect(fontUploadPath()).toBe('/fonts/upload')
    expect(eventTypesPath()).toBe('/event-types')
    expect(invitationResendPath('invite/1')).toBe('/invitations/invite%2F1/resend')
  })

  it('builds root-only cache utility paths', () => {
    expect(cacheFlushPath('events:all')).toBe('/cache/flush/events%3Aall')
    expect(cacheFlushPath('resource:section:abc')).toBe('/cache/flush/resource%3Asection%3Aabc')
    expect(cacheFlushAllPath()).toBe('/cache/flush-all')
  })

  it('rejects cache keys that cannot fit the backend single-segment route', () => {
    expect(() => cacheFlushPath('')).toThrow('single-segment cache key')
    expect(() => cacheFlushPath('section/resources')).toThrow('single-segment cache key')
    expect(() => cacheFlushPath('section%2Fresources')).toThrow('single-segment cache key')
  })
})
