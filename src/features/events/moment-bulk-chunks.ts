/**
 * The bulk moment routes (POST /moments/bulk-approve, DELETE /moments/bulk,
 * PATCH /moments/reorder) accept at most 5000 ids per request and answer
 * 400 "Too many IDs" above it. Whole-event actions send their ids in chunks
 * of this size so very large events keep working.
 */
export const MOMENT_BULK_MAX_IDS = 5000

export function chunkMomentIds<T>(ids: readonly T[], size = MOMENT_BULK_MAX_IDS): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('chunk size must be a positive integer')
  const chunks: T[][] = []
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size))
  return chunks
}
