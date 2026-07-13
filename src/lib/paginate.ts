export function paginateItems<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(Math.trunc(page), 1)
  const safePageSize = Math.max(Math.trunc(pageSize), 1)
  const start = (safePage - 1) * safePageSize
  return items.slice(start, start + safePageSize)
}
