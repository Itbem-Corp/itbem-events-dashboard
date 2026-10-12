import type { Client } from '@/models/Client'
import type { UserClientsPageResponse } from '@/models/User'

export interface UserClientMembershipSummary {
  total: number
  active: number
  inactive: number
}

function searchableClientText(client: Client): string {
  return [client.name, client.code, client.client_type?.name, client.client_type?.code]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es')
}

export function filterUserClients(clients: Client[], query: string): Client[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('es')
  if (!normalizedQuery) return clients
  return clients.filter((client) => searchableClientText(client).includes(normalizedQuery))
}

export function summarizeUserClients(clients: Client[]): UserClientMembershipSummary {
  const active = clients.filter((client) => client.is_active !== false).length
  return {
    total: clients.length,
    active,
    inactive: clients.length - active,
  }
}

/** Inherited rows come from a parent membership: they cannot be removed or re-roled here. */
export function isInheritedMembership(client: Pick<Client, 'inherited' | 'access_role'>): boolean {
  return client.inherited === true || (client.access_role?.toUpperCase().startsWith('INHERITED_') ?? false)
}

/** Backend counters are omitempty: a missing one means 0. */
export function membershipCounters(page?: Partial<UserClientsPageResponse> | null) {
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  return {
    total: count(page?.total),
    direct: count(page?.direct),
    inherited: count(page?.inherited),
    active: count(page?.active),
    inactive: count(page?.inactive),
  }
}
