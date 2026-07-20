type QueryPrimitive = string | number | boolean
type QueryValue = QueryPrimitive | null | undefined | Array<QueryPrimitive | null | undefined>

export type UsersAllStatusFilter = 'all' | 'active' | 'inactive' | 'root'

export type ClientsPagePathQuery = {
  page: number
  page_size: number
  search?: string | null
}

export type CheckinGuestsPathQuery = {
  page: number
  page_size: number
  search?: string | null
  filter?: 'ALL' | 'PENDING' | 'CONFIRMED' | 'DECLINED' | null
  qr?: string | null
  sort?: 'name' | 'status' | 'table' | 'guests_count' | null
  direction?: 'asc' | 'desc' | null
}

export type UsersAllPathQuery = {
  page?: number | null
  page_size?: number | null
  search?: string | null
  status?: UsersAllStatusFilter | null
}

export type EventsPageFilter = 'all' | 'upcoming' | 'today' | 'past'
export type EventsPagePathQuery = {
  page: number
  page_size: number
  search?: string | null
  filter?: EventsPageFilter | null
}

function encodePathSegment(value: string | number): string {
  const raw = String(value).trim()
  try {
    return encodeURIComponent(decodeURIComponent(raw))
  } catch {
    return encodeURIComponent(raw)
  }
}

function appendQueryValue(params: URLSearchParams, key: string, value: QueryValue) {
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(params, key, item)
    return
  }

  if (value === null || value === undefined || value === '') return
  params.append(key, String(value))
}

export function apiPath(path: string, query?: Record<string, QueryValue>): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query ?? {})) {
    appendQueryValue(params, key, value)
  }

  const queryString = params.toString()
  return queryString ? `${normalizedPath}?${queryString}` : normalizedPath
}

export function eventApiPath(eventId: string | number, suffix = '', query?: Record<string, QueryValue>): string {
  const cleanSuffix = suffix.replace(/^\/+/, '').replace(/\/+$/, '')
  const path = cleanSuffix
    ? `/events/${encodePathSegment(eventId)}/${cleanSuffix}`
    : `/events/${encodePathSegment(eventId)}`
  return apiPath(path, query)
}

export function eventMembersPath(eventId: string | number): string {
	return eventApiPath(eventId, 'members')
}

export function eventMemberPath(eventId: string | number, userId: string | number): string {
	return eventApiPath(eventId, `members/${encodePathSegment(userId)}`)
}

export function eventCapabilitiesPath(eventId: string | number): string {
	return eventApiPath(eventId, 'capabilities')
}

export function eventsPath(clientId?: string | number | null): string {
  return clientId ? apiPath('/events', { client_id: clientId }) : '/events'
}

export function applicationSessionPath(): string {
  return '/session'
}

export function organizationContextPath(): string {
  return '/session/organization-context'
}

export function auditLogsPath(query?: {
  page?: number
  page_size?: number
  status?: number
  resource_type?: string
  resource_id?: string
  succeeded?: boolean
}): string {
  return apiPath('/audit-logs', query)
}

export function metricsPortfolioPath(clientId?: string | number | null, days = 30): string {
  const today = new Date()
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - Math.max(1, days - 1))
  return apiPath('/metrics/portfolio', {
    client_id: clientId,
    from: from.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  })
}

export function scopedEventsPath(clientId: string | number | null | undefined, isRoot: boolean): string | null {
  if (clientId) return eventsPath(clientId)
  return isRoot ? eventsPath() : null
}

export function eventsPagePath(clientId: string | number | null | undefined, query: EventsPagePathQuery): string {
  return apiPath('/events', { client_id: clientId, ...query })
}

export function scopedEventsPagePath(
  clientId: string | number | null | undefined,
  isRoot: boolean,
  query: EventsPagePathQuery
): string | null {
  if (!clientId && !isRoot) return null
  return eventsPagePath(clientId, query)
}

export function eventsDashboardPath(clientId?: string | number | null): string {
  return clientId ? apiPath('/events/dashboard', { client_id: clientId }) : '/events/dashboard'
}

export function eventNotificationsPath(clientId?: string | number | null): string {
  return clientId ? apiPath('/events/notifications', { client_id: clientId }) : '/events/notifications'
}

export function scopedEventsDashboardPath(
  clientId: string | number | null | undefined,
  isRoot: boolean
): string | null {
  if (clientId) return eventsDashboardPath(clientId)
  return isRoot ? eventsDashboardPath() : null
}

export function eventsAllPath(): string {
  return '/events/all'
}

export function eventPath(eventId: string | number): string {
  return eventApiPath(eventId)
}

export function eventDetailPath(eventId: string | number): string {
  return eventApiPath(eventId, 'detail')
}

export function eventConfigPath(eventId: string | number): string {
  return eventApiPath(eventId, 'config')
}

export function studioWorkspacePath(eventId: string | number): string {
  return `/events/${encodePathSegment(eventId)}/studio-workspace`
}

export function checkinWorkspacePath(eventId: string | number): string {
  return `/events/${encodePathSegment(eventId)}/checkin-workspace`
}

