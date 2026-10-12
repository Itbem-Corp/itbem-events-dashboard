// Client-side mirror of the backend member-management guards
// (itbem-events-backend services/clients/clientService.go AuthorizeMemberTarget,
// RemoveClientMember, UpdateClientMemberRole and the *AsRoot variants, plus
// controllers/clients/clients.go operationalRootMayNotManageRootTarget).
// It only hides controls the API would refuse; the API stays the authority.

import { getApiErrorMessage } from '@/lib/api-error'

type RootFlags = {
  is_root?: boolean | null
  root_level?: number | null
}

/**
 * A primary platform root (Root 1): root_level 1, or the legacy shape where
 * is_root is set without a root level. The backend refuses to delete or
 * deactivate these accounts (409 protected account).
 */
export function isPrimaryRootAccount(user: RootFlags | null | undefined): boolean {
  if (!user) return false
  return user.root_level === 1 || (Boolean(user.is_root) && !user.root_level)
}

/** Any platform root account (Root 1 or Root 2). */
export function isPlatformRootAccount(user: RootFlags | null | undefined): boolean {
  if (!user) return false
  return Boolean(user.is_root) || user.root_level === 1 || user.root_level === 2
}

export type ManageableMember = {
  user_id: string
  role_id: string
  role_code?: string | null
  role?: string | null
  role_name?: string | null
}

export type MemberManagementInput = {
  member: ManageableMember
  /** Role ids returned by GET /catalogs/roles: the roles the caller may assign. */
  assignableRoleIds: ReadonlySet<string> | readonly string[]
  /** The signed-in user (store `user`). */
  requester: (RootFlags & { id?: string | null }) | null | undefined
}

function normalizedRole(member: ManageableMember): string {
  return (member.role_code ?? member.role ?? '').trim().toUpperCase()
}

function hasRoleId(ids: MemberManagementInput['assignableRoleIds'], roleId: string): boolean {
  return Array.isArray(ids) ? ids.includes(roleId) : (ids as ReadonlySet<string>).has(roleId)
}

/**
 * Whether the caller may change this member (role, removal, application
 * access). Matches the backend:
 * - nobody changes an Owner from member management (direct or inherited);
 * - inherited access is not a direct membership in this organization, so it
 *   cannot be edited or removed here;
 * - an Owner/Admin may act only on members ranked strictly below them, which
 *   is exactly the set of roles the catalog lets them assign, and never on
 *   themselves;
 * - a platform root acts on any non-Owner member through the same catalog
 *   (Root 2 never sees Admin, Event manager or Editor).
 */
export function canManageClientMember({ member, assignableRoleIds, requester }: MemberManagementInput): boolean {
  const role = normalizedRole(member)
  const roleName = (member.role_name ?? '').trim().toUpperCase()
  if (role === 'OWNER' || roleName === 'OWNER') return false
  if (role.startsWith('INHERITED_')) return false
  if (!member.role_id || !hasRoleId(assignableRoleIds, member.role_id)) return false
  const isSelf = Boolean(requester?.id) && requester?.id === member.user_id
  if (isSelf && !isPlatformRootAccount(requester)) return false
  return true
}

// The backend answers member-management denials with English reasons. These
// are matched as substrings of the API message so a wording tweak in the
// prefix ("permission denied: ...") does not break the mapping.
const MEMBER_DENIAL_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  [
    'equal or higher hierarchy',
    'No puedes cambiar el acceso de alguien con un rol igual o superior al tuyo en esta organización (incluye Propietarios y Administradores heredados).',
  ],
  ["organization owner's access cannot be changed", 'El acceso del Propietario de la organización no se puede cambiar.'],
  ['organization owner cannot be', 'El Propietario de la organización no se puede modificar ni quitar.'],
  ['platform-root accounts', 'Las cuentas de plataforma solo las administra un Root 1.'],
  ['cannot modify platform-root', 'Las cuentas de plataforma solo las administra un Root 1.'],
  ['role equal or higher than your own', 'No puedes asignar un rol igual o superior al tuyo.'],
  ['owner role cannot be assigned', 'El rol de Propietario no se asigna desde la gestión del equipo.'],
  [
    'cannot assign a role with more capabilities',
    'Tu nivel de plataforma no permite asignar un rol con más permisos que los tuyos.',
  ],
  ['cannot remove yourself', 'No puedes quitarte a ti mismo de la organización.'],
  ['cannot manage members for this client', 'No tienes permiso para administrar el equipo de esta organización.'],
  ['cannot add members to this client', 'No tienes permiso para agregar miembros a esta organización.'],
]

/** Spanish copy for a known member-management denial, or null. */
export function memberAccessDenialMessage(error: unknown): string | null {
  // The envelope is { status, message: 'Permission Denied', error: '<reason>' }
  // and getApiErrorMessage prefers `message`, so read every text field.
  const payload = (error as { response?: { data?: unknown } } | null)?.response?.data
  const fields =
    payload && typeof payload === 'object'
      ? ['error', 'Error', 'detail', 'Detail', 'message', 'Message']
          .map((key) => (payload as Record<string, unknown>)[key])
          .filter((value): value is string => typeof value === 'string')
      : []
  const raw = [...fields, getApiErrorMessage(error, '')].join(' ').toLowerCase()
  if (!raw.trim()) return null
  for (const [needle, message] of MEMBER_DENIAL_MESSAGES) {
    if (raw.includes(needle.toLowerCase())) return message
  }
  return null
}

/** HTTP status of an Axios-like error, if any. */
export function apiErrorStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}
