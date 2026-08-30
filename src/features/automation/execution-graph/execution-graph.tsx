'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ClipboardDocumentCheckIcon,
  EllipsisHorizontalIcon,
  ExclamationCircleIcon,
  NoSymbolIcon,
} from '@heroicons/react/20/solid'
import {
  Background,
  Handle,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { buildExecutionGraphGroups, buildExecutionGraphItemLayout, executionGraphTimestamp, sortExecutionGraphEvents } from './layout'
import type {
  ExecutionGraphAction,
  ExecutionGraphActionContext,
  ExecutionGraphDensity,
  ExecutionGraphEvent,
  ExecutionGraphGroup,
  ExecutionGraphGroupInspector,
  ExecutionGraphGroupingOptions,
  ExecutionGraphInspector,
  ExecutionGraphInspectorContext,
  ExecutionGraphReplayOptions,
  ExecutionGraphStatus,
  ExecutionGraphStatusIndicator,
  ExecutionGraphView,
  ExecutionGraphViewContext,
  ExecutionGraphViewId,
} from './types'

type DisplayGraphItem = {
  id: string
  event: ExecutionGraphEvent
  group: ExecutionGraphGroup
  sourceEventIds: readonly string[]
  isCollapsedGroup: boolean
}

type ExecutionNodeData = {
  item: DisplayGraphItem
  density: ExecutionGraphDensity
  isLatest: boolean
  onOpen: () => void
  onContextMenu: (event: MouseEvent) => void
  onOpenMenu: (trigger: HTMLElement) => void
}

type ExecutionNode = Node<ExecutionNodeData, 'execution'>
type GraphMenu = { item: DisplayGraphItem; x: number; y: number; trigger: HTMLElement | null } | null

const DEFAULT_MAX_EVENTS = 60

const statusClass: Record<ExecutionGraphStatus, string> = {
  active: 'border-(--tenant-accent)/45 bg-(--tenant-accent)/10 text-(--tenant-accent) ring-4 ring-(--tenant-accent)/10',
  retrying: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-4 ring-orange-500/10',
  queued: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  complete: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  human: 'border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  cancelling: 'border-zinc-400/35 bg-zinc-400/10 text-zinc-700 dark:text-zinc-300',
  attention: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  blocked: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  waiting: 'border-slate-400/35 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  degraded: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  cancelled: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-600 dark:text-zinc-400',
}

const statusLabel: Record<ExecutionGraphStatus, string> = {
  active: 'En ejecución',
  retrying: 'Reintentando',
  queued: 'En cola',
  complete: 'Completado',
  human: 'Decisión requerida',
  cancelling: 'Deteniéndose',
  attention: 'Requiere atención',
  blocked: 'Bloqueado',
  waiting: 'En espera',
  degraded: 'Con señal limitada',
  cancelled: 'Cancelado',
}

const streamLabel: Record<NonNullable<ExecutionGraphStatusIndicator>['state'], string> = {
  idle: 'En pausa',
  connecting: 'Conectando',
  live: 'En vivo',
  reconnecting: 'Reconectando',
  offline: 'Sin conexión',
  error: 'Actualización pendiente',
}

const streamClass: Record<NonNullable<ExecutionGraphStatusIndicator>['state'], string> = {
  idle: 'bg-zinc-400',
  connecting: 'bg-sky-500',
  live: 'bg-emerald-500 delivery-signal',
  reconnecting: 'bg-amber-500 delivery-signal',
  offline: 'bg-zinc-400',
  error: 'bg-rose-500',
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onStoreChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
  const mediaQuery = window.matchMedia(reducedMotionQuery)
  mediaQuery.addEventListener('change', onStoreChange)
  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getReducedMotionSnapshot() {
  return typeof window !== 'undefined' && window.matchMedia?.(reducedMotionQuery).matches === true
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeToReducedMotion, getReducedMotionSnapshot, () => false)
}

function isMoving(status: ExecutionGraphStatus) {
  return status === 'active' || status === 'retrying'
}

function graphEventDateLabel(occurredAt: string) {
  const value = new Date(occurredAt)
  return Number.isNaN(value.getTime()) ? 'Sin marca de tiempo' : value.toLocaleString('es-MX')
}

function EventStatusIcon({ status }: { status: ExecutionGraphStatus }) {
  if (isMoving(status)) return <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
  if (status === 'complete') return <CheckCircleIcon className="size-3.5" />
  if (status === 'queued' || status === 'waiting') return <ClockIcon className="size-3.5" />
  if (status === 'human') return <ClipboardDocumentCheckIcon className="size-3.5" />
  if (status === 'cancelling' || status === 'cancelled') return <NoSymbolIcon className="size-3.5" />
  return <ExclamationCircleIcon className="size-3.5" />
}

function ExecutionGraphNode({ data }: NodeProps<ExecutionNode>) {
  const { event } = data.item
  const active = isMoving(event.status)
  const compact = data.density === 'compact'
  const movementLabel = data.item.isCollapsedGroup && data.item.group.events.length > 1
    ? `${data.item.group.events.length} movimientos`
    : statusLabel[event.status]
  const openOnKeyboard = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
      data.onOpen()
      return
    }
    if (keyboardEvent.key === 'ContextMenu' || (keyboardEvent.shiftKey && keyboardEvent.key === 'F10')) {
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
      data.onOpenMenu(keyboardEvent.currentTarget)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-keyshortcuts="Enter Space Shift+F10 ContextMenu"
      aria-label={`${event.summary}. ${movementLabel}. Activa para inspeccionar.`}
      onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
      onClick={(mouseEvent) => {
        mouseEvent.stopPropagation()
        // A role=button div is not guaranteed to take focus on pointer input.
        // Keep the actual node as the return point when the inspector closes,
        // so opening a live step never strands keyboard users at the top of
        // the graph after a mouse or touch inspection.
        mouseEvent.currentTarget.focus()
        data.onOpen()
      }}
      onKeyDown={openOnKeyboard}
      onContextMenu={(mouseEvent) => {
        mouseEvent.stopPropagation()
        data.onContextMenu(mouseEvent)
      }}
      className={`live-map-node cursor-pointer border shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:translate-y-0 motion-reduce:transition-none motion-reduce:[animation:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) ${compact ? 'w-32 rounded-xl px-2.5 py-2' : 'w-40 rounded-2xl px-3 py-2.5'} ${data.isLatest ? 'delivery-arrival' : ''} ${active ? 'delivery-orbit' : ''} ${statusClass[event.status]}`}
      title="Abrir detalle. Clic derecho o Shift+F10 para acciones."
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-current" />
      <div className="flex items-center justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-1.5 font-bold tracking-[0.08em] uppercase ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          <EventStatusIcon status={event.status} />
          <span className="truncate">{event.trackLabel}</span>
        </span>
        {data.item.isCollapsedGroup && data.item.group.events.length > 1 ? (
          <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[9px] font-bold">{data.item.group.events.length}</span>
        ) : null}
      </div>
      <p className={`truncate font-bold text-ink ${compact ? 'mt-1 text-[11px]' : 'mt-1.5 text-xs'}`}>{event.summary}</p>
      <p className={`truncate font-medium opacity-75 ${compact ? 'mt-0.5 text-[9px]' : 'mt-1 text-[10px]'}`}>{event.attempts && event.attempts > 1 ? `${event.attempts} intentos · ver detalle` : movementLabel}</p>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-current" />
    </div>
  )
}

