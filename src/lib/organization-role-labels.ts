/**
 * Spanish labels for organization role codes. The backend role catalog names
 * roles in English ("Owner", "Event manager"); the UI must not show those.
 */
const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  administrator: 'Administrador',
  event_manager: 'Gestor de eventos',
  manager: 'Gestor de eventos',
  editor: 'Editor',
  checkin: 'Check-in',
  analyst: 'Analista',
  member: 'Colaborador',
  viewer: 'Solo lectura',
  guest: 'Solo lectura',
}

function normalizeRoleKey(value: string): string {
  return value
    .trim()
    .replace(/^inherited_/i, '')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/** Label for a role code or English role name; falls back to the given name. */
export function organizationRoleLabel(code?: string | null, fallbackName?: string | null): string {
  for (const candidate of [code, fallbackName]) {
    if (!candidate) continue
    const label = ORGANIZATION_ROLE_LABELS[normalizeRoleKey(candidate)]
    if (label) return label
  }
  return fallbackName?.trim() || code?.trim() || 'Miembro'
}
