import type { ExecutionGraphEvent, ExecutionGraphStatus } from './execution-graph'

export type DeliveryExecutionGraphAction = {
  id: string
  /** Axios normalizes Go JSON to snake_case; camelCase remains accepted for adapters/tests. */
  targetType?: string
  target_type?: string
  targetId?: string
  target_id?: string
  requiresConfirmation?: boolean
  requires_confirmation?: boolean
}

export type DeliveryExecutionGraphNode = {
  id: string
  kind: string
  status: string
  summary: string
  detail?: string
  parentId?: string
  parent_id?: string
  trackId?: string
  track_id?: string
  occurredAt?: string
  occurred_at?: string
  entity: { type: string; id: string }
  metadata?: Record<string, unknown>
  actions?: DeliveryExecutionGraphAction[]
}

export type DeliveryExecutionGraphEdge = {
  id: string
  sourceId?: string
  source_id?: string
  targetId?: string
  target_id?: string
  kind: string
  status?: string
}

export type DeliveryExecutionGraphSnapshot = {
  schemaVersion?: number
  schema_version?: number
  workItemId?: string
  work_item_id?: string
  revision: string
  generatedAt?: string
  generated_at?: string
  live: boolean
  truncated: boolean
  nodes: DeliveryExecutionGraphNode[]
  edges: DeliveryExecutionGraphEdge[]
}

const graphStatusByDeliveryStatus: Record<string, ExecutionGraphStatus> = {
  active: 'active', running: 'active', queued: 'queued', complete: 'complete', completed: 'complete',
  attention: 'attention', failed: 'attention', dispatch_failed: 'attention', rejected: 'attention',
  human: 'human', decision: 'human', approved: 'human', changes_requested: 'human',
  cancelled: 'cancelled', cancel_requested: 'cancelling',
  blocked: 'blocked', retrying: 'retrying', waiting: 'waiting', pending: 'waiting', degraded: 'degraded',
}

const trackLabelByKind: Record<string, string> = {
  work_item: 'Workflow', dependency: 'Dependencia', task: 'Agente', execution: 'Modelo',
  tool_call: 'Herramienta', gate: 'Gate', evidence: 'Evidencia', message: 'Conversación',
}

function graphNodeParentID(node: DeliveryExecutionGraphNode) {
  return node.parentId ?? node.parent_id
}

function graphNodeTrackID(node: DeliveryExecutionGraphNode) {
  return node.trackId ?? node.track_id
}

function graphNodeOccurredAt(node: DeliveryExecutionGraphNode) {
  return node.occurredAt ?? node.occurred_at ?? ''
}

function graphEdgeSourceID(edge: DeliveryExecutionGraphEdge) {
  return edge.sourceId ?? edge.source_id
}

function graphEdgeTargetID(edge: DeliveryExecutionGraphEdge) {
  return edge.targetId ?? edge.target_id
}

function graphActionTargetType(action: DeliveryExecutionGraphAction) {
  return action.targetType ?? action.target_type
}

export function deliveryExecutionGraphBelongsTo(snapshot: DeliveryExecutionGraphSnapshot | null | undefined, workItemId: string | null | undefined) {
  const expected = workItemId?.trim()
  const received = (snapshot?.workItemId ?? snapshot?.work_item_id)?.trim()
  return Boolean(expected && received && expected === received)
}

function browserMetadata(metadata: Record<string, unknown> | undefined, node: DeliveryExecutionGraphNode, taskId?: string) {
  const result: Record<string, string | number | boolean | undefined> = {
    kind: node.kind,
    entityType: node.entity.type,
    entityId: node.entity.id,
  }
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') result[key] = value
  }
  if (taskId) result.taskId = taskId
  for (const action of node.actions ?? []) {
    if (action.id === 'cancel' && graphActionTargetType(action) === 'automation_task') result.canCancel = true
    if (action.id === 'open_trace') result.canOpenTrace = true
    if (action.id === 'open_result') result.canOpenResult = true
    if (action.id === 'open_execution') result.canOpenExecution = true
    if (action.id === 'open_tool_report') result.canOpenToolReport = true
  }
  return result
}

function operationLabel(value: string | number | boolean | undefined, fallback: string) {
  if (typeof value !== 'string') return fallback
  const labels: Record<string, string> = {
    'delivery.plan': 'Plan', 'delivery.implementation': 'Construir', 'delivery.publish': 'Publicar',
    'delivery.qa': 'Verificar', 'delivery.summary': 'Entregar',
  }
  return labels[value] ?? fallback
}

