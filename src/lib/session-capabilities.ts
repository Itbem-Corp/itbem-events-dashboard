import type { ApplicationSession } from '@/models/ApplicationSession'

export function sessionCan(
  session: ApplicationSession | null | undefined,
  capability: string
): boolean {
  return session?.capabilities.includes(capability) ?? false
}

export function organizationCan(
  session: ApplicationSession | null | undefined,
  organizationId: string | null | undefined,
  capability: string
): boolean {
  if (!organizationId) return false
  return session?.organizations
    .find((organization) => organization.id === organizationId)
    ?.capabilities.includes(capability) ?? false
}
