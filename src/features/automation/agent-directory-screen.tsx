'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import type {
  AutomationAgentActivityAction,
  AutomationAgentDirectorySnapshot,
  AutomationAgentHistoryItem,
  AutomationAgentHistoryPage,
  AutomationAgentHistoryQueryFilters,
  AutomationAgentInstance,
  AutomationAgentProfile,
  AutomationAgentRun,
  AutomationAgentStatus,
} from '@/features/automation/agent-directory'
import {
  automationAgentInstanceOperationalView,
  automationAgentPlanStepProtocolState,
  isSafeAutomationEpicId,
} from '@/features/automation/agent-directory'
import { AgentInstanceRegistry } from '@/features/automation/agent-instance-registry'
import { clientPath, deliveryEpicBrowserPath } from '@/lib/api-paths'
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  CpuChipIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'

const agentStatusLabel = {
  working: 'Trabajando',
  available: 'Disponible',
  draining: 'Drenando',
  offline: 'Sin conexión',
} as const

const statusColor = {
  working: 'indigo',
  available: 'emerald',
  draining: 'amber',
  offline: 'zinc',
} as const

const runStatusLabel: Record<string, string> = {
  pending: 'Pendiente',
  queued: 'En cola',
  running: 'En curso',
  cancel_requested: 'Cancelación solicitada',
  completed: 'Completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
  blocked: 'Bloqueada',
  waiting: 'En espera',
}

const operationLabel: Record<string, string> = {
  'delivery.chat': 'Chat de agente',
  'delivery.plan': 'Planeación',
  'delivery.implementation': 'Implementación',
  'delivery.publish': 'Publicación',
  'delivery.qa': 'Validación',
  'delivery.summary': 'Entrega',
}

const historyKindLabel: Record<AutomationAgentHistoryItem['kind'], string> = {
  task: 'Tarea',
  task_event: 'Ciclo de vida de tarea',
  inference: 'Inferencia',
  tool_call: 'Llamada a herramienta',
  step_event: 'Evento de paso',
  step_activity: 'Actividad del paso',
}

const taskEventTypeLabel: Record<NonNullable<AutomationAgentHistoryItem['event_type']>, string> = {
  created: 'Tarea creada',
  claimed: 'Trabajo reclamado',
  status_transition: 'Cambio de estado',
  lease_reclaimed: 'Lease recuperado tras vencimiento',
  assignment_changed: 'Asignación actualizada',
  attempt_updated: 'Intento actualizado',
  recorded: 'Evento de tarea registrado',
}

const historyActivityActionLabel: Record<AutomationAgentActivityAction, string> = {
  inference: 'Inferencia del agente',
  tool: 'Uso de herramienta',
  file_read: 'Lectura de archivo',
  file_change: 'Cambio de archivo',
  command: 'Ejecución de comando',
  validation: 'Validación',
  evidence: 'Evidencia',
  activity: 'Actividad',
}

type AgentHistoryView = {
  pages: AutomationAgentHistoryPage[]
  error?: Error
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
}

type HistoryFilterDraft = AutomationAgentHistoryQueryFilters

export type AgentDirectoryScopeOption = { id: string; name: string }
export type AgentDirectoryProjectOption = { id: string; client_id: string; name: string }

const EMPTY_HISTORY_FILTERS: HistoryFilterDraft = {
  from: '',
  to: '',
  client_id: '',
  project_id: '',
  work_item_id: '',
  operation: '',
  status: '',
  provider: '',
  worker_id: '',
  machine_id: '',
  agent_instance_id: '',
  run_id: '',
}

function number(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value)
}

function money(microusd: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(microusd / 1_000_000)
}

function dateTime(value?: string) {
  if (!value) return 'Sin dato'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Sin dato'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function elapsedLabel(milliseconds: number | null) {
  if (milliseconds === null) return 'Antigüedad no determinable'
  if (milliseconds < 1_000) return 'hace menos de 1 s'
  if (milliseconds < 60_000) return `hace ${Math.floor(milliseconds / 1_000)} s`
  if (milliseconds < 3_600_000) return `hace ${Math.floor(milliseconds / 60_000)} min`
  const hours = Math.floor(milliseconds / 3_600_000)
  return `hace ${hours} h`
}

function instanceAvailabilityLabel(
  availability: ReturnType<typeof automationAgentInstanceOperationalView>['availability']
) {
  if (availability === 'available') return 'Slots libres reportados'
  if (availability === 'saturated') return 'Sin slots libres'
  if (availability === 'no_capacity') return 'Concurrencia cero'
  if (availability === 'draining') return 'Drenando · no recibe trabajo'
  if (availability === 'offline') return 'Offline · señal vencida'
  return 'Disponibilidad no determinable'
}

function instanceAvailabilityColor(
  availability: ReturnType<typeof automationAgentInstanceOperationalView>['availability']
) {
  if (availability === 'available') return 'emerald' as const
  if (availability === 'draining' || availability === 'saturated' || availability === 'no_capacity')
    return 'amber' as const
  if (availability === 'offline') return 'rose' as const
  return 'zinc' as const
}

function instanceStatusLabel(status: string) {
  if (status === 'available') return 'Disponible'
  if (status === 'working') return 'Trabajando'
  if (status === 'draining') return 'Drenando'
  if (status === 'offline') return 'Sin conexión'
  return status || 'Sin dato'
}

function localDateBoundary(value: string, exclusiveEnd: boolean) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day + (exclusiveEnd ? 1 : 0)).toISOString()
}

function contextOptions(
  items: AutomationAgentHistoryItem[],
  idKey: 'client_id' | 'project_id' | 'work_item_id',
  labelKey: 'client_name' | 'project_name' | 'work_item_title'
) {
  const options = new Map<string, string>()
  for (const item of items) {
    const id = item[idKey]
    if (id && !options.has(id)) options.set(id, safeAgentDetail(item[labelKey], id))
  }
  return [...options]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es-MX'))
}

function historyValueOptions(
  items: AutomationAgentHistoryItem[],
  key:
    | 'operation'
    | 'status'
    | 'provider'
    | 'worker_id'
    | 'machine_id'
    | 'agent_instance_id'
    | 'previous_agent_instance_id'
    | 'run_id'
) {
  return [...new Set(items.map((item) => item[key]).filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right, 'es-MX')
  )
}

function statusForProfile(agent: AutomationAgentProfile) {
  return agentStatusLabel[agent.status]
}

function planStepRuntimeSummary(agent: AutomationAgentProfile) {
  if (agent.instances.length === 0) return 'Plan steps: sin workers visibles para confirmar compatibilidad'

  const counts = { supported: 0, legacy: 0, unknown: 0 }
  for (const instance of agent.instances) {
    counts[automationAgentPlanStepProtocolState(instance.protocols)] += 1
  }
  return `Plan steps: ${counts.supported} compatible · ${counts.legacy} legacy/sin soporte · ${counts.unknown} sin protocolo reportado`
}

function planStepProtocolLabel(state: ReturnType<typeof automationAgentPlanStepProtocolState>) {
  if (state === 'supported') return 'Plan steps v1 compatible'
  if (state === 'legacy') return 'Legacy · sin soporte de pasos'
  return 'Protocolo no reportado'
}

