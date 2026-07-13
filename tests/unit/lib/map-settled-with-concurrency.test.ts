import { mapSettledWithConcurrency } from '@/lib/map-settled-with-concurrency'
import { describe, expect, it } from 'vitest'

describe('mapSettledWithConcurrency', () => {
  it('processes every item while respecting the concurrency cap', async () => {
    let active = 0
    let peak = 0
    const results = await mapSettledWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return value * 2
    })

    expect(peak).toBe(3)
    expect(results).toEqual([2, 4, 6, 8, 10, 12].map((value) => ({ status: 'fulfilled', value })))
  })

  it('preserves order and captures individual failures without stopping the queue', async () => {
    const error = new Error('failed two')
    const results = await mapSettledWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) throw error
      return value
    })

    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: error },
      { status: 'fulfilled', value: 3 },
    ])
  })

  it('normalizes invalid concurrency and handles an empty queue', async () => {
    expect(await mapSettledWithConcurrency([], 4, async (value) => value)).toEqual([])
    expect(await mapSettledWithConcurrency([1], 0, async (value) => value)).toEqual([
      { status: 'fulfilled', value: 1 },
    ])
  })
})
