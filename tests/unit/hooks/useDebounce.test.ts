import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDebounce } from '@/hooks/useDebounce'

describe('useDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns initial value immediately', () => {
        const { result } = renderHook(() => useDebounce('hello', 300))
        expect(result.current).toBe('hello')
    })

    it('does not update value before delay elapses', () => {
        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebounce(value, delay),
            { initialProps: { value: 'initial', delay: 500 } }
        )

        rerender({ value: 'updated', delay: 500 })

        // Advance only 499ms — should still be 'initial'
        act(() => {
            vi.advanceTimersByTime(499)
        })

        expect(result.current).toBe('initial')
    })

    it('updates value after delay elapses', () => {
        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebounce(value, delay),
            { initialProps: { value: 'initial', delay: 300 } }
        )

        rerender({ value: 'updated', delay: 300 })

        act(() => {
            vi.advanceTimersByTime(300)
        })

        expect(result.current).toBe('updated')
    })

    it('resets timer when value changes before delay elapses', () => {
        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebounce(value, delay),
            { initialProps: { value: 'a', delay: 300 } }
        )

        // Change to 'b' at t=0
        rerender({ value: 'b', delay: 300 })

        // Advance 200ms (timer not yet fired)
        act(() => {
            vi.advanceTimersByTime(200)
        })

        // Change to 'c' at t=200 — should reset timer
        rerender({ value: 'c', delay: 300 })

        // Advance another 200ms (total 400ms but timer was reset at 200ms)
        act(() => {
            vi.advanceTimersByTime(200)
        })

        // Timer should NOT have fired yet (only 200ms since last change)
        expect(result.current).toBe('a')

        // Advance remaining 100ms
        act(() => {
            vi.advanceTimersByTime(100)
        })

        expect(result.current).toBe('c')
    })
})
