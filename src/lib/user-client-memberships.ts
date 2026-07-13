import type { Client } from '@/models/Client'

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
