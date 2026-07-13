export async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> {
  if (items.length === 0) return []

  const results = new Array<PromiseSettledResult<R>>(items.length)
  const workerCount = Math.min(items.length, Math.max(1, Math.trunc(concurrency)))
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        try {
          results[index] = { status: 'fulfilled', value: await worker(items[index], index) }
        } catch (reason) {
          results[index] = { status: 'rejected', reason }
        }
      }
    })
  )

  return results
}
