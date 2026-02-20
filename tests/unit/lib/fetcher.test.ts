import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the api module before importing fetcher
vi.mock('@/lib/api', () => ({
    api: {
        get: vi.fn(),
    },
}))

// Import after mock is registered
import { api } from '@/lib/api'
import { fetcher } from '@/lib/fetcher'

const mockGet = vi.mocked(api.get)

describe('fetcher', () => {
    beforeEach(() => {
        mockGet.mockReset()
    })

    it('returns res.data.data when nested data property exists', async () => {
        mockGet.mockResolvedValue({ data: { data: [{ id: 1 }], status: 200 } })

        const result = await fetcher('/users/all')
        expect(result).toEqual([{ id: 1 }])
        expect(mockGet).toHaveBeenCalledWith('/users/all')
    })

    it('falls back to res.data when no nested data property', async () => {
        mockGet.mockResolvedValue({ data: { id: 42, name: 'Test' } })

        const result = await fetcher('/users')
        expect(result).toEqual({ id: 42, name: 'Test' })
    })

    it('returns undefined/null res.data.data as-is when explicitly null', async () => {
        // When data.data is null, nullish coalescing returns data instead
        mockGet.mockResolvedValue({ data: { data: null } })

        const result = await fetcher('/empty')
        // null ?? res.data = res.data (null is nullish)
        expect(result).toEqual({ data: null })
    })

    it('returns empty array when data.data is an empty array', async () => {
        mockGet.mockResolvedValue({ data: { data: [] } })

        const result = await fetcher('/events')
        // [] is NOT nullish, so returns []
        expect(result).toEqual([])
    })

    it('propagates errors from the api call', async () => {
        const error = new Error('Network Error')
        mockGet.mockRejectedValue(error)

        await expect(fetcher('/bad-endpoint')).rejects.toThrow('Network Error')
    })
})
