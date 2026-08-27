'use client'

import { ExecutionGraph, type ExecutionGraphAction, type ExecutionGraphEvent, type ExecutionGraphStatus } from './execution-graph'
import { useMemo } from 'react'

export type LiveExecutionEvent = {
  id: string
  at: string
  title: string
  detail: string
  nodeLabel: string
  tone: ExecutionGraphStatus
  attempts?: number
  trackKey: string
  taskId?: string
}

/**
 * The graph keeps every attempt for audit, but the global pulse represents the
 * latest condition of each track. A resolved retry must not leave the whole
 * delivery marked as needing human attention.
 */
export function graphHasCurrentAttention(events: readonly ExecutionGraphEvent[]) {
  return graphCurrentStatuses(events).some((status) => status === 'attention' || status === 'blocked')
}

export function graphCurrentStatuses(events: readonly ExecutionGraphEvent[]) {
  const currentByTrack = new Map<string, ExecutionGraphEvent>()
  for (const event of events) {
    const current = currentByTrack.get(event.trackId)
    const occurredAt = Date.parse(event.occurredAt)
    const currentOccurredAt = current ? Date.parse(current.occurredAt) : Number.NEGATIVE_INFINITY
    const eventOccurredAt = Number.isFinite(occurredAt) ? occurredAt : Number.NEGATIVE_INFINITY
    // The graph contract currently has timestamps but no per-track sequence.
    // A stable id tie-break keeps a reordered snapshot from changing the live
    // pulse when two records share the same timestamp.
    if (!current || eventOccurredAt > currentOccurredAt || (eventOccurredAt === currentOccurredAt && event.id.localeCompare(current.id) > 0)) {
      currentByTrack.set(event.trackId, event)
    }
  }
  return [...currentByTrack.values()].map((event) => event.status)
}

export function graphLiveState(statuses: readonly ExecutionGraphStatus[]) {
  if (statuses.some((status) => status === 'attention' || status === 'blocked')) return 'attention' as const
  if (statuses.some((status) => status === 'human')) return 'human' as const
  if (statuses.some((status) => status === 'cancelling')) return 'cancelling' as const
  if (statuses.length > 0 && statuses.every((status) => status === 'cancelled')) return 'cancelled' as const
  if (statuses.some((status) => status === 'retrying')) return 'retrying' as const
  if (statuses.some((status) => status === 'degraded')) return 'degraded' as const
  return 'default' as const
}

export function graphTrackSummary(statuses: readonly ExecutionGraphStatus[]) {
  const active = statuses.filter((status) => status === 'active' || status === 'queued' || status === 'retrying').length
  const human = statuses.filter((status) => status === 'human').length
  const waiting = statuses.filter((status) => status === 'waiting' || status === 'cancelling').length
  const attention = statuses.filter((status) => status === 'attention' || status === 'blocked' || status === 'degraded').length
  return [
    attention > 0 ? `${attention} ${attention === 1 ? 'requiere atención' : 'requieren atención'}` : '',
    human > 0 ? `${human} ${human === 1 ? 'gate requiere decisión' : 'gates requieren decisión'}` : '',
    waiting > 0 ? `${waiting} ${waiting === 1 ? 'en espera' : 'en espera'}` : '',
    active > 0 ? `${active} ${active === 1 ? 'ruta activa' : 'rutas activas'}` : '',
  ].filter(Boolean).join(' · ')
}

export function graphTrackSummaryCompact(statuses: readonly ExecutionGraphStatus[]) {
  const active = statuses.filter((status) => status === 'active' || status === 'queued' || status === 'retrying').length
  const human = statuses.filter((status) => status === 'human').length
  const waiting = statuses.filter((status) => status === 'waiting' || status === 'cancelling').length
  const attention = statuses.filter((status) => status === 'attention' || status === 'blocked' || status === 'degraded').length
  return [
    attention > 0 ? `${attention} atención` : '',
    human > 0 ? `${human} decisión` : '',
    waiting > 0 ? `${waiting} espera` : '',
    active > 0 ? `${active} ${active === 1 ? 'activa' : 'activas'}` : '',
  ].filter(Boolean).join(' · ')
}