export function eventAnalyticsPath(eventId: string | number): string {
  return eventApiPath(eventId, 'analytics')
}

export function eventCoverPath(eventId: string | number): string {
  return eventApiPath(eventId, 'cover')
}

export function eventCoverDeletePath(eventId: string | number): string {
  return eventApiPath(eventId, 'cover')
}

export function eventPreviewTokenPath(eventId: string | number): string {
  return eventApiPath(eventId, 'preview-token')
}

export function eventRepairPath(eventId: string | number): string {
  return eventApiPath(eventId, 'repair')
}

export function eventDuplicatePath(eventId: string | number): string {
  return eventApiPath(eventId, 'duplicate')
}

export function eventInvitationsPath(eventId: string | number): string {
  return eventApiPath(eventId, 'invitations')
}

export function eventSectionsPath(eventId: string | number): string {
  return eventApiPath(eventId, 'sections')
}

export function eventSectionsReorderPath(eventId: string | number): string {
  return eventApiPath(eventId, 'sections/reorder')
}

export function sectionPath(sectionId: string | number): string {
  return `/sections/${encodePathSegment(sectionId)}`
}

export function eventTablesPath(eventId: string | number): string {
  return eventApiPath(eventId, 'tables')
}

export function eventSeatingWorkspacePath(eventId: string | number): string {
  return eventApiPath(eventId, 'seating-workspace')
}

export function eventTablesAssignPath(eventId: string | number): string {
  return eventApiPath(eventId, 'tables/assign')
}

export function eventTablesPlanPath(eventId: string | number): string {
  return eventApiPath(eventId, 'tables/plan')
}

export function tablePath(tableId: string | number): string {
  return `/tables/${encodePathSegment(tableId)}`
}

export function clientsPath(): string {
  return '/clients'
}

export function clientsPagePath(query: ClientsPagePathQuery): string {
  return apiPath('/clients', query)
}

export function clientChildrenPath(parentId: string | number): string {
  return apiPath('/clients/children', { parent_id: parentId })
}

export function clientPath(clientId: string | number): string {
  return `/clients/${encodePathSegment(clientId)}`
}

export function clientInvitePath(): string {
  return '/clients/invite'
}

export function clientMembersPath(clientId?: string | number | null): string {
  return clientId ? apiPath('/clients/members', { client_id: clientId }) : '/clients/members'
}

export function clientMembersPagePath(
  clientId: string | number,
  page: number,
  pageSize: number,
  search?: string
): string {
  return apiPath('/clients/members', { client_id: clientId, page, page_size: pageSize, search })
}

export function clientMemberPath(userId: string | number, clientId: string | number): string {
  return apiPath(`/clients/members/${encodePathSegment(userId)}`, { client_id: clientId })
}

export function clientMemberApplicationsPath(clientId: string | number, userId: string | number): string {
  return `/clients/${encodePathSegment(clientId)}/member-applications/${encodePathSegment(userId)}`
}

export function clientMemberApplicationPath(
  clientId: string | number,
  userId: string | number,
  applicationCode: string
): string {
  return `${clientMemberApplicationsPath(clientId, userId)}/${encodePathSegment(applicationCode)}`
}

export function clientRolesPath(clientId: string | number): string {
  return apiPath('/catalogs/roles', { client_id: clientId })
}

export function clientTypesPath(parentTypeCode?: string | null): string {
  return parentTypeCode
    ? apiPath('/catalogs/client-types', { parent_type_code: parentTypeCode })
    : '/catalogs/client-types'
}

export function guestStatusesPath(): string {
  return '/catalogs/guest-statuses'
}

export function usersPath(): string {
  return '/users'
}

export function usersAllPath(query?: UsersAllPathQuery): string {
  return apiPath('/users/all', query)
}

export function userPath(userId: string | number): string {
  return `/users/${encodePathSegment(userId)}`
}

export function userClientsPath(userId: string | number): string {
  return `/users/${encodePathSegment(userId)}/clients`
}

export function userSummaryPath(userId: string | number): string {
  return apiPath(userPath(userId), { include_clients: false })
}

export function userClientsPagePath(userId: string | number, page: number, pageSize: number, search?: string): string {
  return apiPath(userClientsPath(userId), { page, page_size: pageSize, search })
}

export function userInvitePath(): string {
  return '/users/invite'
}

export function userAvatarPath(): string {
  return '/users/avatar'
}

export function userActivatePath(userId: string | number): string {
  return `/users/${encodePathSegment(userId)}/activate`
}

export function userDeactivatePath(userId: string | number): string {
  return `/users/${encodePathSegment(userId)}/deactivate`
}

export function userRootLevelPath(userId: string | number): string {
  return `/users/${encodePathSegment(userId)}/root-level`
}

export function momentsPath(eventId: string | number): string {
  return apiPath('/moments', { event_id: eventId })
}

export function momentsPagePath(eventId: string | number, page: number, pageSize: number): string {
  return apiPath('/moments', { event_id: eventId, page, page_size: pageSize })
}

