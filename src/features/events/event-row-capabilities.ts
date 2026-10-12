import type { AccessProfile } from '@/lib/access-profile'
import type { ApplicationSession } from '@/models/ApplicationSession'
import type { Event } from '@/models/Event'

type SessionAccess = Pick<ApplicationSession, 'organizations' | 'event_access'> | null | undefined

/**
 * Capabilities that decide a row's actions in the events list. In the
 * caller-access list a row can come from different organizations or from an
 * event grant, so the global union would over-promise:
 * - viewer_access 'event_client': the grant's capabilities;
 * - 'organization': that organization's capabilities, or none when the row's
 *   organization is not in the session (entitlement gap);
 * - absent (roots, organization workspace, flag off): the workspace profile.
 */
export function eventRowCapabilities(
  event: Pick<Event, 'viewer_access' | 'client_id'>,
  session: SessionAccess,
  profile: Pick<AccessProfile, 'capabilities'>
): string[] {
  if (event.viewer_access === 'event_client') return session?.event_access?.capabilities ?? []
  if (event.viewer_access === 'organization') {
    return session?.organizations.find((organization) => organization.id === event.client_id)?.capabilities ?? []
  }
  return profile.capabilities
}

export interface EventRowActions {
  canEdit: boolean
  canDuplicate: boolean
  canDelete: boolean
}

export function eventRowActions(capabilities: readonly string[]): EventRowActions {
  const canEdit = capabilities.includes('events:manage')
  return {
    canEdit,
    canDuplicate: canEdit && capabilities.includes('events:create'),
    canDelete: capabilities.includes('events:delete'),
  }
}

export function hasAnyEventRowAction(actions: EventRowActions): boolean {
  return actions.canEdit || actions.canDuplicate || actions.canDelete
}

/** Portfolio users may create when at least one session organization allows it. */
export function canCreateInAnyOrganization(session: SessionAccess): boolean {
  return (session?.organizations ?? []).some((organization) => organization.capabilities?.includes('events:create'))
}

const CAPABILITY_SUMMARY: Array<[string, string]> = [
  ['guests:manage', 'gestionar invitados'],
  ['checkin:run', 'operar el check-in'],
  ['analytics:view', 'consultar métricas'],
]

/** 'Tu rol permite …' fragment for users without row actions. */
export function eventRoleAllowanceSummary(capabilities: readonly string[]): string {
  const parts = CAPABILITY_SUMMARY.filter(([capability]) => capabilities.includes(capability)).map(([, label]) => label)
  if (parts.length === 0) return 'ver los eventos'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}
