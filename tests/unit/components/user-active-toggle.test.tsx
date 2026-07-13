import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserActiveToggle } from '@/components/users/UserActiveToggle'
import { api } from '@/lib/api'
import type { AdminUserListItemResponse, AdminUserResponse } from '@/models/User'
import { useSWRConfig } from 'swr'

vi.mock('@/lib/api', () => ({
  api: {
    put: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('swr', () => ({
  useSWRConfig: vi.fn(),
}))

function listUser(patch: Partial<AdminUserListItemResponse> = {}): AdminUserListItemResponse {
  return {
    id: 'user-001',
    email: 'old@example.com',
    first_name: 'Old',
    last_name: 'Name',
    is_active: false,
    is_root: false,
    clients: 3,
    created_at: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

function adminUser(patch: Partial<AdminUserResponse> = {}): AdminUserResponse {
  return {
    id: 'user-001',
    email: 'ana@example.com',
    first_name: 'Ana',
    last_name: 'Lopez',
    is_active: true,
    is_root: false,
    created_at: '2026-01-01T00:00:00Z',
    ...patch,
  }
}

describe('UserActiveToggle', () => {
  const mutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSWRConfig).mockReturnValue({ mutate } as unknown as ReturnType<typeof useSWRConfig>)
  })

  it('uses the backend activate response without losing list-only user fields', async () => {
    const current = {
      Status: 200,
      Message: 'Users',
      Data: { Items: [listUser()], Total: 1 },
    }
    let mutatedValue: unknown
    mutate.mockImplementation(async (_key: unknown, updater: unknown) => {
      if (typeof updater === 'function') mutatedValue = await updater(current)
      return mutatedValue
    })
    vi.mocked(api.put).mockResolvedValueOnce({
      data: {
        status: 200,
        message: 'User activated',
        data: adminUser(),
      },
    })

    render(<UserActiveToggle user={listUser()} />)
    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/users/user-001/activate')
    })

    expect(mutate).toHaveBeenNthCalledWith(1, expect.any(Function), expect.any(Function), {
      revalidate: false,
    })
    expect(mutate).toHaveBeenNthCalledWith(2, expect.any(Function), expect.any(Function), {
      revalidate: false,
    })
    expect(mutate).toHaveBeenCalledTimes(2)
    const cacheKeyMatcher = mutate.mock.calls[0][0] as (key: unknown) => boolean
    expect(cacheKeyMatcher('/users/all')).toBe(true)
    expect(cacheKeyMatcher('/users/all?page=2&page_size=10')).toBe(true)
    expect(mutatedValue).toMatchObject({
      Status: 200,
      Data: {
        Items: [
          {
            id: 'user-001',
            email: 'ana@example.com',
            first_name: 'Ana',
            last_name: 'Lopez',
            is_active: true,
            clients: 3,
          },
        ],
      },
    })
  })

  it('restores the previous active value immediately when the request fails', async () => {
    const current = { data: { data: [listUser()], total: 1 } }
    const values: unknown[] = []
    mutate.mockImplementation(async (_key: unknown, updater: unknown) => {
      if (typeof updater === 'function') values.push(await updater(current))
      return current
    })
    vi.mocked(api.put).mockRejectedValueOnce(new Error('offline'))

    render(<UserActiveToggle user={listUser()} />)
    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    expect(values[0]).toMatchObject({ data: { data: [{ is_active: true }] } })
    expect(values[1]).toMatchObject({ data: { data: [{ is_active: false }] } })
  })
})
