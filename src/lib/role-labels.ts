// Spanish display names for the raw role codes the API returns. The session
// sends organization roles in mixed case ("Owner", "EVENT_MANAGER") and may
// prefix roles that come from a parent organization with INHERITED_. Only the
// presentation changes here: authorization always uses the raw code and the
// capabilities the server returns.

const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  EVENT_MANAGER: 'Gestor de eventos',
  EDITOR: 'Editor',
  CHECKIN: 'Check-in',
  ANALYST: 'Analista',
  MEMBER: 'Colaborador',
  GUEST: 'Solo lectura',
  VIEWER: 'Solo lectura',
  EVENT_CLIENT: 'Cliente del evento',
  PLATFORM: 'Plataforma',
}

const EVENT_ROLE_LABELS: Record<string, string> = {
  EVENT_OWNER: 'Responsable del evento',
  MANAGER: 'Gestor del evento',
  EDITOR: 'Editor',
  CHECKIN: 'Check-in',
  ANALYST: 'Analista',
  VIEWER: 'Solo lectura',
}

const INHERITED_PREFIX = 'INHERITED_'

export function organizationRoleLabel(code: string | null | undefined): string {
  const raw = code?.trim() ?? ''
  const normalized = raw.toUpperCase()
  if (!normalized) return ''

  const inherited = normalized.startsWith(INHERITED_PREFIX)
  const base = inherited ? normalized.slice(INHERITED_PREFIX.length) : normalized
  const label = ORGANIZATION_ROLE_LABELS[base]
  if (!label) return raw
  return inherited ? `${label} (heredado)` : label
}

export function eventRoleLabel(code: string | null | undefined): string {
  const raw = code?.trim() ?? ''
  if (!raw) return ''
  return EVENT_ROLE_LABELS[raw.toUpperCase()] ?? raw
}