export function inFlightMomentsPath(eventId: string | number): string {
  return apiPath('/moments/in-flight', { event_id: eventId })
}

export function reoptimizingMomentsPath(eventId: string | number): string {
  return apiPath('/moments/reoptimizing', { event_id: eventId })
}

export function momentActivityPath(eventId: string | number): string {
  return apiPath('/moments/activity', { event_id: eventId })
}

export function momentSummaryPath(eventIds: Array<string | number>): string {
  return apiPath('/moments/summary', { event_ids: eventIds.join(',') })
}

export function momentPath(momentId: string | number): string {
  return `/moments/${encodePathSegment(momentId)}`
}

export function momentRequeuePath(momentId: string | number): string {
  return `/moments/${encodePathSegment(momentId)}/requeue`
}

export function momentsReorderPath(): string {
  return '/moments/reorder'
}

export function momentsBatchReoptimizePath(): string {
  return '/moments/batch/reoptimize'
}

export function momentsBulkApprovePath(): string {
  return '/moments/bulk-approve'
}

export function momentsBulkDeletePath(): string {
  return '/moments/bulk'
}

export function eventGuestsPath(eventId: string | number): string {
  return `/guests/all:${encodePathSegment(eventId)}`
}

export function eventCheckinGuestsPath(eventId: string | number, query: CheckinGuestsPathQuery): string {
  return apiPath(`/guests/checkin:${encodePathSegment(eventId)}`, query)
}

export function eventGuestsPagePath(eventId: string | number, query: CheckinGuestsPathQuery): string {
  return apiPath(`/guests/page:${encodePathSegment(eventId)}`, query)
}

export function eventInvitationsPagePath(eventId: string | number, query: CheckinGuestsPathQuery): string {
  return apiPath(`/guests/invitations:${encodePathSegment(eventId)}`, query)
}

export function eventGuestsExportPath(
  eventId: string | number,
  query: Omit<CheckinGuestsPathQuery, 'page' | 'page_size' | 'qr'> & { view?: 'guests' | 'invitations' | 'rsvp' }
): string {
  return apiPath(`/events/${encodePathSegment(eventId)}/guests/export`, query)
}

export function eventAnalyticsGuestsPath(eventId: string | number): string {
  return `/guests/analytics:${encodePathSegment(eventId)}`
}

export function eventSeatingGuestsPath(eventId: string | number): string {
  return `/guests/seating:${encodePathSegment(eventId)}`
}

export function eventGuestShareSummaryPath(eventId: string | number): string {
  return `/guests/share:${encodePathSegment(eventId)}`
}

export function eventGuestSummaryPath(eventId: string | number): string {
  return `/guests/summary:${encodePathSegment(eventId)}`
}

export function guestPath(guestId: string | number): string {
  return `/guests/${encodePathSegment(guestId)}`
}

export function guestRsvpTokenPath(guestId: string | number): string {
  return `/guests/${encodePathSegment(guestId)}/rsvp-token`
}

export function bulkGuestsPath(): string {
  return '/guests/bulk'
}

export function bulkGuestStatusPath(): string {
  return '/guests/bulk/status'
}

export function batchGuestsPath(): string {
  return '/guests/batch'
}

export function guestsPath(): string {
  return '/guests'
}

export function resourcesPath(): string {
  return '/resources'
}

export function resourcesMultiplePath(): string {
  return '/resources/multiple'
}

export function resourcePath(resourceId: string | number): string {
  return `/resources/${encodePathSegment(resourceId)}`
}

export function resourceReplacePath(resourceId: string | number): string {
  return `/resources/${encodePathSegment(resourceId)}/replace`
}

export function resourceContentPath(resourceId: string | number): string {
  return `/resources/${encodePathSegment(resourceId)}/content`
}

export function sectionResourcesPath(sectionId: string | number): string {
  return `/admin/resources/section/${encodePathSegment(sectionId)}`
}

export function resourceTypesPath(): string {
  return '/catalogs/resource-types'
}

export function designTemplatesPath(): string {
  return '/catalogs/design-templates'
}

export function designCatalogWorkspacePath(): string {
  return '/catalogs/design-workspace'
}

export function designTemplatePath(templateId: string | number): string {
  return `/catalogs/design-templates/${encodePathSegment(templateId)}`
}

export function colorPalettesPath(): string {
  return '/catalogs/color-palettes'
}

export function fontSetsPath(): string {
  return '/catalogs/font-sets'
}

export function fontUploadPath(): string {
  return '/fonts/upload'
}

export function eventTypesPath(): string {
  return '/event-types'
}

export function invitationResendPath(invitationId: string | number): string {
  return `/invitations/${encodePathSegment(invitationId)}/resend`
}

export function cacheFlushPath(key: string | number): string {
  const encodedKey = encodePathSegment(key)
  if (!encodedKey || encodedKey.toLowerCase().includes('%2f')) {
    throw new Error('cacheFlushPath requires a non-empty single-segment cache key')
  }
  return `/cache/flush/${encodedKey}`
}

export function cacheFlushAllPath(): string {
  return '/cache/flush-all'
}