const nodeTypes = { execution: ExecutionGraphNode }

function displayItemsForGroups(groups: readonly ExecutionGraphGroup[], expandedGroupIds: ReadonlySet<string>) {
  const items: DisplayGraphItem[] = []
  for (const group of groups) {
    const expanded = group.events.length > 1 && expandedGroupIds.has(group.id)
    if (expanded) {
      for (const event of group.events) {
        items.push({
          id: `event:${event.id}`,
          event,
          group,
          sourceEventIds: [event.id],
          isCollapsedGroup: false,
        })
      }
      continue
    }

    const latest = group.events.at(-1)!
    const event = group.events.length === 1
      ? latest
      : {
          ...latest,
          id: group.id,
          trackLabel: group.label,
          title: `${group.label} · ${group.events.length} pasos`,
          summary: group.label,
          detail: `${group.events.length} registros agrupados`,
          status: group.status,
          attempts: group.attempts,
        }
    items.push({
      id: group.id,
      event,
      group,
      sourceEventIds: group.events.map((source) => source.id),
      isCollapsedGroup: group.events.length > 1,
    })
  }
  return items
}

function graphFor(
  items: readonly DisplayGraphItem[],
  onOpen: (item: DisplayGraphItem) => void,
  onContextMenu: (mouseEvent: MouseEvent, item: DisplayGraphItem) => void,
  onOpenMenu: (trigger: HTMLElement, item: DisplayGraphItem) => void,
  prefersReducedMotion: boolean,
  density: ExecutionGraphDensity,
  compactColumns?: number,
) {
  const layout = buildExecutionGraphItemLayout(
    items.map((item) => ({ id: item.id, occurredAt: item.event.occurredAt, trackId: item.event.trackId })),
    { mode: density === 'compact' ? 'compact' : 'tracks', laneLimit: compactColumns },
  )
  const itemByID = new Map(items.map((item) => [item.id, item]))
  const displayIDBySourceID = new Map<string, string>()
  for (const item of items) {
    for (const sourceID of item.sourceEventIds) displayIDBySourceID.set(sourceID, item.id)
  }

  const latestItemID = items.at(-1)?.id
  const nodes: ExecutionNode[] = layout.map(({ item: positionedItem, x, y }) => {
    const item = itemByID.get(positionedItem.id)!
    return {
      id: item.id,
      type: 'execution',
      className: 'live-execution-flow__node',
      position: { x, y },
      data: {
        item,
        density,
        isLatest: item.id === latestItemID,
        onOpen: () => onOpen(item),
        onContextMenu: (mouseEvent) => onContextMenu(mouseEvent, item),
        onOpenMenu: (trigger) => onOpenMenu(trigger, item),
      },
    }
  })

  const relationships = new Map<string, { source: string; target: string; kind: string }>()
  const addRelationship = (source: string | undefined, target: string, kind: string) => {
    if (!source || source === target) return
    const id = `${source}:${target}`
    const existing = relationships.get(id)
    // A backend graph can state the same causal relation through both a
    // parent pointer and an explicit dependency edge. Render one line, and
    // retain the richer relation rather than visually doubling the path.
    if (!existing || (existing.kind === 'parent' && kind === 'dependency')) {
      relationships.set(id, { source, target, kind })
    }
  }

  for (const item of items) {
    for (const sourceEvent of item.group.events) {
      for (const dependency of sourceEvent.dependsOn ?? []) addRelationship(displayIDBySourceID.get(dependency), item.id, 'dependency')
      addRelationship(displayIDBySourceID.get(sourceEvent.parentId ?? ''), item.id, 'parent')
      for (const relation of sourceEvent.relations ?? []) addRelationship(displayIDBySourceID.get(relation.eventId), item.id, relation.kind ?? 'related')
    }
  }

  // A producer can omit explicit edges. Keep a subtle chronological line only
  // within a lane that actually has repeated movement; a single event per lane
  // must remain an independent observation, not a fabricated causal chain.
  const latestByTrack = new Map<string, string>()
  const trackEventCounts = new Map<string, number>()
  for (const item of items) trackEventCounts.set(item.event.trackId, (trackEventCounts.get(item.event.trackId) ?? 0) + 1)
  for (const { item: positionedItem } of layout) {
    const item = itemByID.get(positionedItem.id)!
    const previous = latestByTrack.get(item.event.trackId)
    if (previous && (trackEventCounts.get(item.event.trackId) ?? 0) > 1) addRelationship(previous, item.id, 'sequence')
    latestByTrack.set(item.event.trackId, item.id)
  }

  const edges: Edge[] = [...relationships.values()].map(({ source, target, kind }) => {
    const targetItem = itemByID.get(target)
    const active = targetItem ? isMoving(targetItem.event.status) : false
    return {
      id: `${source}:${target}`,
      source,
      target,
      type: 'smoothstep',
      animated: active && !prefersReducedMotion,
      className: active ? 'live-execution-flow__edge--active' : undefined,
      style: {
        stroke: active ? 'var(--tenant-accent)' : 'var(--app-border-subtle)',
        strokeWidth: active ? 2 : kind === 'dependency' ? 1.8 : 1.4,
        strokeDasharray: kind === 'related' ? '4 4' : undefined,
      },
    }
  })
  return { nodes, edges }
}

