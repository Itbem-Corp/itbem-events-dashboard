export const PUBLIC_GUEST_ROLES = [
  { value: 'guest', label: 'Invitado' },
  { value: 'graduate', label: 'Graduado' },
  { value: 'host', label: 'Anfitrión' },
  { value: 'vip', label: 'VIP' },
  { value: 'speaker', label: 'Orador' },
  { value: 'staff', label: 'Staff' },
] as const

export type PublicGuestRoleValue = (typeof PUBLIC_GUEST_ROLES)[number]['value']

const HOST_GUEST_ROLES = new Set(['host', 'hosts', 'cohost', 'cohosts', 'anfitrion', 'anfitriona', 'anfitriones'])

export function normalizePublicGuestRole(role: unknown): string {
  if (typeof role !== 'string') return ''
  return role
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ \t\-_]/g, '')
}

export function isHostGuestRole(role: unknown): boolean {
  return HOST_GUEST_ROLES.has(normalizePublicGuestRole(role))
}
