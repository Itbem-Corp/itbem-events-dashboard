/** Lower-cases and strips accents so "nandu" matches "Ñandú" in event searches. */
export function normalizeEventSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim()
}

/** True when the event name or URL contains the search text, ignoring accents and case. */
export function eventMatchesSearch(event: { name: string; identifier?: string | null }, search: string): boolean {
  const query = normalizeEventSearchText(search)
  if (!query) return true
  return normalizeEventSearchText(`${event.name} ${event.identifier ?? ''}`).includes(query)
}