function GraphAutoFollow({
  eventKey,
  latestNodeId,
  following,
  onFollowingChange,
  prefersReducedMotion,
  compact,
  flowFrameRef,
}: {
  eventKey: string
  latestNodeId?: string
  following: boolean
  onFollowingChange: (following: boolean) => void
  prefersReducedMotion: boolean
  compact: boolean
  flowFrameRef: RefObject<HTMLDivElement | null>
}) {
  const { fitView, getNode, getViewport, setCenter } = useReactFlow()
  const previousEventKey = useRef<string | undefined>(undefined)
  const center = useCallback((duration = 420) => {
    return fitView({ duration: prefersReducedMotion ? 0 : duration, padding: compact ? 0.12 : 0.2, maxZoom: compact ? 1.24 : 1.15 })
  }, [compact, fitView, prefersReducedMotion])

  useEffect(() => {
    const hasPreviousValue = previousEventKey.current !== undefined
    const graphChanged = previousEventKey.current !== eventKey
    previousEventKey.current = eventKey
    if (hasPreviousValue && (!following || !graphChanged)) return
    const timeout = window.setTimeout(() => {
      if (!hasPreviousValue) {
        void center(0)
        return
      }
      // A fresh event should feel like a new pulse in the current map, not a
      // reset of the operator's viewport. Preserve zoom and center only the
      // new node when it has been measured; the explicit “Centrar” control
      // remains available when a full view is wanted.
      const node = latestNodeId ? getNode(latestNodeId) : undefined
      const position = node?.position
      if (position) {
        const width = node?.measured?.width ?? 0
        const height = node?.measured?.height ?? 0
        const viewport = getViewport()
        const frame = flowFrameRef.current
        const frameWidth = frame?.clientWidth ?? 0
        const frameHeight = frame?.clientHeight ?? 0
        const left = position.x * viewport.zoom + viewport.x
        const top = position.y * viewport.zoom + viewport.y
        const right = left + width * viewport.zoom
        const bottom = top + height * viewport.zoom
        // Live updates are frequent. Keep the user's spatial context when the
        // fresh node is already visible; only pan when it would otherwise land
        // outside the canvas.
        const visible = left >= 8 && top >= 8 && right <= frameWidth - 8 && bottom <= frameHeight - 8
        if (!visible) {
          void setCenter(position.x + width / 2, position.y + height / 2, { duration: prefersReducedMotion ? 0 : 420 })
        }
      }
    }, prefersReducedMotion ? 0 : 80)
    return () => window.clearTimeout(timeout)
  }, [center, eventKey, flowFrameRef, following, getNode, getViewport, latestNodeId, prefersReducedMotion, setCenter])

  return (
    <Panel position="bottom-right" className={compact ? '!m-2 sm:!m-3' : '!m-3'}>
      <div className="inline-flex overflow-hidden rounded-xl border border-border-subtle bg-surface-raised/90 shadow-sm backdrop-blur">
        <button
          type="button"
          aria-pressed={following}
          aria-label={following ? 'Seguimiento automático activo. Activar para pausar' : 'Seguimiento automático pausado. Activar para reanudar'}
          onClick={() => {
            const nextFollowing = !following
            onFollowingChange(nextFollowing)
            if (nextFollowing) void center()
          }}
          className={`min-h-[44px] border-r border-border-subtle px-2.5 text-[10px] font-bold tracking-wide transition sm:min-h-0 sm:px-3 ${following ? 'bg-(--tenant-accent)/10 text-(--tenant-accent)' : 'text-ink-secondary hover:text-(--tenant-accent)'}`}
          title={following ? 'Pausar seguimiento automático' : 'Reanudar seguimiento automático'}
        >
          <span className="sm:hidden">{following ? 'LIVE' : 'SEGUIR'}</span><span className="hidden sm:inline">{following ? 'SIGUIENDO' : 'SEGUIR'}</span>
        </button>
        <button type="button" aria-label="Centrar el flujo" onClick={() => void center()} className="min-h-[44px] px-2.5 text-[10px] font-bold tracking-wide text-ink-secondary transition hover:text-(--tenant-accent) sm:min-h-0 sm:px-3" title="Centrar el flujo"><span className="sm:hidden">CENTRO</span><span className="hidden sm:inline">CENTRAR</span></button>
      </div>
    </Panel>
  )
}

/**
 * React Flow's declarative `fitView` can run before custom nodes have their
 * measured dimensions, especially when an expanded result animates into view.
 * Fit once after measurement even for a static graph; live following remains a
 * separate opt-in behavior so a manual pan is never overwritten.
 */
function GraphInitialFit({
  eventKey,
  compact,
  padding,
  prefersReducedMotion,
}: {
  eventKey: string
  compact: boolean
  padding?: number
  prefersReducedMotion: boolean
}) {
  const { fitView } = useReactFlow()
  const fittedEventKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (fittedEventKey.current === eventKey) return
    fittedEventKey.current = eventKey
    // Let React Flow finish its own initial viewport update first. Otherwise a
    // declarative `fitView` can overwrite this measured fit on the next frame.
    const timeout = window.setTimeout(() => {
      void fitView({ duration: prefersReducedMotion ? 0 : 180, padding: padding ?? (compact ? 0.14 : 0.2), maxZoom: compact ? 1.24 : 1.15 })
    }, prefersReducedMotion ? 0 : 100)
    return () => window.clearTimeout(timeout)
  }, [compact, eventKey, fitView, padding, prefersReducedMotion])

  return null
}

