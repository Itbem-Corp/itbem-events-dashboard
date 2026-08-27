import type { ExecutionGraphEvent, ExecutionGraphGroup, ExecutionGraphGroupingOptions, ExecutionGraphStatus } from './types'

export type ExecutionGraphLayoutItem = {
  id: string
  occurredAt: string
  trackId: string
}

export type ExecutionGraphLayoutNode = {
  event: ExecutionGraphEvent
  x: number
  y: number
}

export type ExecutionGraphItemLayoutNode<T extends ExecutionGraphLayoutItem> = {
  item: T
  x: number
  y: number
}

/**
 * `tracks` preserves the original one-lane-per-track representation. `compact`
 * keeps the chronological reading direction in a wrapped horizontal path. It
 * is useful for a live product surface where a task can emit many entity types
 * but the operator still needs to read the movement at a glance.
 */
export type ExecutionGraphLayoutOptions = {
  mode?: 'tracks' | 'compact'
  /** Maximum concurrent rows in compact mode. The layout chooses a sensible default. */
  laneLimit?: number
}

const nodeStartX = 34
const nodeStartY = 28
const nodeGapX = 188
const nodeGapY = 104

const compactNodeStartX = 22
const compactNodeStartY = 18
const compactNodeGapX = 146
const compactNodeGapY = 84

