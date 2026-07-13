import { cacheRecordId } from '@/lib/cache-record'
import type { EventSection } from '@/models/EventSection'

export function compareEventSectionsByRenderOrder(a: EventSection, b: EventSection): number {
  if (a.order !== b.order) return a.order - b.order
  return cacheRecordId(a).localeCompare(cacheRecordId(b))
}

export function sortEventSectionsByRenderOrder(sections: EventSection[]): EventSection[] {
  return [...sections].sort(compareEventSectionsByRenderOrder)
}
