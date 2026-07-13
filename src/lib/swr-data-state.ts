export type DataErrorState = 'fatal' | 'stale' | null

export function getDataErrorState(error: unknown, data: unknown): DataErrorState {
  if (!error) return null
  return data === undefined ? 'fatal' : 'stale'
}