function TimelineView({ items, onOpen }: { items: readonly DisplayGraphItem[]; onOpen: (item: DisplayGraphItem) => void }) {
  return (
    <div className="h-full overflow-x-auto overscroll-x-contain px-4 py-4 scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto sm:px-5">
      <ol className="flex min-w-max snap-x snap-mandatory items-stretch gap-3 pr-3">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-3">
            {index > 0 ? <span aria-hidden className="h-px w-6 bg-border-subtle" /> : null}
            <button type="button" onClick={() => onOpen(item)} className={`min-h-16 w-40 snap-start rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:translate-y-0 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) ${statusClass[item.event.status]}`}>
              <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] uppercase"><EventStatusIcon status={item.event.status} /> {item.event.trackLabel}</span>
              <span className="mt-2 block truncate text-xs font-bold text-ink">{item.event.summary}</span>
              <span className="mt-1 block text-[10px] font-medium opacity-75">{item.isCollapsedGroup ? `${item.group.events.length} movimientos` : statusLabel[item.event.status]}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ReplayControls({
  events,
  position,
  playing,
  prefersReducedMotion,
  onPositionChange,
  onTogglePlaying,
}: {
  events: readonly ExecutionGraphEvent[]
  position: number
  playing: boolean
  prefersReducedMotion: boolean
  onPositionChange: (position: number) => void
  onTogglePlaying: () => void
}) {
  if (events.length < 2) return null
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-2.5 sm:px-6">
      <button type="button" disabled={prefersReducedMotion} onClick={onTogglePlaying} className="rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-1 text-[10px] font-bold text-ink-secondary transition hover:border-(--tenant-accent)/35 hover:text-(--tenant-accent) disabled:cursor-not-allowed disabled:opacity-50" aria-label={playing ? 'Pausar reproducción' : 'Reproducir actividad'} title={prefersReducedMotion ? 'La reproducción se desactiva cuando reduces el movimiento del sistema' : undefined}>{playing ? 'PAUSAR' : 'REPRODUCIR'}</button>
      <input
        aria-label="Posición de reproducción"
        type="range"
        min={0}
        max={events.length - 1}
        value={position}
        onChange={(event) => onPositionChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-(--tenant-accent)"
      />
      <span className="whitespace-nowrap text-[10px] font-semibold text-ink-muted">{position + 1}/{events.length}</span>
    </div>
  )
}

function GroupInspector({
  group,
  onSelectEvent,
  onToggleGroup,
}: {
  group: ExecutionGraphGroup
  onSelectEvent: (id: string) => void
  onToggleGroup: () => void
}) {
  const recoveredAttempts = group.events.filter((event) => event.status === 'attention' || event.status === 'degraded' || event.status === 'retrying').length
  const hasRecovery = group.status === 'complete' && recoveredAttempts > 0
  const movementCount = group.events.length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Movimientos" value={String(movementCount)} />
        <Metric label="Intentos" value={String(group.attempts)} />
        <Metric label="Estado" value={statusLabel[group.status]} />
      </div>
      {group.attempts > group.events.length ? <p className="rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-xs leading-5 text-ink-secondary">Este carril agrupó reintentos técnicos. El estado refleja el último intento; el historial completo queda abajo.</p> : null}
      {hasRecovery ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs leading-5 text-emerald-800 dark:text-emerald-300">El agente se recuperó y el carril finalizó correctamente. Los intentos anteriores quedan disponibles como trazabilidad.</p> : null}
      <button type="button" onClick={onToggleGroup} className="min-h-11 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm font-semibold text-ink transition hover:border-(--tenant-accent)/35 hover:text-(--tenant-accent) motion-reduce:transition-none sm:min-h-0">{movementCount > 1 ? 'Ver movimientos' : 'Ver en el flujo'}</button>
      <ol className="overflow-hidden rounded-2xl border border-border-subtle divide-y divide-border-subtle">
        {group.events.map((event) => (
          <li key={event.id}>
            <button type="button" onClick={() => onSelectEvent(event.id)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-surface-soft motion-reduce:transition-none sm:min-h-0">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{event.summary}</span><span className="mt-0.5 block truncate text-xs text-ink-muted">{event.detail}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusClass[event.status]}`}>{statusLabel[event.status]}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-soft p-3"><p className="text-[10px] font-bold tracking-[0.08em] text-ink-muted uppercase">{label}</p><p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p></div>
}

function DefaultInspector({ event }: { event: ExecutionGraphEvent }) {
  const attempts = event.attempts ?? 1
  const hasOperationalDetail = event.detail && event.detail !== event.summary
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle bg-surface-soft px-4 py-3">
        <p className="text-[10px] font-bold tracking-[0.12em] text-ink-muted uppercase">Estado del agente</p>
        <p className="mt-1 text-sm font-semibold text-ink">{statusLabel[event.status]}</p>
        {hasOperationalDetail ? <p className="mt-1 text-sm leading-5 text-ink-secondary">{event.detail}</p> : null}
      </div>
      {event.progress !== undefined ? <div><div className="mb-1 flex justify-between text-xs font-medium text-ink-secondary"><span>Avance</span><span>{Math.round(event.progress)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface-soft"><div className="h-full rounded-full bg-(--tenant-accent) transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.min(100, Math.max(0, event.progress))}%` }} /></div></div> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>{event.trackLabel}</span>
        {attempts > 1 ? <span>{attempts} intentos</span> : null}
        <time dateTime={event.occurredAt || undefined}>{graphEventDateLabel(event.occurredAt)}</time>
      </div>
    </div>
  )
}

function builtinViews(): ExecutionGraphView[] {
  return [
    { id: 'flow', label: 'Flujo', shortLabel: 'Flujo', description: 'Conexiones y dependencias' },
    { id: 'timeline', label: 'Línea de tiempo', shortLabel: 'Tiempo', description: 'Actividad en secuencia' },
  ]
}

function mergeViews(views: readonly ExecutionGraphView[] | undefined) {
  // Supplying views is an explicit surface-level decision. A compact live
  // card that asks for only the flow should not quietly receive a second
  // timeline tab and turn its header back into a control bar.
  if (views) return [...views]
  const resolved = new Map<ExecutionGraphViewId, ExecutionGraphView>()
  for (const view of builtinViews()) resolved.set(view.id, view)
  return [...resolved.values()]
}

function clampPosition(position: number, length: number) {
  return Math.min(Math.max(0, position), Math.max(0, length - 1))
}

export function ExecutionGraph({
  events,
  eyebrow = 'Mapa en vivo',
  title = 'Ejecución conectada',
  emptyLabel = 'El mapa se activará con la siguiente acción.',
  actions = [],
  renderInspector,
  renderGroupInspector,
  maxEvents = DEFAULT_MAX_EVENTS,
  autoFollow = true,
  views,
  defaultView = 'flow',
  view,
  onViewChange,
  grouping,
  replay,
  statusIndicator,
  statusSummary,
  density = 'compact',
  onOpenHistory,
}: {
  events: ExecutionGraphEvent[]
  eyebrow?: string
  title?: string
  emptyLabel?: string
  actions?: ExecutionGraphAction[]
  renderInspector?: ExecutionGraphInspector
  renderGroupInspector?: ExecutionGraphGroupInspector
  maxEvents?: number
  autoFollow?: boolean
  views?: ExecutionGraphView[]
  defaultView?: ExecutionGraphViewId
  view?: ExecutionGraphViewId
  onViewChange?: (view: ExecutionGraphViewId) => void
  grouping?: ExecutionGraphGroupingOptions
  replay?: ExecutionGraphReplayOptions
  statusIndicator?: ExecutionGraphStatusIndicator
  /** Compact domain summary shown beside the graph status without adding a panel. */
  statusSummary?: { compact: string; detail: string }
  density?: ExecutionGraphDensity
  /** Optional escape hatch to a domain-owned complete history when the graph is windowed. */
  onOpenHistory?: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [menu, setMenu] = useState<GraphMenu>(null)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set())
  const [uncontrolledView, setUncontrolledView] = useState<ExecutionGraphViewId>(defaultView)
  const [uncontrolledReplayPosition, setUncontrolledReplayPosition] = useState<number | undefined>()
  const [isPlaying, setIsPlaying] = useState(Boolean(replay?.autoPlay))
  const [isFollowingLive, setIsFollowingLive] = useState(autoFollow)
  const [hasNewWhileExploring, setHasNewWhileExploring] = useState(false)
  const previousLiveEventKey = useRef<string | undefined>(undefined)
  const inspectorTriggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const graphFrameRef = useRef<HTMLDivElement>(null)
  const [graphWidth, setGraphWidth] = useState(0)
  const graphId = useId()
  const prefersReducedMotion = usePrefersReducedMotion()
  const tabIdPrefix = `${graphId}-view-`
  const tabPanelId = `${graphId}-panel`

  const visibleEvents = useMemo(() => {
    const sorted = sortExecutionGraphEvents(events)
    return sorted.slice(-Math.max(1, maxEvents))
  }, [events, maxEvents])
  const defaultReplayPosition = replay?.initialPosition === 'start' ? 0 : Math.max(0, visibleEvents.length - 1)
  const replayPosition = replay ? clampPosition(replay.position ?? uncontrolledReplayPosition ?? defaultReplayPosition, visibleEvents.length) : Math.max(0, visibleEvents.length - 1)
  const replayEvents = replay ? visibleEvents.slice(0, replayPosition + 1) : visibleEvents
  const groups = useMemo(() => buildExecutionGraphGroups(replayEvents, grouping), [grouping, replayEvents])
  const items = useMemo(() => displayItemsForGroups(groups, expandedGroupIds), [expandedGroupIds, groups])
  const allViews = useMemo(() => mergeViews(views), [views])
  const activeView = allViews.some((candidate) => candidate.id === (view ?? uncontrolledView)) ? (view ?? uncontrolledView) : allViews[0]?.id ?? 'flow'
  const selectedView = allViews.find((candidate) => candidate.id === activeView)
  const movementCount = visibleEvents.reduce((total, event) => total + (event.attempts ?? 1), 0)
  // A compact graph may contain both a workflow root and collapsed phase
  // groups. “Hitos” remains truthful for that mixed representation, while
  // “fases” would imply every visible item is a delivery phase.
  const visibleItemLabel = items.some((item) => item.isCollapsedGroup)
    ? (items.length === 1 ? 'hito' : 'hitos')
    : (items.length === 1 ? 'paso' : 'pasos')
  const hiddenEventCount = Math.max(0, events.length - visibleEvents.length)
  const latestEvent = visibleEvents.at(-1)
  const connectionLabel = statusIndicator?.label ?? (statusIndicator ? streamLabel[statusIndicator.state] : undefined)
  const connectionIsAttention = statusIndicator?.tone === 'attention'
  const eventKey = items.map((item) => `${item.id}:${item.event.occurredAt}:${item.event.attempts ?? 1}:${item.event.status}`).join('|')
  const selected = visibleEvents.find((event) => event.id === selectedId)
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const inspectorActionEvent = selected ?? selectedGroup?.events.at(-1)
  const selectedActions = inspectorActionEvent ? actions.filter((action) => action.isVisible?.(inspectorActionEvent) ?? true) : []

  const closeInspector = useCallback(() => {
    const trigger = inspectorTriggerRef.current
    setSelectedId(null)
    setSelectedGroupId(null)
    inspectorTriggerRef.current = null
    if (trigger?.isConnected) window.requestAnimationFrame(() => trigger.focus())
  }, [])
  const selectEvent = useCallback((id: string) => {
    setSelectedGroupId(null)
    setSelectedId(id)
  }, [])
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const openItem = useCallback((item: DisplayGraphItem) => {
    const activeElement = document.activeElement
    inspectorTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null
    if (item.isCollapsedGroup) {
      setSelectedId(null)
      setSelectedGroupId(item.group.id)
      return
    }
    selectEvent(item.event.id)
  }, [selectEvent])
  const closeMenu = useCallback((restoreFocus = false) => {
    const trigger = menu?.trigger
    setMenu(null)
    if (restoreFocus && trigger?.isConnected) window.requestAnimationFrame(() => trigger.focus())
  }, [menu])
  const positionMenu = useCallback((item: DisplayGraphItem, x: number, y: number, trigger: HTMLElement | null) => {
    const menuWidth = 236
    const menuHeight = 220
    setMenu({
      item,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
      trigger,
    })
  }, [])
  const openMenu = useCallback((mouseEvent: MouseEvent, item: DisplayGraphItem) => {
    mouseEvent.preventDefault()
    positionMenu(item, mouseEvent.clientX, mouseEvent.clientY, mouseEvent.currentTarget as HTMLElement)
  }, [positionMenu])
  const openMenuFromKeyboard = useCallback((trigger: HTMLElement, item: DisplayGraphItem) => {
    const bounds = trigger.getBoundingClientRect()
    positionMenu(item, bounds.left, bounds.bottom + 8, trigger)
  }, [positionMenu])
  const compact = density === 'compact'
  // Below 360px a three-column canvas shrinks node content to the point where
  // the status and summary stop being scannable. Two columns preserve an
  // actual touch target and make the serpentine path read like progression.
  const compactColumns = density === 'compact' && items.length <= 9 && graphWidth > 0 && graphWidth < 360 ? 2 : undefined
  // Initial fitting is a viewport/layout concern, not an activity concern.
  // New events are handled by GraphAutoFollow, which preserves the user's
  // zoom. Including eventKey here would quietly reset that viewport on every
  // live update.
  const graphInitialFitKey = `${activeView}:${compactColumns ?? 'auto'}:${Math.round(graphWidth / 48)}`
  const graphLiveKey = `${eventKey}:${compactColumns ?? 'auto'}:${Math.round(graphWidth / 48)}`
  const graphFitPadding = compactColumns ? 0.34 : compact ? 0.14 : 0.2
  // A first task often starts as one collapsed phase. Give that state a
  // deliberate, compact canvas instead of reserving the vertical footprint
  // of a dense multi-branch execution; the canvas grows as the live graph
  // earns more movement.
  const graphHeightClass = items.length <= 1
    ? 'h-44 sm:h-48'
    : compactColumns
      ? 'h-80'
      : density === 'compact'
        ? 'h-60 sm:h-64'
        : 'h-64 sm:h-72'
  const { nodes, edges } = useMemo(() => graphFor(items, openItem, openMenu, openMenuFromKeyboard, prefersReducedMotion, density, compactColumns), [compactColumns, density, items, openItem, openMenu, openMenuFromKeyboard, prefersReducedMotion])
  const availableActions = menu ? actions.filter((action) => action.isVisible?.(menu.item.event) ?? true) : []
  const inspectorContext = useMemo<ExecutionGraphInspectorContext>(() => ({ selectEvent, close: closeInspector }), [closeInspector, selectEvent])
  const viewContext = useMemo<ExecutionGraphViewContext>(() => ({
    events: replayEvents,
    groups,
    expandedGroupIds,
    selectEvent,
    selectGroup: setSelectedGroupId,
    toggleGroup,
  }), [expandedGroupIds, groups, replayEvents, selectEvent, toggleGroup])

  const changeView = useCallback((nextView: ExecutionGraphViewId) => {
    if (view === undefined) setUncontrolledView(nextView)
    onViewChange?.(nextView)
  }, [onViewChange, view])
  const onViewTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = allViews.findIndex((candidate) => candidate.id === activeView)
    if (currentIndex < 0) return
    const lastIndex = allViews.length - 1
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = lastIndex
    else return

    event.preventDefault()
    const nextView = allViews[nextIndex]
    changeView(nextView.id)
    window.requestAnimationFrame(() => document.getElementById(`${tabIdPrefix}${nextView.id}`)?.focus())
  }, [activeView, allViews, changeView, tabIdPrefix])
  const changeReplayPosition = useCallback((nextPosition: number) => {
    if (!replay) return
    const position = clampPosition(nextPosition, visibleEvents.length)
    if (replay.position === undefined) setUncontrolledReplayPosition(position)
    replay.onPositionChange?.(position, visibleEvents[position])
  }, [replay, visibleEvents])

  useEffect(() => {
    if (prefersReducedMotion && isPlaying) {
      setIsPlaying(false)
    }
  }, [isPlaying, prefersReducedMotion])

  useEffect(() => {
    if (!replay || !isPlaying || visibleEvents.length < 2 || prefersReducedMotion) return
    const interval = window.setInterval(() => {
      if (replayPosition >= visibleEvents.length - 1) {
        if (replay.loop) changeReplayPosition(0)
        else setIsPlaying(false)
      } else {
        changeReplayPosition(replayPosition + 1)
      }
    }, Math.min(5_000, Math.max(350, replay.intervalMs ?? 900)))
    return () => window.clearInterval(interval)
  }, [changeReplayPosition, isPlaying, prefersReducedMotion, replay, replayPosition, visibleEvents.length])

  const runAction = useCallback((action: ExecutionGraphAction, item: DisplayGraphItem) => {
    const context: ExecutionGraphActionContext = { closeMenu, selectEvent }
    closeMenu()
    void action.onSelect(item.event, context)
  }, [closeMenu, selectEvent])

  const runSelectedAction = useCallback((action: ExecutionGraphAction) => {
    if (!inspectorActionEvent) return
    closeInspector()
    void action.onSelect(inspectorActionEvent, { closeMenu: closeInspector, selectEvent })
  }, [closeInspector, inspectorActionEvent, selectEvent])

  useEffect(() => {
    setIsFollowingLive(autoFollow)
  }, [autoFollow])

  useEffect(() => {
    // Windowed live data can retire an old event or regroup it after a new
    // movement arrives. Never leave an inspector open with no current target.
    if (selectedId && !visibleEvents.some((event) => event.id === selectedId)) {
      setSelectedId(null)
      inspectorTriggerRef.current = null
    }
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null)
      inspectorTriggerRef.current = null
    }
  }, [groups, selectedGroupId, selectedId, visibleEvents])

  useEffect(() => {
    const hasPreviousValue = previousLiveEventKey.current !== undefined
    const changed = previousLiveEventKey.current !== eventKey
    previousLiveEventKey.current = eventKey
    if (hasPreviousValue && changed && !isFollowingLive) setHasNewWhileExploring(true)
    if (isFollowingLive) setHasNewWhileExploring(false)
  }, [eventKey, isFollowingLive])

  const resumeFollowing = useCallback(() => {
    setIsFollowingLive(true)
    setHasNewWhileExploring(false)
  }, [])

  useEffect(() => {
    const frame = graphFrameRef.current
    if (!frame) return
    const updateWidth = () => setGraphWidth(Math.round(frame.getBoundingClientRect().width))
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [activeView])

  useEffect(() => {
    if (!menu) return
    const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null
      if (target && (menuRef.current?.contains(target) || menu.trigger?.contains(target))) return
      closeMenu()
    }
    const dismissOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu(true)
    }
    document.addEventListener('pointerdown', dismissOnOutsidePointer, true)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsidePointer, true)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [closeMenu, menu])

  const onMenuKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      return
    }
    if (event.key === 'Tab') {
      closeMenu()
      return
    }
    const menuItems = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (menuItems.length === 0) return
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex = currentIndex
    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 || currentIndex === menuItems.length - 1 ? 0 : currentIndex + 1
    else if (event.key === 'ArrowUp') nextIndex = currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = menuItems.length - 1
    else return
    event.preventDefault()
    menuItems[nextIndex]?.focus()
  }, [closeMenu])

  const graphMinZoom = compactColumns ? 0.64 : compact && items.length <= 12 ? 0.52 : 0.4
  const content: ReactNode = selectedView?.render
    ? selectedView.render(viewContext)
    : activeView === 'timeline'
      ? <TimelineView items={items} onOpen={openItem} />
      : (
          <div ref={graphFrameRef} className={graphHeightClass}>
            <ReactFlow className="live-execution-flow" nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: density === 'compact' ? 0.12 : 0.22, maxZoom: density === 'compact' ? 1.24 : 1.15 }} minZoom={graphMinZoom} maxZoom={1.4} nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnDrag onMoveStart={(event) => { if (event?.isTrusted) setIsFollowingLive(false) }} onPaneClick={() => closeMenu()} proOptions={{ hideAttribution: true }}>
              <Background gap={density === 'compact' ? 16 : 18} size={1} color="var(--app-border-subtle)" />
              <GraphInitialFit eventKey={graphInitialFitKey} compact={compact} padding={graphFitPadding} prefersReducedMotion={prefersReducedMotion} />
              {autoFollow ? <GraphAutoFollow eventKey={graphLiveKey} latestNodeId={items.at(-1)?.id} following={isFollowingLive} onFollowingChange={(following) => { setIsFollowingLive(following); if (following) setHasNewWhileExploring(false) }} prefersReducedMotion={prefersReducedMotion} compact={density === 'compact'} flowFrameRef={graphFrameRef} /> : null}
            </ReactFlow>
          </div>
        )

  return (
    <section aria-label={title} className={`premium-surface overflow-hidden rounded-3xl ${compact ? '' : 'mt-5'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle ${compact ? 'px-4 py-2.5 sm:px-5' : 'px-5 py-3.5 sm:px-6'}`}>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.16em] text-ink-muted uppercase"><span className="size-1.5 rounded-full bg-(--tenant-accent)" /> {eyebrow}</p>
          <h2 className={`${compact ? 'mt-px text-[13px]' : 'mt-0.5 text-sm'} font-semibold text-ink`}>{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {!compact && latestEvent ? <span title={`${statusLabel[latestEvent.status]} · ${latestEvent.summary}`} className="hidden max-w-44 items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-[10px] font-bold text-ink-secondary sm:inline-flex"><EventStatusIcon status={latestEvent.status} /><span className="truncate">{latestEvent.summary}</span></span> : null}
          {statusSummary ? <span title={statusSummary.detail} aria-label={`Rutas actuales: ${statusSummary.detail}`} className="max-w-28 truncate rounded-full bg-surface-soft px-2 py-1 text-[10px] font-bold text-ink-secondary sm:max-w-none">{statusSummary.compact}</span> : null}
          {statusIndicator ? <div className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-[10px] font-bold text-ink-secondary"><span aria-label={`${connectionIsAttention ? 'Estado de ejecución' : 'Conexión del flujo'}: ${connectionLabel}`} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-1.5 rounded-full motion-reduce:animate-none ${connectionIsAttention ? 'bg-rose-500' : streamClass[statusIndicator.state]}`} /> {connectionLabel}</span>{(statusIndicator.state === 'reconnecting' || statusIndicator.state === 'offline' || statusIndicator.state === 'error') && statusIndicator.onRefresh ? <button type="button" onClick={statusIndicator.onRefresh} className="-mr-1 min-h-11 rounded px-1 text-[10px] font-bold text-(--tenant-accent) hover:bg-(--tenant-accent)/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) sm:min-h-7" aria-label="Actualizar el flujo">Actualizar</button> : null}</div> : null}
          {hiddenEventCount > 0 && onOpenHistory ? <button type="button" onClick={onOpenHistory} title={`Ver los ${events.length} movimientos en el historial`} className={`min-h-11 rounded-full bg-surface-soft font-semibold text-ink-secondary transition hover:bg-surface-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) sm:min-h-7 ${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1 text-xs'}`}>{items.length} {visibleItemLabel} · +{hiddenEventCount}</button> : <span title={hiddenEventCount > 0 ? `Mostrando los últimos ${visibleEvents.length} de ${events.length} movimientos` : undefined} className={`rounded-full bg-surface-soft font-semibold text-ink-secondary ${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1 text-xs'}`}>{items.length} {visibleItemLabel}{hiddenEventCount > 0 ? ` · +${hiddenEventCount}` : ''}</span>}
        </div>
      </div>
      {allViews.length > 1 ? <div className="flex items-center gap-1 border-b border-border-subtle px-4 py-2 sm:px-5" role="tablist" aria-label="Vista del grafo" aria-orientation="horizontal">
        {allViews.map((candidate) => <button key={candidate.id} id={`${tabIdPrefix}${candidate.id}`} type="button" role="tab" aria-selected={candidate.id === activeView} aria-controls={tabPanelId} tabIndex={candidate.id === activeView ? 0 : -1} title={candidate.description} onClick={() => changeView(candidate.id)} onKeyDown={onViewTabKeyDown} className={`min-h-[44px] rounded-lg px-2.5 py-1.5 text-xs font-bold transition sm:min-h-0 ${candidate.id === activeView ? 'bg-surface-soft text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>{candidate.shortLabel ?? candidate.label}</button>)}
      </div> : null}
      {replay ? <ReplayControls events={visibleEvents} position={replayPosition} playing={isPlaying} prefersReducedMotion={prefersReducedMotion} onPositionChange={changeReplayPosition} onTogglePlaying={() => { if (!prefersReducedMotion) setIsPlaying((current) => !current) }} /> : null}
      {autoFollow && hasNewWhileExploring ? <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-soft/55 px-4 py-2.5 text-xs text-ink-secondary sm:px-5"><span className="min-w-0 truncate"><span className="font-semibold text-ink">Nuevo movimiento</span>{latestEvent ? ` · ${latestEvent.summary}` : ' mientras explorabas'}</span><button type="button" onClick={resumeFollowing} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-(--tenant-accent) transition hover:bg-(--tenant-accent)/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">Volver al paso vivo</button></div> : null}
      <div id={tabPanelId} role={allViews.length > 1 ? 'tabpanel' : undefined} aria-labelledby={allViews.length > 1 ? `${tabIdPrefix}${activeView}` : undefined} tabIndex={allViews.length > 1 ? 0 : undefined} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)">
        {items.length === 0 ? (
          <div className="flex h-48 items-center justify-center px-5">
            <div className="max-w-sm text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                <ClockIcon className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">Esperando el primer movimiento</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{emptyLabel}</p>
            </div>
          </div>
        ) : content}
      </div>
      <span className="sr-only" aria-live="polite">{items.length} {visibleItemLabel} {items.length === 1 ? 'visible' : 'visibles'} en el flujo de ejecución.{latestEvent ? ` Último movimiento: ${latestEvent.summary}, ${statusLabel[latestEvent.status]}.` : ''}{hiddenEventCount > 0 ? ` Se muestran los últimos ${visibleEvents.length} de ${events.length} movimientos.` : ''}</span>
      {menu ? (
        <div ref={menuRef} role="menu" aria-label={`Acciones para ${menu.item.event.summary}`} onKeyDown={onMenuKeyDown} className="fixed z-[60] w-56 rounded-xl border border-border-subtle bg-surface-raised p-1.5 shadow-xl" style={{ left: menu.x, top: menu.y }}>
          <button type="button" role="menuitem" onClick={() => { openItem(menu.item); closeMenu() }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-surface-soft motion-reduce:transition-none sm:min-h-0"><EllipsisHorizontalIcon className="size-4 text-ink-muted" /> Ver detalle</button>
          {menu.item.isCollapsedGroup ? <button type="button" role="menuitem" onClick={() => { toggleGroup(menu.item.group.id); closeMenu() }} className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-secondary hover:bg-surface-soft hover:text-ink motion-reduce:transition-none sm:min-h-0">Desplegar {menu.item.group.events.length} pasos</button> : null}
          {availableActions.map((action) => <button key={action.id} type="button" role="menuitem" title={action.description} disabled={action.isDisabled?.(menu.item.event)} onClick={() => runAction(action, menu.item)} className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-secondary hover:bg-surface-soft hover:text-ink motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-0">{action.label}</button>)}
        </div>
      ) : null}
      <Dialog open={Boolean(selected || selectedGroup)} onClose={closeInspector} size="md">
        <DialogTitle>{selectedGroup ? selectedGroup.label : selected?.title ?? 'Movimiento de ejecución'}</DialogTitle>
        <DialogBody className="space-y-5 py-2">
          {selectedGroup ? renderGroupInspector?.(selectedGroup, inspectorContext) ?? <GroupInspector group={selectedGroup} onSelectEvent={selectEvent} onToggleGroup={() => toggleGroup(selectedGroup.id)} /> : null}
          {selected ? renderInspector?.(selected, inspectorContext) ?? <DefaultInspector event={selected} /> : null}
          {selectedActions.length > 0 && (
            <section aria-label="Acciones disponibles" className="border-t border-border-subtle pt-4">
              <p className="text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase">Acciones disponibles</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {selectedActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={action.isDisabled?.(inspectorActionEvent!)}
                    onClick={() => runSelectedAction(action)}
                    className="min-h-11 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2.5 text-left transition hover:border-(--tenant-accent)/35 hover:bg-surface-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="block text-xs font-semibold text-ink">{action.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-ink-muted">{action.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={closeInspector}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </section>
  )
}