function phaseGroup(node: DeliveryExecutionGraphNode, trackID: string, trackLabel: string) {
  // A delivery phase can emit many task, model and tool records. Keep the
  // default canvas legible by showing one live phase bubble; its inspector can
  // reveal the individual records when an operator needs to intervene.
  if (node.kind !== 'task' && node.kind !== 'execution' && node.kind !== 'tool_call') return undefined
  return {
    id: `phase:${trackID}`,
    label: trackLabel,
  }
}

function nodePresentation(node: DeliveryExecutionGraphNode, trackLabel: string) {
  const summary = node.summary.trim() || trackLabel
  // The server's safe summary is often just the delivery operation (for
  // example, "Plan"). Preserve it when it carries new information, but add
  // the record type when several autonomous records share that same phase.
  const isGenericPhase = ['Plan', 'Construir', 'Publicar', 'Verificar', 'Entregar'].includes(summary)
  if (node.kind === 'work_item') return 'Resultado en ejecución'
  if (summary !== trackLabel && (node.kind === 'task' || !isGenericPhase)) return summary
  const phase = isGenericPhase ? summary : trackLabel
  if (node.kind === 'execution') return `${phase} · Modelo`
  if (node.kind === 'tool_call') return `${phase} · Herramienta`
  if (node.kind === 'gate') return `${phase} · Gate`
  if (node.kind === 'evidence') return `${phase} · Evidencia`
  if (node.kind === 'message') return `${phase} · Contexto`
  return summary
}

export function executionGraphEventsFromDelivery(snapshot: DeliveryExecutionGraphSnapshot): ExecutionGraphEvent[] {
  const dependenciesByTarget = new Map<string, string[]>()
  for (const edge of snapshot.edges) {
    const sourceID = graphEdgeSourceID(edge)
    const targetID = graphEdgeTargetID(edge)
    if (!sourceID || !targetID) continue
    const dependencies = dependenciesByTarget.get(targetID) ?? []
    dependencies.push(sourceID)
    dependenciesByTarget.set(targetID, dependencies)
  }

  const nodesByID = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const taskIDFor = (node: DeliveryExecutionGraphNode) => {
    let current: DeliveryExecutionGraphNode | undefined = node
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      if (current.entity.type === 'automation_task') return current.entity.id
      const parentID = graphNodeParentID(current)
      current = parentID ? nodesByID.get(parentID) : undefined
    }
    return undefined
  }

  const hasOperationalNode = snapshot.nodes.some((node) => node.kind !== 'work_item')
  return snapshot.nodes
    // The root is useful as a safe inspector fallback for an otherwise empty
    // graph. Once the agent has emitted a real task, gate, or evidence node it
    // only consumes a mobile slot and makes the flow look paused.
    .filter((node) => !hasOperationalNode || node.kind !== 'work_item')
    .map((node) => {
    const metadata = browserMetadata(node.metadata, node, taskIDFor(node))
    const trackLabel = operationLabel(metadata.operation, trackLabelByKind[node.kind] ?? 'Proceso')
    const trackId = graphNodeTrackID(node) || `${node.kind}:${node.entity.id}`
    const group = phaseGroup(node, trackId, operationLabel(
      typeof metadata.operation === 'string' ? metadata.operation : trackId,
      trackLabel,
    ))
    const attempts = typeof metadata.attemptCount === 'number'
      ? metadata.attemptCount
      : typeof metadata.attempt_count === 'number'
        ? metadata.attempt_count
        : undefined
    const presentation = nodePresentation(node, trackLabel)
    return {
      id: node.id,
      occurredAt: graphNodeOccurredAt(node),
      trackId,
      trackLabel,
      title: presentation,
      summary: presentation,
      detail: node.detail || (node.kind === 'work_item' ? node.summary : presentation),
      // A newer server-side status should remain inspectable without creating
      // a false human incident. The graph reserves `attention` for an
      // explicit execution failure or review condition.
      status: graphStatusByDeliveryStatus[node.status] ?? 'degraded',
      kind: node.kind,
      attempts,
      parentId: graphNodeParentID(node),
      dependsOn: dependenciesByTarget.get(node.id),
      groupId: group?.id,
      groupLabel: group?.label,
      metadata,
    }
    })
}