export function executionGraphTimestamp(occurredAt: string) {
  const timestamp = Date.parse(occurredAt)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function sortExecutionGraphEvents(events: readonly ExecutionGraphEvent[]) {
  return events
    .slice()
    .sort((left, right) => executionGraphTimestamp(left.occurredAt) - executionGraphTimestamp(right.occurredAt) || left.id.localeCompare(right.id))
}

/**
 * Generic lane layout used by the flow renderer and available to custom views.
 * A lane progresses horizontally; a new track starts a lower lane.
 */
function compactColumnLimit(itemCount: number, configuredLimit?: number) {
  if (configuredLimit !== undefined) return Math.max(1, Math.floor(configuredLimit))
  // A live card is often narrower than the graph's own nodes. Keep short runs
  // to three columns so fitView does not shrink an actionable node below its
  // touch target. Histories can still grow horizontally after the compact grid
  // reaches three rows, where pan/zoom is more useful than an ever taller card.
  if (itemCount <= 9) return 3
  return Math.ceil(itemCount / 3)
}

function buildCompactExecutionGraphItemLayout<T extends ExecutionGraphLayoutItem>(items: readonly T[], laneLimit?: number): ExecutionGraphItemLayoutNode<T>[] {
  const ordered = [...items].sort((left, right) => executionGraphTimestamp(left.occurredAt) - executionGraphTimestamp(right.occurredAt) || left.id.localeCompare(right.id))
  // A consumer may tighten short runs for a narrow embedding. Longer histories
  // retain the three-row cap so a mobile card does not grow into a tall list.
  const columns = ordered.length <= 9 && laneLimit !== undefined
    ? compactColumnLimit(ordered.length, laneLimit)
    : compactColumnLimit(ordered.length)

  return ordered.map((item, index) => {
    const row = Math.floor(index / columns)
    const columnOffset = index % columns
    // Alternate the reading direction by row. This keeps the next chronological
    // movement visually adjacent at a row boundary instead of drawing a long
    // diagonal line back to the left edge.
    const column = row % 2 === 0 ? columnOffset : columns - 1 - columnOffset
    return {
      item,
      x: compactNodeStartX + column * compactNodeGapX,
      y: compactNodeStartY + row * compactNodeGapY,
    }
  })
}

export function buildExecutionGraphItemLayout<T extends ExecutionGraphLayoutItem>(
  items: readonly T[],
  options: ExecutionGraphLayoutOptions = {},
): ExecutionGraphItemLayoutNode<T>[] {
  if (options.mode === 'compact') return buildCompactExecutionGraphItemLayout(items, options.laneLimit)
  const ordered = [...items].sort((left, right) => executionGraphTimestamp(left.occurredAt) - executionGraphTimestamp(right.occurredAt) || left.id.localeCompare(right.id))
  const laneIndexes = new Map<string, number>()
  const laneVisits = new Map<string, number>()

  return ordered.map((item) => {
    const lane = laneIndexes.get(item.trackId) ?? laneIndexes.size
    laneIndexes.set(item.trackId, lane)
    const visit = laneVisits.get(item.trackId) ?? 0
    laneVisits.set(item.trackId, visit + 1)
    return { item, x: nodeStartX + visit * nodeGapX, y: nodeStartY + lane * nodeGapY }
  })
}

export function buildExecutionGraphLayout(events: ExecutionGraphEvent[]): ExecutionGraphLayoutNode[] {
  return buildExecutionGraphItemLayout(events).map(({ item, x, y }) => ({ event: item, x, y }))
}

function sourceGroupingId(event: ExecutionGraphEvent, options: ExecutionGraphGroupingOptions) {
  const fromConsumer = options.getGroupId?.(event)
  if (fromConsumer) return fromConsumer
  if (event.groupId) return event.groupId
  // A task, gate or evidence item is an important state transition: hiding it
  // makes a delivery look inert. Smart grouping is intentionally conservative
  // and only coalesces technical bursts when the producer did not name a group.
  if (options.mode === 'smart' && (event.kind === 'tool_call' || event.kind === 'execution')) return `${event.trackId}:${event.kind}`
  return event.id
}

function asGroup({
  id,
  sourceId,
  events,
  options,
}: {
  id: string
  sourceId: string
  events: ExecutionGraphEvent[]
  options: ExecutionGraphGroupingOptions
}): ExecutionGraphGroup {
  const latest = events.at(-1)!
  // A group is a compact view of repeated technical work. Its color must
  // describe the latest attempt, not keep a previously resolved failure as
  // the visual state of the whole phase. Earlier attempts stay inspectable.
  const status = latest.status
  return {
    id,
    sourceId,
    label: options.getGroupLabel?.(events) ?? latest.groupLabel ?? latest.trackLabel,
    trackId: latest.trackId,
    trackLabel: latest.trackLabel,
    events,
    firstOccurredAt: events[0].occurredAt,
    lastOccurredAt: latest.occurredAt,
    status,
    attempts: events.reduce((total, event) => total + Math.max(1, event.attempts ?? 1), 0),
  }
}

/**
 * Groups only adjacent events. This keeps separate phases of the same track
 * visible while allowing fast retries and tool bursts to collapse into one node.
 */
export function buildExecutionGraphGroups(events: readonly ExecutionGraphEvent[], input: ExecutionGraphGroupingOptions = {}): ExecutionGraphGroup[] {
  const options: ExecutionGraphGroupingOptions = { enabled: true, mode: 'smart', ...input }
  const ordered = sortExecutionGraphEvents(events)
  if (!options.enabled || options.mode === 'none') {
    return ordered.map((event, index) => asGroup({ id: `event:${event.id}:${index}`, sourceId: event.id, events: [event], options }))
  }

  const groups: ExecutionGraphGroup[] = []
  let serial = 0
  for (const event of ordered) {
    const sourceId = sourceGroupingId(event, options)
    const previous = groups.at(-1)
    const sameSource = previous?.sourceId === sourceId
    const candidate = sameSource ? asGroup({ id: previous.id, sourceId, events: [...previous.events, event], options }) : undefined
    const canJoin = Boolean(previous && candidate && (options.shouldGroup?.(previous, event) ?? true))

    if (canJoin && candidate) {
      groups[groups.length - 1] = candidate
      continue
    }

    groups.push(asGroup({ id: `group:${sourceId}:${serial++}`, sourceId, events: [event], options }))
  }
  return groups
}

export function executionGraphStatusWeight(status: ExecutionGraphStatus) {
  const weights: Record<ExecutionGraphStatus, number> = {
    active: 5,
    retrying: 5,
    attention: 4,
    blocked: 4,
    human: 4,
    cancelling: 2,
    degraded: 3,
    waiting: 2,
    queued: 1,
    complete: 0,
    cancelled: 0,
  }
  return weights[status]
}
