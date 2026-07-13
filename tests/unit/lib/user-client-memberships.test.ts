import { filterUserClients, summarizeUserClients } from '@/lib/user-client-memberships'
import type { Client } from '@/models/Client'
import { describe, expect, it } from 'vitest'

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    name: 'Agencia Norte',
    code: 'NORTE',
    client_type_id: 'type-1',
    is_active: true,
    ...overrides,
  } as Client
}

describe('user client memberships', () => {
  const clients = [
    client({ id: 'agency', client_type: { id: 'type-1', name: 'Agencia', code: 'AGENCY' } as Client['client_type'] }),
    client({ id: 'customer', name: 'Bodas Luna', code: 'LUNA', is_active: false }),
  ]

  it('returns the original collection for a blank query', () => {
    expect(filterUserClients(clients, '   ')).toBe(clients)
  })

  it('searches name, code, and client type without case sensitivity', () => {
    expect(filterUserClients(clients, 'luna').map(({ id }) => id)).toEqual(['customer'])
    expect(filterUserClients(clients, 'agency').map(({ id }) => id)).toEqual(['agency'])
    expect(filterUserClients(clients, 'AGENCIA').map(({ id }) => id)).toEqual(['agency'])
  })

  it('summarizes active and inactive memberships', () => {
    expect(summarizeUserClients(clients)).toEqual({ total: 2, active: 1, inactive: 1 })
  })
})