export function LiveExecutionMap({
  events,
  graphEvents,
  onOpenActivity,
  onInspectTask,
  onCancelTask,
  onRefresh,
  streamStatus,
}: {
  events?: LiveExecutionEvent[]
  graphEvents?: ExecutionGraphEvent[]
  onOpenActivity?: () => void
  onInspectTask?: (taskId: string) => void
  onCancelTask?: (taskId: string) => void
  onRefresh?: () => void
  streamStatus?: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'
}) {
  const legacyGraphEvents = useMemo<ExecutionGraphEvent[]>(() => (events ?? []).map((event) => ({
    id: event.id,
    occurredAt: event.at,
    trackId: event.trackKey,
    trackLabel: event.nodeLabel,
    title: event.title,
    summary: event.title,
    detail: event.detail,
    status: event.tone,
    attempts: event.attempts,
    metadata: event.taskId ? { kind: 'task', taskId: event.taskId, canCancel: event.tone === 'active' || event.tone === 'queued', canOpenTrace: true } : undefined,
  })), [events])
  const resolvedEvents = graphEvents ?? legacyGraphEvents
  const graphStatuses = useMemo(() => graphCurrentStatuses(resolvedEvents), [resolvedEvents])
  const liveState = graphLiveState(graphStatuses)
  const trackSummary = graphTrackSummary(graphStatuses)
  const trackSummaryCompact = graphTrackSummaryCompact(graphStatuses)
  const primaryStatus = liveState === 'attention'
    ? 'Atención requerida'
    : liveState === 'human'
      ? 'Decisión requerida'
    : liveState === 'cancelling'
      ? 'Deteniendo ejecución'
      : liveState === 'cancelled'
        ? 'Ejecución cancelada'
        : liveState === 'retrying'
          ? 'Reintentando automáticamente'
          : liveState === 'degraded'
            ? 'Señal limitada'
            : undefined
  const actions = useMemo<ExecutionGraphAction[]>(() => [
    ...(onOpenActivity ? [{ id: 'open-runs', label: 'Ver ejecuciones', description: 'Abrir el historial completo.', onSelect: onOpenActivity }] : []),
    ...(onInspectTask ? [{
      id: 'inspect-task',
      label: 'Ver ejecución',
      description: 'Resultado, trazas y evidencia.',
      isVisible: (event: ExecutionGraphEvent) =>
        typeof event.metadata?.taskId === 'string' &&
        (event.metadata?.canOpenTrace === true || event.metadata?.canOpenResult === true || event.metadata?.canOpenExecution === true || event.metadata?.canOpenToolReport === true),
      onSelect: (event: ExecutionGraphEvent) => {
        const taskId = event.metadata?.taskId
        if (typeof taskId === 'string') onInspectTask(taskId)
      },
    }] : []),
    ...(onCancelTask ? [{
      id: 'cancel-task',
      label: 'Detener',
      description: 'Detiene esta tarea de forma segura.',
      isVisible: (event: ExecutionGraphEvent) =>
        (event.metadata?.entityType === 'automation_task' || event.metadata?.kind === 'task') &&
        typeof event.metadata?.taskId === 'string' &&
        event.metadata.canCancel === true &&
        (event.status === 'active' || event.status === 'queued'),
      onSelect: (event: ExecutionGraphEvent) => {
        const taskId = event.metadata?.taskId
        if (typeof taskId === 'string') onCancelTask(taskId)
      },
    }] : []),
  ], [onCancelTask, onInspectTask, onOpenActivity])

  return (
    <ExecutionGraph
      events={resolvedEvents}
      actions={actions}
      density="compact"
      maxEvents={16}
      grouping={{ enabled: true, mode: 'smart' }}
      onOpenHistory={onOpenActivity}
      statusIndicator={{
        state: streamStatus ?? 'idle',
        // The pipeline describes the agent's work state. This badge is the
        // connection state for the graph, so a healthy channel must not imply
        // that a completed phase is still actively running.
        label: streamStatus === 'live' ? 'Canal en vivo' : undefined,
        tone: 'default',
        onRefresh,
      }}
      eyebrow="Live steps"
      title={primaryStatus ?? 'Flujo en vivo'}
      statusSummary={trackSummary ? { compact: trackSummaryCompact, detail: trackSummary } : undefined}
    />
  )
}