function planStepProtocolColor(state: ReturnType<typeof automationAgentPlanStepProtocolState>) {
  if (state === 'supported') return 'emerald'
  if (state === 'legacy') return 'amber'
  return 'zinc'
}

function operationName(operation: string) {
  return operationLabel[operation] ?? 'Operación de agente'
}

const unsafeAgentDetailPattern =
  /(?:\b(?:sk|rk|pk|gh[pousr])[-_][a-z0-9_-]{12,}\b|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+\S+|\b(?:api[_ -]?key|secret|token|password)\s*[:=]\s*\S+|\b(?:system|developer|user)?\s*(?:prompt|reasoning|thought|chain[ -]of[ -]thought)\s*[:=]|https?:\/\/|\bwww\.|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|test|local|localhost|internal|corp|ai|mx|app|cloud)\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|[a-z]:[\\/]|\/(?:home|users|tmp|var|etc|root|workspace|app|mnt|opt|private)\/|\b[\w.-]+(?:\\[\w.-]+)+(?:\.[\w.-]+)?\b|\b[\w.-]+(?:\/[\w.-]+)+(?:\.[\w.-]+)?\b|(?:^|\s)(?:[$>#]\s*)?(?:sudo|curl|wget|npm|npx|pnpm|yarn|bun|node|docker|git|bash|sh|zsh|fish|pwsh|powershell|cmd(?:\.exe)?|python(?:3)?|go|rm|rmdir|mkdir|cat|echo|cd|ls|find|grep|rg|ssh|scp|make|terraform|aws|kubectl|helm|psql|sqlite3|jq|yq|apt|brew|kill|chmod|chown|touch|perl|ruby|php|java|gradle|mvn|cargo|rustc|pip|pipx|uv|poetry|systemctl|service|env|export|set)\s+\S+)/i

function safeAgentDetail(value: string | undefined, fallback = '') {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? ''
  if (!normalized) return fallback
  if (unsafeAgentDetailPattern.test(normalized)) return 'Detalle omitido por seguridad'
  return normalized.length > 120 ? `${normalized.slice(0, 117)}…` : normalized
}

function historyItemTitle(item: AutomationAgentHistoryItem) {
  if (item.kind === 'task_event') return item.event_type ? taskEventTypeLabel[item.event_type] : 'Evento de tarea'
  if (item.kind === 'step_activity') {
    return item.activity_action ? historyActivityActionLabel[item.activity_action] : 'Actividad del paso'
  }
  if (item.kind === 'task') return 'Ejecución de tarea registrada'
  if (item.kind === 'inference') return 'Inferencia registrada'
  if (item.kind === 'tool_call') return 'Uso de herramienta registrado'
  return 'Cambio de paso registrado'
}

function historyTaskStatusLabel(status?: string) {
  if (!status) return 'Sin estado previo'
  return runStatusLabel[status] ?? 'Estado registrado'
}

function historyIdentityTransition(label: string, previous?: string, current?: string) {
  const previousValue = previous?.trim() ?? ''
  const currentValue = current?.trim() ?? ''
  if (!previousValue && !currentValue) return null
  if (previous === undefined) return `${label} actual · ${safeAgentDetail(currentValue, 'No reportado')}`
  if (previousValue === currentValue) return `${label} · ${safeAgentDetail(currentValue, 'Sin asignación')}`
  const previousLabel = previousValue ? safeAgentDetail(previousValue, 'Identidad omitida') : 'Sin asignación'
  const currentLabel = currentValue ? safeAgentDetail(currentValue, 'Identidad omitida') : 'Sin asignación'
  return `${label} · ${previousLabel} → ${currentLabel}`
}

function workItemStepHref(workItemId: string, stepKey?: string, runId?: string) {
  const params = new URLSearchParams()
  const visibleStepKey = safeAgentDetail(stepKey)
  const visibleRunId = safeAgentDetail(runId)
  if (stepKey && visibleStepKey && visibleStepKey !== 'Detalle omitido por seguridad') {
    params.set('view', 'overview')
    params.set('step', stepKey)
    if (runId && visibleRunId && visibleRunId !== 'Detalle omitido por seguridad') params.set('run', runId)
  } else {
    params.set('view', 'activity')
  }
  return `/automation/work-items/${encodeURIComponent(workItemId)}?${params.toString()}`
}

function ContextHierarchy({
  clientId,
  clientName,
  projectId,
  projectName,
  epicId,
  epicTitle,
  workItemId,
  workItemTitle,
  stepKey,
  runId,
  label,
}: {
  clientId?: string
  clientName?: string
  projectId?: string
  projectName?: string
  epicId?: string
  epicTitle?: string
  workItemId?: string
  workItemTitle?: string
  stepKey?: string
  runId?: string
  label: string
}) {
  const segments: Array<{ key: string; label: string; href?: string }> = []
  if (clientId || clientName) {
    segments.push({ key: 'client', label: safeAgentDetail(clientName, 'Cliente'), href: clientId ? clientPath(clientId) : undefined })
  }
  if (projectId || projectName) {
    segments.push({
      key: 'project',
      label: safeAgentDetail(projectName, 'Proyecto'),
      href: projectId ? `/automation/projects/${encodeURIComponent(projectId)}` : undefined,
    })
  }
  if (epicId || epicTitle) {
    segments.push({
      key: 'epic',
      label: safeAgentDetail(epicTitle, 'Épica'),
      href: isSafeAutomationEpicId(epicId) ? deliveryEpicBrowserPath(epicId) : undefined,
    })
  }
  if (workItemId || workItemTitle) {
    const safeStepKey = safeAgentDetail(stepKey)
    segments.push({
      key: 'work-item',
      label: `${safeAgentDetail(workItemTitle, 'Tarea')}${safeStepKey ? ` · abrir diario de ${safeStepKey}` : ''}`,
      href: workItemId ? workItemStepHref(workItemId, stepKey, runId) : undefined,
    })
  }
  if (stepKey) segments.push({ key: 'step', label: `Paso ${safeAgentDetail(stepKey)}` })
  if (segments.length === 0) return null

  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {segments.map((segment, index) => (
        <span key={segment.key} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true" className="text-ink-muted">›</span> : null}
          {segment.href ? (
            <Link href={segment.href} className="font-semibold text-(--tenant-accent) hover:underline">
              {segment.label}
            </Link>
          ) : (
            <span className="text-ink-secondary">{segment.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p> : null}
    </article>
  )
}

function RunAssignment({ run }: { run: AutomationAgentRun }) {
  const title = safeAgentDetail(run.work_item_title, operationName(run.operation))
  return (
    <li className="rounded-xl border border-border-subtle bg-surface-raised p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {operationName(run.operation)} · {runStatusLabel[run.status] ?? 'Estado reportado'}
          </p>
        </div>
        <Badge color={run.status === 'running' ? 'indigo' : run.status === 'failed' ? 'rose' : 'zinc'}>
          {safeAgentDetail(run.run_id, 'Ejecución')}
        </Badge>
      </div>
      <div className="mt-2">
        <ContextHierarchy
          clientId={run.client_id}
          clientName={run.client_name}
          projectId={run.project_id}
          projectName={run.project_name}
          epicId={run.epic_id}
          epicTitle={run.epic_title}
          workItemId={run.work_item_id}
          workItemTitle={run.work_item_title}
          stepKey={run.step_key}
          runId={run.run_id}
          label="Jerarquía del trabajo activo"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span>Inició: {dateTime(run.started_at)}</span>
        {run.work_item_id ? (
          <Link
            href={workItemStepHref(run.work_item_id, run.step_key, run.run_id)}
            className="inline-flex min-h-9 items-center gap-1 font-semibold text-(--tenant-accent) hover:underline"
          >
            {run.step_key ? 'Abrir paso y diario' : 'Abrir tarea'} <ArrowTopRightOnSquareIcon className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </li>
  )
}

function AgentCurrentWorkPreview({ agent }: { agent: AutomationAgentProfile }) {
  const sessions = agent.instances.flatMap((instance, instanceIndex) =>
    instance.active_runs.map((run, sessionIndex) => ({
      run,
      instanceNumber: instanceIndex + 1,
      sessionNumber: sessionIndex + 1,
    }))
  )
  const reportedCount = Math.max(agent.active_run_count, sessions.length)

  return (
    <span className="mt-3 block rounded-xl border border-border-subtle bg-surface-soft/55 px-3 py-3">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink-secondary">Trabajo actual</span>
        <span className="text-[11px] font-medium text-ink-muted tabular-nums">
          {number(reportedCount)} {reportedCount === 1 ? 'sesión' : 'sesiones'}
        </span>
      </span>
      {sessions.length > 0 ? (
        <span className="mt-2 block space-y-2">
          {sessions.slice(0, 2).map(({ run, instanceNumber, sessionNumber }) => {
            const hierarchy = [
              safeAgentDetail(run.client_name),
              safeAgentDetail(run.project_name),
              safeAgentDetail(run.epic_title),
              run.work_item_id || run.work_item_title ? safeAgentDetail(run.work_item_title, 'Tarea') : '',
              run.step_key ? `Paso: ${safeAgentDetail(run.step_key)}` : '',
            ].filter(Boolean)
            return (
              <span
                key={`${run.task_id}:${run.run_id}`}
                className="block border-t border-border-subtle/80 pt-2 first:border-0 first:pt-0"
              >
                <span className="block truncate text-[11px] font-semibold text-ink-muted">
                  Instancia {instanceNumber} · sesión {sessionNumber}
                </span>
                {hierarchy.length > 0 ? (
                  <span className="mt-0.5 block truncate text-xs font-semibold text-ink">
                    {hierarchy.join(' › ')}
                  </span>
                ) : (
                  <span className="mt-0.5 block truncate text-xs font-semibold text-ink">
                    {operationName(run.operation)}
                  </span>
                )}
              </span>
            )
          })}
          {sessions.length > 2 ? (
            <span className="block text-[11px] text-ink-muted">
              +{number(sessions.length - 2)} sesiones en este perfil
            </span>
          ) : null}
          {agent.active_run_count > sessions.length ? (
            <span className="block text-[11px] leading-4 text-ink-muted">
              El backend reporta {number(agent.active_run_count - sessions.length)} ejecuciones adicionales sin detalle
              de sesión en esta captura.
            </span>
          ) : null}
        </span>
      ) : reportedCount > 0 ? (
        <span className="mt-1 block text-[11px] leading-4 text-ink-muted">
          El backend reporta trabajo activo, pero no incluye los detalles de sesión en esta captura.
        </span>
      ) : (
        <span className="mt-1 block text-[11px] leading-4 text-ink-muted">Sin sesiones activas reportadas.</span>
      )}
    </span>
  )
}

function InstanceCard({
  instance,
  snapshotGeneratedAt,
}: {
  instance: AutomationAgentInstance
  snapshotGeneratedAt: string
}) {
  const operational = automationAgentInstanceOperationalView(instance, snapshotGeneratedAt)
  const protocolState = automationAgentPlanStepProtocolState(instance.protocols)
  const hasReportedOverCapacity = operational.reportedActiveRuns > operational.concurrency
  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-soft/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {safeAgentDetail(instance.machine_id)
              ? `Máquina · ${safeAgentDetail(instance.machine_id)}`
              : 'ID de máquina no reportado'}
          </p>
          <p className="mt-1 text-xs break-all text-ink-muted">
            Worker · {safeAgentDetail(instance.worker_id, 'ID omitido')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge color={instanceAvailabilityColor(operational.availability)}>
            {instanceAvailabilityLabel(operational.availability)}
          </Badge>
          <Badge color={planStepProtocolColor(protocolState)}>{planStepProtocolLabel(protocolState)}</Badge>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-ink-muted">Estado reportado</dt>
          <dd className="mt-1 font-medium text-ink">
            {instanceStatusLabel(instance.status)}
            {instance.draining && instance.status !== 'draining' ? ' · drenando' : ''}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Proveedor · modelo</dt>
          <dd className="mt-1 font-medium break-words text-ink">
            {safeAgentDetail(instance.provider, 'Sin proveedor')} · {safeAgentDetail(instance.model, 'sin modelo')}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Slots ocupados / concurrencia</dt>
          <dd className="mt-1 font-medium text-ink tabular-nums">
            {number(operational.reportedActiveRuns)} / {number(operational.concurrency)}
          </dd>
          <dd className="mt-0.5 text-[11px] text-ink-muted">
            Ejecuciones activas atribuidas por el backend a este worker.
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Slots libres efectivos</dt>
          <dd className="mt-1 font-medium text-ink tabular-nums">{number(operational.effectiveAvailableSlots)}</dd>
          <dd className="mt-0.5 text-[11px] text-ink-muted">Capacidad y señal; no confirma readiness del workspace.</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Señal del equipo</dt>
          <dd className="mt-1 font-medium text-ink">
            {operational.liveness === 'live'
              ? 'Viva'
              : operational.liveness === 'stale'
                ? 'Vencida'
                : 'No determinable'}
          </dd>
          <dd className="mt-0.5 text-[11px] text-ink-muted">
            {dateTime(instance.last_seen_at)} · {elapsedLabel(operational.heartbeatAgeMs)} al corte de{' '}
            {dateTime(snapshotGeneratedAt)} (umbral 90 s).
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Workspace</dt>
          <dd className="mt-1 font-medium text-ink">No reportado por API v1</dd>
          <dd className="mt-0.5 text-[11px] text-ink-muted">No se infiere disponibilidad para repositorios o pasos.</dd>
        </div>
      </dl>
      {hasReportedOverCapacity ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[.05] px-3 py-2 text-xs leading-5 text-ink-secondary"
        >
          El snapshot atribuye {number(operational.reportedActiveRuns)} ejecuciones a una concurrencia de{' '}
          {number(operational.concurrency)}. Los slots libres se muestran como cero; confirma el estado del worker antes
          de reasignar.
        </p>
      ) : null}
      <p className="mt-3 rounded-xl border border-border-subtle bg-surface-raised/70 px-3 py-2 text-[11px] leading-5 text-ink-muted">
        La cola se reporta compartida por operación; la API no asigna tareas en espera a esta máquina.
      </p>
      <div className="mt-4 border-t border-border-subtle pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-ink">Ejecuciones asignadas</h4>
          <Badge color="zinc">{number(instance.active_runs.length)}</Badge>
        </div>
        {instance.active_runs.length > 0 ? (
          <ul className="space-y-2">
            {instance.active_runs.map((run) => (
              <RunAssignment key={run.run_id} run={run} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border-subtle px-3 py-3 text-xs leading-5 text-ink-muted">
            Esta instancia no reporta ejecuciones activas en la captura actual.
          </p>
        )}
      </div>
    </article>
  )
}

function AgentHistoryItemCard({ item }: { item: AutomationAgentHistoryItem }) {
  const hasClient = Boolean(item.client_id || item.client_name)
  const hasProject = Boolean(item.project_id || item.project_name)
  const hasEpic = Boolean(item.epic_id || item.epic_title)
  const hasWorkItem = Boolean(item.work_item_id || item.work_item_title)
  const hasContext = hasClient || hasProject || hasEpic || hasWorkItem || Boolean(item.step_key)
  const eventLabel = historyKindLabel[item.kind]
  const lifecycleIdentityRows =
    item.kind === 'task_event' &&
    (item.event_type === 'claimed' || item.event_type === 'lease_reclaimed' || item.event_type === 'assignment_changed')
      ? [
          item.current_agent_key
            ? historyIdentityTransition('Agente', item.previous_agent_key, item.current_agent_key)
            : null,
          historyIdentityTransition('Ejecución', item.previous_run_id, item.run_id),
          historyIdentityTransition('Worker', item.previous_worker_id, item.worker_id),
          historyIdentityTransition('Máquina', item.previous_machine_id, item.machine_id),
          historyIdentityTransition('Instancia', item.previous_agent_instance_id, item.agent_instance_id),
        ].filter((value): value is string => Boolean(value))
      : []

  return (
    <li className="rounded-xl border border-border-subtle bg-surface-raised p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              color={
                item.kind === 'task' || item.kind === 'task_event'
                  ? 'indigo'
                  : item.kind === 'inference'
                    ? 'emerald'
                    : item.kind === 'tool_call'
                      ? 'amber'
                      : 'zinc'
              }
            >
              {eventLabel}
            </Badge>
            {item.status ? (
              <Badge color={item.status === 'failed' ? 'rose' : item.status === 'running' ? 'indigo' : 'zinc'}>
                {item.kind === 'task_event' ? historyTaskStatusLabel(item.status) : runStatusLabel[item.status] ?? 'Registrado'}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">{historyItemTitle(item)}</p>
          {item.kind === 'task_event' ? (
            <p className="mt-1 text-xs font-medium text-ink-secondary">
              {item.previous_status
                ? `Estado de tarea: ${historyTaskStatusLabel(item.previous_status)} → ${historyTaskStatusLabel(item.status)}`
                : `Estado inicial: ${historyTaskStatusLabel(item.status)}`}
            </p>
          ) : null}
          {item.operation ? <p className="mt-1 text-xs text-ink-muted">{operationName(item.operation)}</p> : null}
        </div>
        <time className="shrink-0 text-xs text-ink-muted" dateTime={item.occurred_at}>
          {dateTime(item.occurred_at)}
        </time>
      </div>

      {hasContext ? (
        <div className="mt-3">
          <ContextHierarchy
            clientId={item.client_id}
            clientName={item.client_name}
            projectId={item.project_id}
            projectName={item.project_name}
            epicId={item.epic_id}
            epicTitle={item.epic_title}
            workItemId={item.work_item_id}
            workItemTitle={item.work_item_title}
            stepKey={item.step_key}
            runId={item.run_id}
            label="Contexto jerárquico de la actividad"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        {safeAgentDetail(item.task_id) ? <span>Tarea: {safeAgentDetail(item.task_id)}</span> : null}
        {safeAgentDetail(item.run_id) ? <span>Ejecución: {safeAgentDetail(item.run_id)}</span> : null}
        {safeAgentDetail(item.step_key) ? <span>Paso: {safeAgentDetail(item.step_key)}</span> : null}
        {item.kind === 'task_event' && item.attempt_count !== undefined ? (
          <span>Intento {number(item.attempt_count)}</span>
        ) : null}
        {item.kind === 'task_event' && item.event_sequence !== undefined ? (
          <span>Secuencia {number(item.event_sequence)}</span>
        ) : null}
        {lifecycleIdentityRows.map((identity) => (
          <span key={identity}>{identity}</span>
        ))}
        {item.provider || item.model ? (
          <span>{[safeAgentDetail(item.provider), safeAgentDetail(item.model)].filter(Boolean).join(' · ')}</span>
        ) : null}
        {item.input_tokens !== undefined || item.output_tokens !== undefined ? (
          <span>
            Tokens entrada: {item.input_tokens === undefined ? '—' : number(item.input_tokens)} · salida:{' '}
            {item.output_tokens === undefined ? '—' : number(item.output_tokens)}
          </span>
        ) : null}
        {item.total_cost_microusd !== undefined ? <span>Costo: {money(item.total_cost_microusd)}</span> : null}
      </div>
    </li>
  )
}

function AgentHistoryPanel({
  agent,
  history,
  scopeClientId,
  scopeProjectId,
  onApplyFilters,
  onLoadMore,
  onRetry,
}: {
  agent: AutomationAgentProfile
  history: AgentHistoryView
  scopeClientId?: string
  scopeProjectId?: string
  onApplyFilters: (filters: HistoryFilterDraft) => void
  onLoadMore: () => void
  onRetry: () => void
}) {
  const [filters, setFilters] = useState<HistoryFilterDraft>({ ...EMPTY_HISTORY_FILTERS })
  const [knownEvents, setKnownEvents] = useState<{ agentKey: string; items: AutomationAgentHistoryItem[] } | null>(null)
  const items = useMemo(() => history.pages.flatMap((page) => page.items), [history.pages])
  const cachedItems = knownEvents?.agentKey === agent.agent_key ? knownEvents.items : []
  const optionItems = [
    ...cachedItems,
    ...items.filter((item) => !cachedItems.some((cachedItem) => cachedItem.id === item.id)),
  ]
  const invalidDateRange = Boolean(filters.from && filters.to && filters.from > filters.to)
  const clients = contextOptions(optionItems, 'client_id', 'client_name')
  const effectiveClientFilter = scopeClientId || filters.client_id
  const effectiveProjectFilter = scopeProjectId || filters.project_id
  const projects = contextOptions(
    optionItems.filter((item) => !effectiveClientFilter || item.client_id === effectiveClientFilter),
    'project_id',
    'project_name'
  )
  const workItems = contextOptions(
    optionItems.filter(
      (item) =>
        (!effectiveClientFilter || item.client_id === effectiveClientFilter) &&
        (!effectiveProjectFilter || item.project_id === effectiveProjectFilter)
    ),
    'work_item_id',
    'work_item_title'
  )
  const operations = historyValueOptions(optionItems, 'operation')
  const statuses = historyValueOptions(optionItems, 'status')
  const providers = historyValueOptions(optionItems, 'provider')
  const workers = historyValueOptions(optionItems, 'worker_id')
  const machines = historyValueOptions(optionItems, 'machine_id')
  const instances = [
    ...new Set([
      ...historyValueOptions(optionItems, 'agent_instance_id'),
      ...historyValueOptions(optionItems, 'previous_agent_instance_id'),
    ]),
  ].sort((left, right) => left.localeCompare(right, 'es-MX'))
  const runs = historyValueOptions(optionItems, 'run_id')

  useEffect(() => {
    if (items.length === 0) return
    setKnownEvents((current) => {
      const existing = current?.agentKey === agent.agent_key ? current.items : []
      const seen = new Set(existing.map((item) => item.id))
      const additions = items.filter((item) => !seen.has(item.id))
      if (current?.agentKey === agent.agent_key && additions.length === 0) return current
      return { agentKey: agent.agent_key, items: [...existing, ...additions] }
    })
  }, [agent.agent_key, items])

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (invalidDateRange) return
    onApplyFilters({
      ...filters,
      client_id: scopeClientId || filters.client_id,
      project_id: scopeProjectId || filters.project_id,
      from: filters.from ? localDateBoundary(filters.from, false) : '',
      to: filters.to ? localDateBoundary(filters.to, true) : '',
    })
  }

  function clearFilters() {
    const next = { ...EMPTY_HISTORY_FILTERS, client_id: scopeClientId ?? '', project_id: scopeProjectId ?? '' }
    setFilters(next)
    onApplyFilters(next)
  }

  return (
    <section className="mt-6 border-t border-border-subtle pt-5" aria-labelledby="agent-history-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="agent-history-title" className="text-sm font-semibold text-ink">
            Historial de actividad
          </h3>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Eventos permitidos por el servicio, ordenados por fecha. No se muestran prompts, salidas ni razonamiento.
          </p>
        </div>
        <Badge color="zinc">{items.length} eventos cargados</Badge>
      </div>

      <form
        onSubmit={submitFilters}
        className="mt-3 grid gap-3 rounded-2xl border border-border-subtle bg-surface-soft/55 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4"
      >
        <label htmlFor="agent-history-from" className="block text-xs font-semibold text-ink-secondary">
          Desde
          <input
            id="agent-history-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          />
        </label>
        <label htmlFor="agent-history-to" className="block text-xs font-semibold text-ink-secondary">
          Hasta
          <input
            id="agent-history-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          />
        </label>
        {!scopeClientId ? <label htmlFor="agent-history-client" className="block text-xs font-semibold text-ink-secondary">
          Cliente
          <select
            id="agent-history-client"
            value={filters.client_id}
            onChange={(event) =>
              setFilters((current) => ({ ...current, client_id: event.target.value, project_id: '', work_item_id: '' }))
            }
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todos los clientes</option>
            {clients.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.value}
              </option>
            ))}
          </select>
        </label> : null}
        {!scopeProjectId ? <label htmlFor="agent-history-project" className="block text-xs font-semibold text-ink-secondary">
          Proyecto
          <select
            id="agent-history-project"
            value={filters.project_id}
            onChange={(event) =>
              setFilters((current) => ({ ...current, project_id: event.target.value, work_item_id: '' }))
            }
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.value}
              </option>
            ))}
          </select>
        </label> : null}
        <label htmlFor="agent-history-work-item" className="block text-xs font-semibold text-ink-secondary">
          Tarea
          <select
            id="agent-history-work-item"
            value={filters.work_item_id}
            onChange={(event) => setFilters((current) => ({ ...current, work_item_id: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todas las tareas</option>
            {workItems.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {option.value}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="agent-history-operation" className="block text-xs font-semibold text-ink-secondary">
          Operación
          <select
            id="agent-history-operation"
            value={filters.operation}
            onChange={(event) => setFilters((current) => ({ ...current, operation: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todas las operaciones</option>
            {operations.map((operation) => (
              <option key={operation} value={operation}>
                {operationName(operation)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="agent-history-status" className="block text-xs font-semibold text-ink-secondary">
          Estado
          <select
            id="agent-history-status"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todos los estados</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="agent-history-provider" className="block text-xs font-semibold text-ink-secondary">
          Proveedor
          <select
            id="agent-history-provider"
            value={filters.provider}
            onChange={(event) => setFilters((current) => ({ ...current, provider: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todos los proveedores</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="agent-history-worker" className="block text-xs font-semibold text-ink-secondary">
          Worker
          <select
            id="agent-history-worker"
            value={filters.worker_id}
            onChange={(event) => setFilters((current) => ({ ...current, worker_id: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todos los workers</option>
            {workers.map((worker) => (
              <option key={worker} value={worker}>
                {worker}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="agent-history-machine" className="block text-xs font-semibold text-ink-secondary">
          Máquina
          <select
            id="agent-history-machine"
            value={filters.machine_id}
            onChange={(event) => setFilters((current) => ({ ...current, machine_id: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todas las máquinas</option>
            {machines.map((machine) => (
              <option key={machine} value={machine}>
                {machine}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="agent-history-instance" className="block text-xs font-semibold text-ink-secondary">
          Instancia de agente
          <select
            id="agent-history-instance"
            value={filters.agent_instance_id}
            onChange={(event) => setFilters((current) => ({ ...current, agent_instance_id: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todas las instancias</option>
            {instances.map((instance) => (
              <option key={instance} value={instance}>
                {instance}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="agent-history-run" className="block text-xs font-semibold text-ink-secondary">
          Ejecución (run)
          <select
            id="agent-history-run"
            value={filters.run_id}
            onChange={(event) => setFilters((current) => ({ ...current, run_id: event.target.value }))}
            className="mt-1 block min-h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal text-ink"
          >
            <option value="">Todas las ejecuciones</option>
            {runs.map((run) => (
              <option key={run} value={run}>
                {run}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs leading-5 text-ink-muted sm:col-span-2 xl:col-span-4">
          “Hasta” incluye el día completo. Los selectores usan contexto e identificadores de eventos cargados; “Cargar
          más” amplía las opciones.
        </p>
        {invalidDateRange ? (
          <p className="text-xs text-rose-700 sm:col-span-2 xl:col-span-4" role="alert">
            La fecha inicial debe ser anterior o igual a la fecha final.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
          <Button outline type="submit" disabled={invalidDateRange}>
            Aplicar filtros
          </Button>
          <Button plain type="button" onClick={clearFilters} disabled={Object.values(filters).every((value) => !value)}>
            Limpiar filtros
          </Button>
        </div>
      </form>

      {history.error && items.length === 0 ? (
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4"
          role="alert"
        >
          <p className="text-sm text-ink-secondary">
            No se pudo cargar el historial de {safeAgentDetail(agent.name, 'este agente')}.
          </p>
          <Button outline onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : history.isLoading && items.length === 0 ? (
        <p
          className="mt-3 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted"
          role="status"
          aria-live="polite"
        >
          Cargando historial…
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted">
          No hay actividad para este perfil y periodo.
        </p>
      ) : (
        <>
          {history.error ? (
            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3"
              role="alert"
            >
              <p className="text-xs text-ink-secondary">
                No se pudo actualizar el historial. Los eventos cargados se mantienen visibles.
              </p>
              <Button plain onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          ) : null}
          <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <AgentHistoryItemCard key={item.id} item={item} />
              ))}
          </ul>
          {history.hasMore ? (
            <div className="mt-3 flex justify-center">
              <Button outline onClick={onLoadMore} disabled={history.isLoadingMore}>
                {history.isLoadingMore ? 'Actualizando…' : 'Cargar más'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function AgentProfileDialog({
  agent,
  snapshotGeneratedAt,
  history,
  scopeClientId,
  scopeProjectId,
  onClose,
  onApplyFilters,
  onLoadMore,
  onRetryHistory,
}: {
  agent: AutomationAgentProfile | null
  snapshotGeneratedAt: string
  history: AgentHistoryView
  scopeClientId?: string
  scopeProjectId?: string
  onClose: () => void
  onApplyFilters: (filters: HistoryFilterDraft) => void
  onLoadMore: () => void
  onRetryHistory: () => void
}) {
  return (
    <Dialog open={Boolean(agent)} onClose={onClose} size="4xl">
      {agent ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                <UserGroupIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle>{safeAgentDetail(agent.name, 'Agente')}</DialogTitle>
                <DialogDescription>
                  {safeAgentDetail(agent.specialty, 'Especialidad no reportada')} ·{' '}
                  {safeAgentDetail(agent.agent_key, 'Clave omitida')}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={statusColor[agent.status]}>{statusForProfile(agent)}</Badge>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar detalle del agente"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-border-subtle text-ink-muted transition hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
          </div>
          <DialogBody>
            {safeAgentDetail(agent.description) ? (
              <p className="max-w-3xl text-sm leading-6 text-ink-secondary">{safeAgentDetail(agent.description)}</p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryMetric label="Instancias vistas · 30 días" value={number(agent.instance_count)} />
              <SummaryMetric label="Ejecuciones activas" value={number(agent.active_run_count)} />
              <SummaryMetric
                label="Ejecuciones · 30 días"
                value={number(agent.total_runs_30d)}
                detail="Agregado reportado por el backend"
              />
              <SummaryMetric
                label="Gasto · 30 días"
                value={money(agent.spend_30d_microusd)}
                detail="Agregado reportado por el backend"
              />
            </div>
            <section className="mt-6" aria-labelledby="agent-capabilities-title">
              <h3 id="agent-capabilities-title" className="text-sm font-semibold text-ink">
                Especialidad y capacidades
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge color="indigo">{safeAgentDetail(agent.specialty, 'Especialidad no reportada')}</Badge>
                {agent.capabilities
                  .map((capability) => safeAgentDetail(capability))
                  .filter(Boolean)
                  .map((capability) => (
                    <Badge key={capability} color="zinc">
                      {capability}
                    </Badge>
                  ))}
                {agent.capabilities.length === 0 ? (
                  <span className="text-sm text-ink-muted">El perfil no reporta capacidades.</span>
                ) : null}
              </div>
            </section>
            <section className="mt-6" aria-labelledby="agent-instances-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="agent-instances-title" className="text-sm font-semibold text-ink">
                    Equipos e instancias
                  </h3>
                  <p className="mt-1 text-xs text-ink-muted">
                    La actividad listada está asignada a la instancia que la reporta.
                  </p>
                </div>
                <Badge color="zinc">
                  {number(agent.instances.length)} {agent.instances.length === 1 ? 'registro' : 'registros'} · 30 d
                </Badge>
              </div>
              {agent.instances.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {agent.instances.map((instance) => (
                    <InstanceCard
                      key={instance.worker_id}
                      instance={instance}
                      snapshotGeneratedAt={snapshotGeneratedAt}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-2xl border border-dashed border-border-subtle p-5 text-sm text-ink-muted">
                  Este perfil no reporta instancias en la captura actual.
                </p>
              )}
            </section>
            <p className="mt-5 rounded-xl bg-surface-soft px-4 py-3 text-xs leading-5 text-ink-muted">
              Las métricas anteriores son agregados de 30 días; el listado siguiente es el historial paginado reportado
              para este perfil.
            </p>
            <AgentHistoryPanel
              agent={agent}
              history={history}
              scopeClientId={scopeClientId}
              scopeProjectId={scopeProjectId}
              onApplyFilters={onApplyFilters}
              onLoadMore={onLoadMore}
              onRetry={onRetryHistory}
            />
          </DialogBody>
        </>
      ) : null}
    </Dialog>
  )
}

export function AgentDirectoryScreen({
  snapshot,
  scopeClientId = '',
  scopeProjectId = '',
  clients = [],
  projects = [],
  allowAllClients = true,
  initialAgentKey = null,
  isRefreshing = false,
  onRefresh,
  history,
  onAgentOpen,
  onAgentClose,
  onHistoryRequestChange,
  onHistoryFiltersChange,
  onScopeChange = () => undefined,
  onLoadMoreHistory,
  onRetryHistory,
}: {
  snapshot: AutomationAgentDirectorySnapshot
  scopeClientId?: string
  scopeProjectId?: string
  clients?: AgentDirectoryScopeOption[]
  projects?: AgentDirectoryProjectOption[]
  allowAllClients?: boolean
  initialAgentKey?: string | null
  isRefreshing?: boolean
  onRefresh?: () => void
  history: AgentHistoryView
  onAgentOpen: (agentKey: string) => void
  onAgentClose: () => void
  onHistoryRequestChange: (agentKey: string | null, filters: HistoryFilterDraft) => void
  onHistoryFiltersChange: (filters: HistoryFilterDraft) => void
  onScopeChange?: (clientId: string, projectId: string) => void
  onLoadMoreHistory: () => void
  onRetryHistory: () => void
}) {
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<AutomationAgentStatus | 'all'>('all')
  useEffect(() => setSelectedAgentKey(initialAgentKey), [initialAgentKey])
  const selectedAgent = snapshot.agents.find((agent) => agent.agent_key === selectedAgentKey) ?? null
  const summary = snapshot.summary
  const activeQueueLanes = snapshot.queue_lanes.filter((lane) => lane.queued_tasks > 0)
  const registryProfiles = useMemo(
    () =>
      snapshot.agents.map(({ agent_key, name }) => ({
        agent_key,
        name: safeAgentDetail(name, 'Agente'),
      })),
    [snapshot.agents]
  )
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('es-MX')
  const visibleAgents = snapshot.agents.filter((agent) => {
    if (statusFilter !== 'all' && agent.status !== statusFilter) return false
    if (!normalizedQuery) return true
    const searchableText = [agent.name, agent.agent_key, agent.specialty, agent.description, ...agent.capabilities]
      .join(' ')
      .toLocaleLowerCase('es-MX')
    return searchableText.includes(normalizedQuery)
  })
  const openAgent = (agentKey: string) => {
    if (!snapshot.agents.some((agent) => agent.agent_key === agentKey)) return
    setSelectedAgentKey(agentKey)
    onHistoryRequestChange(agentKey, { ...EMPTY_HISTORY_FILTERS, client_id: scopeClientId, project_id: scopeProjectId })
    onAgentOpen(agentKey)
  }
  const closeAgent = () => {
    setSelectedAgentKey(null)
    onHistoryRequestChange(null, { ...EMPTY_HISTORY_FILTERS })
    onAgentClose()
  }
  const scopedProjects = projects.filter((project) => !scopeClientId || project.client_id === scopeClientId)
  const profileHref = (agentKey: string) => {
    const query = new URLSearchParams()
    if (scopeClientId) query.set('client_id', scopeClientId)
    if (scopeProjectId) query.set('project_id', scopeProjectId)
    const suffix = query.toString()
    return `/automation/agents/${encodeURIComponent(agentKey)}${suffix ? `?${suffix}` : ''}`
  }

  return (
    <PageTransition>
      <main className="mx-auto max-w-[92rem] px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:pb-10">
        <PageHeader
          eyebrow="Operación de agentes"
          title="Equipo de agentes"
          description="Perfiles, equipos conectados y trabajo que cada instancia reporta ahora."
          icon={UserGroupIcon}
          actions={
            onRefresh ? (
              <Button outline onClick={onRefresh} aria-label="Actualizar equipo de agentes">
                <ArrowPathIcon
                  data-slot="icon"
                  className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}
                />
                Actualizar
              </Button>
            ) : null
          }
        />

        <AgentDirectoryScopeSelectors
          clientId={scopeClientId}
          projectId={scopeProjectId}
          clients={clients}
          projects={projects}
          allowAllClients={allowAllClients}
          onChange={onScopeChange}
        />

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Resumen del equipo de agentes">
          <SummaryMetric label="Perfiles" value={number(summary.profile_count)} />
          <SummaryMetric label="Instancias vivas" value={number(summary.live_instances)} />
          <SummaryMetric label="Ejecuciones activas" value={number(summary.active_runs)} />
          <SummaryMetric label="Slots disponibles" value={number(summary.available_slots)} />
          <SummaryMetric
            label="Tareas en cola compartida"
            value={number(summary.queued_tasks)}
            detail="Aún no asignadas a un perfil"
          />
          <SummaryMetric label="Gasto · 30 días" value={money(summary.spend_30d_microusd)} />
        </section>

        <AgentInstanceRegistry profiles={registryProfiles} />

        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.34fr)]">
          <section className="min-w-0" aria-labelledby="agent-roster-title">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Personas digitales</p>
                <h2 id="agent-roster-title" className="mt-1 text-xl font-semibold tracking-tight text-ink">
                  Perfiles
                </h2>
              </div>
              <span className="text-xs text-ink-muted">Captura recibida {dateTime(snapshot.generated_at)}</span>
            </div>
            <div className="mt-3 grid gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:p-4">
              <label className="block text-xs font-semibold text-ink-secondary" htmlFor="agent-directory-search">
                Buscar en esta captura
                <input
                  id="agent-directory-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nombre, clave, especialidad o capacidad"
                  className="mt-1 block min-h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal text-ink placeholder:text-ink-muted"
                />
              </label>
              <label className="block text-xs font-semibold text-ink-secondary" htmlFor="agent-directory-status">
                Estado del perfil
                <select
                  id="agent-directory-status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as AutomationAgentStatus | 'all')}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal text-ink"
                >
                  <option value="all">Todos los estados</option>
                  <option value="working">Trabajando</option>
                  <option value="available">Disponible</option>
                  <option value="draining">Drenando</option>
                  <option value="offline">Sin conexión</option>
                </select>
              </label>
              <p className="text-xs leading-5 text-ink-muted sm:col-span-2" aria-live="polite">
                Mostrando {number(visibleAgents.length)} de {number(snapshot.agents.length)} perfiles. La búsqueda y el
                estado se filtran localmente; resumen y cola corresponden al alcance autorizado seleccionado.
              </p>
            </div>
            {snapshot.agents.length > 0 ? (
              visibleAgents.length > 0 ? (
                <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {visibleAgents.map((agent) => (
                    <li key={agent.agent_key}>
                      <button
                        type="button"
                        onClick={() => openAgent(agent.agent_key)}
                        aria-haspopup="dialog"
                        aria-label={`Ver perfil de ${safeAgentDetail(agent.name, 'Agente')}`}
                        className="group flex min-h-64 w-full flex-col rounded-2xl border border-border-subtle bg-surface-raised p-4 text-left transition hover:-translate-y-0.5 hover:border-(--tenant-accent)/35 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
                      >
                        <span className="flex w-full items-start justify-between gap-3">
                          <span className="flex min-w-0 items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                              <CpuChipIcon className="size-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-ink">
                                {safeAgentDetail(agent.name, 'Agente')}
                              </span>
                              <span className="mt-1 block truncate text-xs text-ink-muted">
                                {safeAgentDetail(agent.specialty, 'Especialidad no reportada')}
                              </span>
                            </span>
                          </span>
                          <Badge color={statusColor[agent.status]}>{statusForProfile(agent)}</Badge>
                        </span>
                        <span className="mt-4 line-clamp-2 min-h-10 text-xs leading-5 text-ink-secondary">
                          {safeAgentDetail(agent.description, 'Este perfil no tiene descripción adicional.')}
                        </span>
                        <span className="mt-2 text-[11px] font-medium leading-4 text-ink-muted">
                          {planStepRuntimeSummary(agent)}
                        </span>
                        <span className="mt-4 grid grid-cols-3 gap-2 border-t border-border-subtle pt-3">
                          <span>
                            <span className="block text-[10px] font-semibold text-ink-muted">Vistas · 30 d</span>
                            <span className="mt-1 block text-sm font-semibold text-ink tabular-nums">
                              {number(agent.instance_count)}
                            </span>
                          </span>
                          <span>
                            <span className="block text-[10px] font-semibold text-ink-muted">En curso</span>
                            <span className="mt-1 block text-sm font-semibold text-ink tabular-nums">
                              {number(agent.active_run_count)}
                            </span>
                          </span>
                          <span>
                            <span className="block text-[10px] font-semibold text-ink-muted">Gasto · 30 d</span>
                            <span className="mt-1 block truncate text-sm font-semibold text-ink tabular-nums">
                              {money(agent.spend_30d_microusd)}
                            </span>
                          </span>
                        </span>
                        <AgentCurrentWorkPreview agent={agent} />
                        <span className="mt-4 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-(--tenant-accent)">
                          Ver perfil y estado actual{' '}
                          <ArrowTopRightOnSquareIcon className="size-3.5 transition group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-border-subtle bg-surface-raised p-8 text-center">
                  <p className="text-sm font-semibold text-ink">No hay perfiles que coincidan</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Cambia la búsqueda o selecciona otro estado. Estos filtros solo afectan la captura mostrada.
                  </p>
                  <Button
                    outline
                    className="mt-4"
                    onClick={() => {
                      setSearchQuery('')
                      setStatusFilter('all')
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-border-subtle bg-surface-raised p-8 text-center">
                <UserGroupIcon className="mx-auto size-7 text-ink-muted" />
                <p className="mt-3 text-sm font-semibold text-ink">Aún no hay perfiles disponibles</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Cuando el backend registre agentes, aparecerán aquí con su estado actual.
                </p>
              </div>
            )}
          </section>

          <aside
            className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised"
            aria-labelledby="shared-queue-title"
          >
            <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
              <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Despacho</p>
              <h2 id="shared-queue-title" className="mt-1 text-lg font-semibold text-ink">
                Cola compartida
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Estas tareas esperan asignación; no se atribuyen a ningún agente hasta que una instancia las reporte.
              </p>
            </div>
            {activeQueueLanes.length > 0 ? (
              <ul className="divide-y divide-border-subtle">
                {activeQueueLanes.map((lane) => (
                  <li key={lane.operation} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {operationName(lane.operation)}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                        <ClockIcon className="size-3" />
                        {lane.oldest_queued_at
                          ? `Más antigua · ${dateTime(lane.oldest_queued_at)}`
                          : 'Antigüedad no reportada'}
                      </span>
                    </span>
                    <Badge color={lane.queued_tasks > 0 ? 'amber' : 'zinc'}>
                      {number(lane.queued_tasks)} en espera
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-ink-muted">No hay tareas pendientes de asignación.</p>
            )}
          </aside>
        </div>

        <AgentProfileDialog
          key={`${selectedAgent?.agent_key ?? 'closed'}:${scopeClientId}:${scopeProjectId}`}
          agent={selectedAgent}
          snapshotGeneratedAt={snapshot.generated_at}
          history={history}
          scopeClientId={scopeClientId}
          scopeProjectId={scopeProjectId}
          onClose={closeAgent}
          onApplyFilters={onHistoryFiltersChange}
          onLoadMore={onLoadMoreHistory}
          onRetryHistory={onRetryHistory}
        />
      </main>
    </PageTransition>
  )
}

export function AgentDirectoryScopeSelectors({
  clientId,
  projectId,
  clients,
  projects,
  allowAllClients = true,
  disabled = false,
  onChange,
}: {
  clientId: string
  projectId: string
  clients: AgentDirectoryScopeOption[]
  projects: AgentDirectoryProjectOption[]
  allowAllClients?: boolean
  disabled?: boolean
  onChange: (clientId: string, projectId: string) => void
}) {
  const visibleProjects = projects.filter((project) => !clientId || project.client_id === clientId)
  return (
    <section className="grid gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-3 sm:grid-cols-2 sm:p-4" aria-label="Alcance del equipo de agentes">
      <label htmlFor="agent-directory-client" className="block text-xs font-semibold text-ink-secondary">
        Empresa / cliente del equipo
        <select
          id="agent-directory-client"
          aria-label="Empresa / cliente del alcance"
          value={clientId}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value, '')}
          className="mt-1 block min-h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal text-ink disabled:opacity-60"
        >
          {allowAllClients ? <option value="">Todas las empresas autorizadas</option> : <option value="">Elige una empresa</option>}
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </label>
      <label htmlFor="agent-directory-project" className="block text-xs font-semibold text-ink-secondary">
        Proyecto del equipo
        <select
          id="agent-directory-project"
          aria-label="Proyecto del alcance"
          value={projectId}
          disabled={disabled || !clientId}
          onChange={(event) => {
            const project = projects.find((option) => option.id === event.target.value)
            onChange(project?.client_id ?? clientId, event.target.value)
          }}
          className="mt-1 block min-h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal text-ink disabled:opacity-60"
        >
          <option value="">Todos los proyectos visibles</option>
          {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <p className="text-xs leading-5 text-ink-muted sm:col-span-2">
        El servidor vuelve a comprobar el acceso de la organización y del proyecto; estos selectores solo limitan el alcance mostrado.
      </p>
    </section>
  )
}

export function AgentDirectoryScopeGate({
  clientId,
  projectId,
  clients,
  projects,
  isLoading,
  error,
  onChange,
  onRetry,
}: {
  clientId: string
  projectId: string
  clients: AgentDirectoryScopeOption[]
  projects: AgentDirectoryProjectOption[]
  isLoading: boolean
  error?: Error
  onChange: (clientId: string, projectId: string) => void
  onRetry: () => void
}) {
  return (
    <PageTransition>
      <main className="mx-auto max-w-[92rem] px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:pb-10">
        <PageHeader
          eyebrow="Operación de agentes"
          title="Equipo de agentes"
          description="Elige una empresa o proyecto visible para consultar únicamente sus perfiles y actividad."
          icon={UserGroupIcon}
        />
        <div className="mt-5 max-w-3xl space-y-3">
          <AgentDirectoryScopeSelectors
            clientId={clientId}
            projectId={projectId}
            clients={clients}
            projects={projects}
            allowAllClients={false}
            disabled={isLoading}
            onChange={onChange}
          />
          {error ? (
            <section role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-ink">No se pudieron cargar las empresas y proyectos visibles.</p>
              <p className="mt-1 text-sm text-ink-muted">El directorio de agentes no se consultó sin un alcance seleccionado.</p>
              <Button outline className="mt-3" onClick={onRetry}>Reintentar</Button>
            </section>
          ) : isLoading ? (
            <p className="rounded-2xl border border-border-subtle bg-surface-raised p-4 text-sm text-ink-muted" role="status">
              Cargando empresas y proyectos autorizados…
            </p>
          ) : clients.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-subtle bg-surface-raised p-4 text-sm text-ink-muted">
              No hay proyectos visibles para seleccionar. El directorio no se consultará fuera de un proyecto autorizado.
            </p>
          ) : (
            <p className="rounded-2xl border border-border-subtle bg-surface-raised p-4 text-sm text-ink-muted" role="status">
              Selecciona una empresa para abrir su directorio. El servidor vuelve a verificar permisos y pertenencia de cada proyecto.
            </p>
          )}
        </div>
      </main>
    </PageTransition>
  )
}

export function AgentDirectoryLoadState({
  error,
  isLoading,
  isRefreshing,
  onRefresh,
}: {
  error?: Error
  isLoading: boolean
  isRefreshing: boolean
  onRefresh: () => void
}) {
  return (
    <PageTransition>
      <main className="mx-auto max-w-[92rem] px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:pb-10">
        <PageHeader
          eyebrow="Operación de agentes"
          title="Equipo de agentes"
          description="Perfiles, equipos conectados y trabajo que cada instancia reporta ahora."
          icon={UserGroupIcon}
        />
        {isLoading ? (
          <section
            className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            role="status"
            aria-live="polite"
            aria-label="Cargando equipo de agentes"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
            ))}
            <div className="h-80 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none sm:col-span-2 xl:col-span-3" />
          </section>
        ) : (
          <section
            className="premium-surface mt-5 flex flex-wrap items-center gap-4 rounded-3xl p-5 sm:p-6"
            role="alert"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
              <UserGroupIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-ink">
                {error ? 'No se pudo cargar el equipo' : 'Esperando al backend de agentes'}
              </h2>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                {error?.message ?? 'No hay una captura de agentes disponible todavía.'}
              </p>
            </div>
            <Button outline onClick={onRefresh} disabled={isRefreshing}>
              <ArrowPathIcon
                data-slot="icon"
                className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}
              />
              Reintentar
            </Button>
          </section>
        )}
      </main>
    </PageTransition>
  )
}
