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

    it('returns normalized data from the api instance', async () => {
        mockGet.mockResolvedValue({
            data: {
                status: 200,
                message: 'Users loaded',
                data: [{ id: 1 }],
            },
        })

        const result = await fetcher('/users/all')
        expect(result).toEqual([{ id: 1 }])
        expect(mockGet).toHaveBeenCalledWith('/users/all')
    })

    it('unwraps backend envelopes even when the api interceptor is mocked out', async () => {
        mockGet.mockResolvedValue({
            data: {
                status: 200,
                message: 'Event loaded',
                data: { id: 42, name: 'Evento' },
            },
        })

        const result = await fetcher('/events/42/detail')
        expect(result).toEqual({ id: 42, name: 'Evento' })
    })

    it('falls back to res.data when no backend envelope exists', async () => {
        mockGet.mockResolvedValue({ data: { id: 42, name: 'Test' } })

        const result = await fetcher('/users')
        expect(result).toEqual({ id: 42, name: 'Test' })
    })

    it('returns null normalized data as-is', async () => {
        mockGet.mockResolvedValue({ data: null })

        const result = await fetcher('/empty')
        expect(result).toBeNull()
    })

    it('returns empty arrays from normalized responses', async () => {
        mockGet.mockResolvedValue({ data: [] })

        const result = await fetcher('/events')
        expect(result).toEqual([])
    })

    it('does not unwrap direct paginated payloads with their own data field', async () => {
        const payload = { data: [{ id: 1 }], total: 1 }
        mockGet.mockResolvedValue({ data: payload })

        const result = await fetcher('/paginated')
        expect(result).toBe(payload)
    })

    it('does not reinterpret domain payloads with data and message fields', async () => {
        const payload = { data: [{ id: 1 }], message: 'domain metadata', total: 1 }
        mockGet.mockResolvedValue({ data: payload })

        const result = await fetcher('/domain-payload')
        expect(result).toBe(payload)
    })

    it('propagates errors from the api call', async () => {
        const error = new Error('Network Error')
        mockGet.mockRejectedValue(error)

        await expect(fetcher('/bad-endpoint')).rejects.toThrow('Network Error')
    })
})
