import type { ReactNode } from 'react'

/**
 * States intentionally describe execution conditions rather than presentation.
 * Domains may map their native statuses to these values without coupling to a
 * particular graph view.
 */
export type ExecutionGraphStatus =
  | 'active'
  | 'queued'
  | 'complete'
  | 'attention'
  | 'human'
  | 'cancelling'
  | 'cancelled'
  | 'blocked'
  | 'retrying'
  | 'waiting'
  | 'degraded'

/** Connection state is deliberately separate from the state of the work itself. */
export type ExecutionGraphStreamStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'

export type ExecutionGraphStatusIndicator = {
  state: ExecutionGraphStreamStatus
  /** A product can replace the compact default copy without leaking transport details. */
  label?: string
  /** A work-state alert can override the transport dot without hiding connection state. */
  tone?: 'default' | 'attention'
  /** Optional recovery action, usually a safe snapshot refresh. */
  onRefresh?: () => void
}

export type ExecutionGraphRelationKind = 'depends-on' | 'produced' | 'caused-by' | 'retry' | 'related'

export type ExecutionGraphRelation = {
  /** The event this event points to. The graph renders the relationship as target -> current event. */
  eventId: string
  kind?: ExecutionGraphRelationKind
}

export type ExecutionGraphEvent = {
  id: string
  occurredAt: string
  trackId: string
  trackLabel: string
  title: string
  summary: string
  detail: string
  status: ExecutionGraphStatus
  /** Optional domain taxonomy: task, tool-call, evidence, gate, rollback, etc. */
  kind?: string
  /** Compresses repeated work while preserving the number of attempts. */
  attempts?: number
  /** A 0–100 progress value when the executor exposes one. */
  progress?: number
  /** Explicit group supplied by the domain. Consecutive events in the group collapse together by default. */
  groupId?: string
  groupLabel?: string
  /** A direct causal parent, if the executor exposes it. */
  parentId?: string
  /** Prerequisites for this event. These render as solid dependency edges. */
  dependsOn?: string[]
  /** Additional causal or semantic relationships. */
  relations?: ExecutionGraphRelation[]
  metadata?: Record<string, string | number | boolean | undefined>
}

export type ExecutionGraphGroup = {
  id: string
  sourceId: string
  label: string
  trackId: string
  trackLabel: string
  events: readonly ExecutionGraphEvent[]
  firstOccurredAt: string
  lastOccurredAt: string
  status: ExecutionGraphStatus
  attempts: number
}

export type ExecutionGraphGroupingOptions = {
  /** Defaults to true. Disabled grouping renders every event as an individual node. */
  enabled?: boolean
  /** `smart` groups consecutive work in a track; `explicit` only honours `groupId`; `none` disables grouping. */
  mode?: 'smart' | 'explicit' | 'none'
  /** Lets an integrator define a stable grouping key for its domain. */
  getGroupId?: (event: ExecutionGraphEvent) => string | undefined
  /** Lets an integrator replace the compact label shown for a collapsed group. */
  getGroupLabel?: (events: readonly ExecutionGraphEvent[]) => string | undefined
  /** Fine-grained guard for domains that should not collapse certain adjacent events. */
  shouldGroup?: (group: ExecutionGraphGroup, nextEvent: ExecutionGraphEvent) => boolean
}

export type ExecutionGraphActionContext = {
  closeMenu: () => void
  selectEvent: (eventId: string) => void
}

export type ExecutionGraphAction = {
  id: string
  label: string
  description?: string
  isVisible?: (event: ExecutionGraphEvent) => boolean
  isDisabled?: (event: ExecutionGraphEvent) => boolean
  onSelect: (event: ExecutionGraphEvent, context: ExecutionGraphActionContext) => void | Promise<void>
}

export type ExecutionGraphInspectorContext = {
  selectEvent: (eventId: string) => void
  close: () => void
}

export type ExecutionGraphInspector = (event: ExecutionGraphEvent, context: ExecutionGraphInspectorContext) => ReactNode

export type ExecutionGraphGroupInspector = (group: ExecutionGraphGroup, context: ExecutionGraphInspectorContext) => ReactNode

export type ExecutionGraphViewId = 'flow' | 'timeline' | (string & {})

/** Controls visual density only; it never changes the source events or edges. */
export type ExecutionGraphDensity = 'compact' | 'comfortable'

export type ExecutionGraphViewContext = {
  events: readonly ExecutionGraphEvent[]
  groups: readonly ExecutionGraphGroup[]
  expandedGroupIds: ReadonlySet<string>
  selectEvent: (eventId: string) => void
  selectGroup: (groupId: string) => void
  toggleGroup: (groupId: string) => void
}

export type ExecutionGraphView = {
  id: ExecutionGraphViewId
  label: string
  shortLabel?: string
  description?: string
  /** A custom renderer is optional; built-in ids `flow` and `timeline` work without one. */
  render?: (context: ExecutionGraphViewContext) => ReactNode
}

export type ExecutionGraphReplayOptions = {
  /** The initial cursor for uncontrolled replay. Defaults to the latest known event. */
  initialPosition?: 'start' | 'latest'
  /** Starts replay automatically unless the user requests reduced motion. */
  autoPlay?: boolean
  /** Interval between replay events. Defaults to 900ms and is clamped for usability. */
  intervalMs?: number
  /** Restart after the final movement. Defaults to false. */
  loop?: boolean
  /** Controlled cursor, zero-based within the currently visible event window. */
  position?: number
  onPositionChange?: (position: number, event: ExecutionGraphEvent | undefined) => void
}
