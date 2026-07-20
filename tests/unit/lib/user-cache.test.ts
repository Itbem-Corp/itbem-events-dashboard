import { isUsersAllCacheKey, patchUserCacheValue, removeUsersCacheValue, upsertUserCacheValue } from '@/lib/user-cache'
import type { AdminUserListItemResponse, AdminUserResponse } from '@/models/User'
import { describe, expect, it } from 'vitest'

describe('isUsersAllCacheKey', () => {
  it('matches tenant-scoped user list keys', () => {
    expect(isUsersAllCacheKey(['/users/all?page=1', 'eventiapp', 'platform', null])).toBe(true)
    expect(isUsersAllCacheKey(['/users/user-1', 'eventiapp', 'platform', null])).toBe(false)
  })
})

function listUser(id: string, patch: Partial<AdminUserListItemResponse> = {}): AdminUserListItemResponse {
  return {
    id,
    email: `${id}@example.com`,
    first_name: 'User',
    last_name: id,
    is_active: true,
    is_root: false,
    clients: 2,
    created_at: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

function adminUser(id: string, patch: Partial<AdminUserResponse> = {}): AdminUserResponse {
  return {
    id,
    email: `${id}@example.com`,
    first_name: 'User',
    last_name: id,
    is_active: true,
    is_root: false,
    created_at: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

describe('user cache mutations', () => {
  it('matches paginated users cache keys', () => {
    expect(isUsersAllCacheKey('/users/all')).toBe(true)
    expect(isUsersAllCacheKey('/users/all?page=2&page_size=10')).toBe(true)
    expect(isUsersAllCacheKey('/users')).toBe(false)
  })

  it('patches direct and paginated user lists', () => {
    expect(patchUserCacheValue([listUser('user-1')], 'user-1', { is_active: false })).toEqual([
      listUser('user-1', { is_active: false }),
    ])

    expect(
      patchUserCacheValue({ data: [listUser('user-1')], total: 1, page: 1 }, 'user-1', { is_active: false })
    ).toEqual({
      data: [listUser('user-1', { is_active: false })],
      total: 1,
      page: 1,
    })
  })

  it('upserts admin user responses without losing client counts', () => {
    expect(
      upsertUserCacheValue([listUser('user-1')], adminUser('user-1', { first_name: 'Updated' }))
    ).toEqual([listUser('user-1', { first_name: 'Updated' })])
  })

  it('normalizes Go casing aliases while preserving admin list metadata', () => {
    const payload = {
      Status: 200,
      Message: 'Users',
      Data: {
        Items: [
          {
            ID: 'user-1',
            Email: 'user-1@example.com',
            FirstName: 'User',
            LastName: 'One',
            IsActive: true,
            IsRoot: false,
            Clients: 2,
            CreatedAt: '2026-01-01T00:00:00Z',
            ProfileImage: 'old.webp',
          },
        ],
        Total: 1,
      },
    }

    expect(
      patchUserCacheValue(payload, 'user-1', {
        FirstName: 'Updated',
        IsActive: false,
      } as unknown as Partial<AdminUserListItemResponse>)
    ).toEqual({
      Status: 200,
      Message: 'Users',
      Data: {
        Items: [listUser('user-1', { first_name: 'Updated', is_active: false, last_name: 'One', profile_image: 'old.webp' })],
        Total: 1,
      },
    })

    expect(
      upsertUserCacheValue(payload, {
        ID: 'user-1',
        Email: 'user-1@example.com',
        FirstName: 'Updated',
        LastName: 'One',
        IsActive: true,
        IsRoot: false,
        CreatedAt: '2026-01-01T00:00:00Z',
        ProfileImage: 'new.webp',
      } as unknown as AdminUserResponse)
    ).toEqual({
      Status: 200,
      Message: 'Users',
      Data: {
        Items: [listUser('user-1', { first_name: 'Updated', last_name: 'One', clients: 2, profile_image: 'new.webp' })],
        Total: 1,
      },
    })
  })

  it('seeds empty caches and defaults new invite client counts to zero', () => {
    expect(upsertUserCacheValue(undefined, adminUser('user-1'))).toEqual([listUser('user-1', { clients: 0 })])
    expect(upsertUserCacheValue({ status: 200, message: 'Users' }, adminUser('user-1'))).toEqual({
      status: 200,
      message: 'Users',
      data: [listUser('user-1', { clients: 0 })],
    })
    expect(upsertUserCacheValue({ Status: 200, Message: 'Users' }, adminUser('user-1'))).toEqual({
      Status: 200,
      Message: 'Users',
      Data: [listUser('user-1', { clients: 0 })],
    })
  })

  it('removes users without dropping paginated metadata', () => {
    expect(removeUsersCacheValue({ data: [listUser('user-1'), listUser('user-2')], total: 2 }, ['user-1'])).toEqual({
      data: [listUser('user-2')],
      total: 1,
    })
  })

  it('updates non-empty user list aliases before empty canonical list aliases', () => {
    expect(
      patchUserCacheValue(
        {
          status: 200,
          message: 'Users',
          data: {
            data: [],
            Items: [listUser('user-1'), listUser('user-2')],
            Total: 2,
          },
        },
        'user-2',
        { is_active: false }
      )
    ).toMatchObject({
      data: {
        data: [],
        Items: [
          expect.objectContaining({ id: 'user-1', is_active: true }),
          expect.objectContaining({ id: 'user-2', is_active: false }),
        ],
        Total: 2,
      },
    })
  })

  it('updates useful direct Data user pages before empty canonical containers', () => {
    const payload = {
      data: { items: [] },
      Data: {
        Items: [listUser('user-1'), listUser('user-2')],
        Total: 2,
      },
    }

    expect(upsertUserCacheValue(payload, adminUser('user-3'))).toEqual({
      data: { items: [] },
      Data: {
        Items: [listUser('user-1'), listUser('user-2'), listUser('user-3', { clients: 0 })],
        Total: 3,
      },
    })

    expect(removeUsersCacheValue(payload, ['user-1'])).toEqual({
      data: { items: [] },
      Data: {
        Items: [listUser('user-2')],
        Total: 1,
      },
    })
  })

  it('preserves Pascal-cased paginated list envelopes', () => {
    const payload = {
      Status: 200,
      Message: 'Users',
      Data: { Items: [listUser('user-1')], Total: 1 },
    }

    expect(patchUserCacheValue(payload, 'user-1', { is_active: false })).toEqual({
      Status: 200,
      Message: 'Users',
      Data: { Items: [listUser('user-1', { is_active: false })], Total: 1 },
    })

    expect(upsertUserCacheValue(payload, adminUser('user-2'))).toEqual({
      Status: 200,
      Message: 'Users',
      Data: { Items: [listUser('user-1'), listUser('user-2', { clients: 0 })], Total: 2 },
    })

    expect(removeUsersCacheValue(payload, ['user-1'])).toEqual({
      Status: 200,
      Message: 'Users',
      Data: { Items: [], Total: 0 },
    })
  })
})
