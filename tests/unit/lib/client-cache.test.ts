import { isClientsCacheKey, removeClientsCacheValue, upsertClientCacheValue } from '@/lib/client-cache'
import type { Client } from '@/models/Client'
import { describe, expect, it } from 'vitest'

function client(id: string, patch: Partial<Client> = {}): Client {
  return {
    id,
    name: `Client ${id}`,
    code: id,
    client_type_id: 'type-1',
    client_type: { id: 'type-1', name: 'Agency', code: 'AGENCY' },
    ...patch,
  } as Client
}

describe('client cache mutations', () => {
  it('matches legacy and paginated client cache keys', () => {
    expect(isClientsCacheKey('/clients')).toBe(true)
    expect(isClientsCacheKey('/clients?page=2&page_size=12')).toBe(true)
    expect(isClientsCacheKey('/clients/children?parent_id=one')).toBe(false)
  })
  it('seeds empty caches when upserting a client', () => {
    expect(upsertClientCacheValue(undefined, client('client-1'))).toEqual([client('client-1')])
    expect(upsertClientCacheValue({ status: 200, message: 'No data loaded' }, client('client-1'))).toEqual({
      status: 200,
      message: 'No data loaded',
      data: [client('client-1')],
    })
    expect(upsertClientCacheValue({ Status: 200, Message: 'No data loaded' }, client('client-1'))).toEqual({
      Status: 200,
      Message: 'No data loaded',
      Data: [client('client-1')],
    })
  })

  it('upserts clients without dropping existing relationship metadata', () => {
    expect(
      upsertClientCacheValue([client('client-1')], client('client-1', { name: 'Updated', client_type: undefined }))
    ).toEqual([client('client-1', { name: 'Updated' })])
  })

  it('normalizes Go casing aliases while preserving existing client relationships', () => {
    const payload = {
      Status: 200,
      Message: 'User clients',
      Data: {
        Items: [
          {
            ID: 'client-1',
            Name: 'Old',
            Code: 'old',
            ClientTypeID: 'type-1',
            ClientType: { ID: 'type-1', Name: 'Agency', Code: 'AGENCY' },
          },
        ],
        Total: 1,
      },
    }

    expect(
      upsertClientCacheValue(payload, {
        ID: 'client-1',
        Name: 'Updated',
        ClientType: undefined,
      } as unknown as Client)
    ).toEqual({
      Status: 200,
      Message: 'User clients',
      Data: {
        Items: [
          client('client-1', {
            name: 'Updated',
            code: 'old',
            client_type: { id: 'type-1', name: 'Agency', code: 'AGENCY' } as Client['client_type'],
          }),
        ],
        Total: 1,
      },
    })
  })

  it('adds and removes clients in paginated/enveloped lists', () => {
    const payload = {
      status: 200,
      message: 'User clients',
      data: { data: [client('client-1')], total: 1 },
    }

    expect(upsertClientCacheValue(payload, client('client-2'))).toEqual({
      status: 200,
      message: 'User clients',
      data: { data: [client('client-1'), client('client-2')], total: 2 },
    })

    expect(removeClientsCacheValue(payload, ['client-1'])).toEqual({
      status: 200,
      message: 'User clients',
      data: { data: [], total: 0 },
    })
  })

  it('updates non-empty client list aliases before empty canonical list aliases', () => {
    expect(
      upsertClientCacheValue(
        {
          status: 200,
          message: 'User clients',
          data: {
            data: [],
            Items: [client('client-1')],
            Total: 1,
          },
        },
        client('client-2')
      )
    ).toMatchObject({
      data: {
        data: [],
        Items: [expect.objectContaining({ id: 'client-1' }), expect.objectContaining({ id: 'client-2' })],
        Total: 2,
      },
    })
  })

  it('updates useful direct Data client pages before empty canonical containers', () => {
    const payload = {
      data: { items: [] },
      Data: {
        Items: [client('client-1'), client('client-2')],
        Total: 2,
      },
    }

    expect(upsertClientCacheValue(payload, client('client-3'))).toEqual({
      data: { items: [] },
      Data: {
        Items: [client('client-1'), client('client-2'), client('client-3')],
        Total: 3,
      },
    })

    expect(removeClientsCacheValue(payload, ['client-1'])).toEqual({
      data: { items: [] },
      Data: {
        Items: [client('client-2')],
        Total: 1,
      },
    })
  })

  it('preserves Pascal-cased paginated list envelopes', () => {
    const payload = {
      Status: 200,
      Message: 'User clients',
      Data: { Items: [client('client-1')], Total: 1 },
    }

    expect(upsertClientCacheValue(payload, client('client-2'))).toEqual({
      Status: 200,
      Message: 'User clients',
      Data: { Items: [client('client-1'), client('client-2')], Total: 2 },
    })

    expect(removeClientsCacheValue(payload, ['client-1'])).toEqual({
      Status: 200,
      Message: 'User clients',
      Data: { Items: [], Total: 0 },
    })
  })
})
