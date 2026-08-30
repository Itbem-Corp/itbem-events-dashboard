'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageTransition } from '@/components/ui/page-transition'
import { deliveryExecutionGraphBelongsTo, executionGraphEventsFromDelivery, type DeliveryExecutionGraphSnapshot } from '@/features/automation/delivery-execution-graph'
import { hasCancellationRequest, hasUnresolvedOperationFailure, unresolvedFailedTasks } from '@/features/automation/delivery-task-status'
import {
  deliveryLines,
  deliveryPlanPayload,
  deliveryReleasePayload,
} from '@/features/automation/delivery-form-payloads'
import type { DeliveryBrowserQAFormCase } from '@/features/automation/delivery-form-payloads'
import { deliveryWorkItemStreamEnabled, useDeliveryWorkItemStream } from '@/features/automation/use-delivery-work-item-stream'
import { deliveryTraceRefreshInterval } from '@/features/automation/delivery-trace-refresh'
import type { DeliveryReleaseDraft } from '@/features/automation/delivery-result-data'
import type {
  DeliveryAutomationTask,
  DeliveryChangeSet,
  DeliveryPublicationReadiness,
  DeliveryPublicationVerification,
  DeliveryWorkItemBudget,
  DeliveryWorkItem,
} from '@/features/automation/delivery-types'
import { humanTransitionAwaitsAgentResult } from '@/features/automation/delivery-workflow'
import type { ExecutionGraphEvent } from '@/features/automation/execution-graph'
import { api } from '@/lib/api'
import {
	automationHealthPath,
	automationTaskCancelPath,
	automationTaskRetryCodeReviewPath,
  automationTaskResultPath,
  automationTaskTracePath,
  deliveryProjectPublicationReadinessPath,
  deliveryProjectPublicationReadinessVerifyPath,
  deliveryWorkItemAgentRunsPath,
  deliveryWorkItemBudgetPath,
  deliveryWorkItemChangeSetsPath,
  deliveryWorkItemExecutionGraphPath,
  deliveryWorkItemMessagesPath,
  deliveryWorkItemPath,
  deliveryWorkItemPlansPath,
  deliveryWorkItemPromoteAgentPlanPath,
  deliveryWorkItemPublicationGrantRevokePath,
  deliveryWorkItemPublicationGrantsPath,
  deliveryWorkItemReleasePath,
  deliveryWorkItemReleaseReportPath,
  deliveryWorkItemTransitionPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  BoltIcon,
  ArchiveBoxIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ClockIcon,
  ClipboardDocumentCheckIcon,
  XMarkIcon,
  CodeBracketSquareIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

const LiveExecutionMap = dynamic(
  () => import('@/features/automation/live-execution-map').then((module) => module.LiveExecutionMap),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-busy="true"
        aria-label="Preparando mapa de ejecución"
        className="premium-surface mt-5 h-44 overflow-hidden rounded-3xl border border-border-subtle bg-surface-soft/60 p-4 sm:h-48 sm:p-5"
      >
        <div className="h-2.5 w-28 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
        <div className="mt-4 grid h-[calc(100%-1.625rem)] place-items-center">
          <div className="w-32 animate-pulse rounded-xl border border-border-subtle bg-surface-raised px-3 py-3 motion-reduce:animate-none">
            <div className="h-2.5 w-14 rounded-full bg-surface-interactive" />
            <div className="mt-3 h-2 w-20 rounded-full bg-surface-interactive" />
          </div>
        </div>
        <span className="sr-only">El flujo se cargará en un momento.</span>
      </div>
    ),
  },
)

const DeliveryEvidenceGallery = dynamic(
  () => import('@/features/automation/delivery-evidence-gallery').then((module) => module.DeliveryEvidenceGallery),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" aria-label="Preparando evidencia" className="mt-5 h-44 animate-pulse rounded-3xl border border-border-subtle bg-surface-soft motion-reduce:animate-none" />
    ),
  },
)

const DeliveryResultPanel = dynamic(
  () => import('@/features/automation/delivery-result-panel').then((module) => module.DeliveryResultPanel),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" aria-label="Preparando detalle de ejecución" className="mt-4 h-56 animate-pulse rounded-2xl border border-border-subtle bg-surface-soft motion-reduce:animate-none" />
    ),
  },
)

const phaseByState: Record<
  string,
  { phase: 'plan' | 'implementation' | 'publish' | 'qa' | 'summary'; label: string } | undefined
> = {
  planning: { phase: 'plan', label: 'Generar plan' },
  implementation: { phase: 'implementation', label: 'Preparar cambio aislado' },
  preview_pending: { phase: 'publish', label: 'Publicar rama y crear PR' },
  qa_running: { phase: 'qa', label: 'Ejecutar QA' },
  release_review: { phase: 'summary', label: 'Preparar resumen de entrega' },
}
const transitionByState: Record<string, { action: string; label: string; tone?: 'indigo' | 'rose' }[]> = {
  planning: [{ action: 'submit_plan', label: 'Enviar plan a revisión' }],
  plan_review: [
    { action: 'approve_plan', label: 'Aprobar plan' },
    { action: 'request_plan_changes', label: 'Pedir cambios', tone: 'rose' },
  ],
  code_review: [
    { action: 'approve_code_review', label: 'Aprobar código' },
    { action: 'request_code_changes', label: 'Pedir cambios', tone: 'rose' },
  ],
  implementation: [{ action: 'submit_code_review', label: 'Enviar cambio a revisión' }],
  preview_pending: [{ action: 'preview_ready', label: 'Registrar preview' }],
  qa_running: [{ action: 'submit_qa', label: 'Enviar QA a revisión' }],
  qa_review: [
    { action: 'approve_qa', label: 'Aprobar QA' },
    { action: 'request_qa_changes', label: 'Regresar a implementación', tone: 'rose' },
  ],
  release_review: [{ action: 'approve_release', label: 'Aprobar entrega' }],
}
const stateLabel: Record<string, string> = {
  planning: 'Planificación',
  plan_review: 'Plan listo para revisión',
  implementation: 'Implementación aislada',
  code_review: 'Código listo para revisión',
  preview_pending: 'Esperando preview',
  qa_running: 'QA en curso',
  qa_review: 'QA lista para revisión',
  release_review: 'Entrega lista para decisión',
  released: 'Entregada',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
}
const gateLabel: Record<string, string> = {
  plan: 'Plan',
  code_review: 'Código',
  qa_review: 'QA',
  release: 'Entrega',
}

function gateDecisionCopy(action: string) {
  const requestingChanges = action.includes('request_')
  if (action.includes('plan')) return requestingChanges
    ? { note: 'Qué debe ajustar el agente', evidence: 'Qué revisaste', placeholder: 'Indica el cambio concreto que necesita el plan.', quickConfirmation: undefined }
    : { note: 'Por qué apruebas el plan', evidence: 'Qué comprobaste', placeholder: 'Resume por qué el alcance y los riesgos están listos.', quickConfirmation: 'Alcance, riesgos y validaciones revisados; aprobados para continuar.' }
  if (action.includes('code')) return requestingChanges
    ? { note: 'Qué debe corregirse', evidence: 'Qué revisaste', placeholder: 'Indica el cambio concreto que necesita la implementación.', quickConfirmation: undefined }
    : { note: 'Por qué apruebas el código', evidence: 'Qué comprobaste', placeholder: 'Resume por qué el cambio puede pasar a QA.', quickConfirmation: 'Cambio y validaciones revisados; aprobados para continuar a QA.' }
  if (action.includes('qa')) return requestingChanges
    ? { note: 'Qué debe corregirse', evidence: 'Qué revisaste', placeholder: 'Indica el resultado de QA que necesita corrección.', quickConfirmation: undefined }
    : { note: 'Por qué apruebas QA', evidence: 'Qué comprobaste', placeholder: 'Resume por qué el resultado está listo para entrega.', quickConfirmation: 'Resultado de QA y evidencia revisados; aprobado para preparar la entrega.' }
  return { note: 'Confirmación de entrega', evidence: 'Qué comprobaste', placeholder: 'Resume por qué esta entrega puede liberarse.', quickConfirmation: 'Entrega, evidencia y forma de validación revisadas; autorizada para liberarse.' }
}

function nextAgentMoveAfterGate(action: string) {
  if (action === 'approve_plan') return 'El agente iniciará la implementación aislada.'
  if (action === 'request_plan_changes') return 'El agente preparará una nueva propuesta con tus observaciones.'
  if (action === 'approve_code_review') return 'El agente continuará con el preview y las validaciones.'
  if (action === 'request_code_changes') return 'El agente regresará a la implementación con tus observaciones.'
  if (action === 'approve_qa') return 'El agente preparará el resumen de entrega.'
  if (action === 'request_qa_changes') return 'El agente regresará a la implementación con tus observaciones de QA.'
  if (action === 'approve_release') return 'La entrega queda liberada y el historial seguirá disponible.'
  return 'El agente actualizará el siguiente paso disponible.'
}
type DeliveryConsoleView = 'overview' | 'activity' | 'evidence' | 'control'
const stageByState: Record<string, number> = {
  planning: 0,
  plan_review: 1,
  implementation: 2,
  code_review: 3,
  preview_pending: 4,
  qa_running: 4,
  qa_review: 4,
  release_review: 5,
  released: 6,
}
const humanGateActions = new Set([
  'approve_plan',
  'request_plan_changes',
  'approve_code_review',
  'request_code_changes',
  'approve_qa',
  'request_qa_changes',
  'approve_release',
])

type WorkspacePreflight = {
  id: string
  ready: boolean
  qa_ready: boolean
  visual_qa_ready: boolean
}

type AutomationRuntimeHealth = {
  workers?: Array<{ workspace_readiness?: WorkspacePreflight[] }>
}

function date(value?: string) {
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Pendiente'
}

function activityTime(value?: string) {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return 'pendiente'
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'ahora'
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `hace ${elapsedHours} h`
  return date(value)
}
function textList(value?: string) {
  try {
    const parsed = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
function publicationCapabilities(value?: string) {
  const parsed = textList(value)
  return parsed.length ? parsed : ['Sin capacidades registradas']
}
function metadataRecord(value?: Record<string, unknown> | string) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
type RepositoryImpact = {
  name: string
  reference: string
  revision: string
  role: 'primary' | 'supporting'
  impact: 'changes' | 'consulted' | 'untouched'
  notes: string
}

function repositoryImpacts(value?: string): RepositoryImpact[] {
  try {
    const parsed = JSON.parse(value ?? '{}') as Record<string, unknown>
    const entries = parsed.repository_impact
    if (!Array.isArray(entries)) return []
    return entries.filter((entry): entry is RepositoryImpact => {
      if (!entry || typeof entry !== 'object') return false
      const candidate = entry as Partial<RepositoryImpact>
      return (
        typeof candidate.name === 'string' &&
        typeof candidate.reference === 'string' &&
        typeof candidate.revision === 'string' &&
        (candidate.role === 'primary' || candidate.role === 'supporting') &&
        (candidate.impact === 'changes' || candidate.impact === 'consulted' || candidate.impact === 'untouched') &&
        typeof candidate.notes === 'string'
      )
    })
  } catch {
    return []
  }
}

function hasPassedReview(change: DeliveryChangeSet | undefined) {
  if (!change || change.ci_status !== 'passed') return false
  return (
    change.review_type === 'local_worktree' ||
    (change.review_type === 'pull_request' && Boolean(change.pull_request_url))
  )
}

function publishedByGitHubApp(change: DeliveryChangeSet | undefined) {
  if (!change || change.review_type !== 'pull_request' || !change.branch?.startsWith('itbem-agent/')) return false
  const metadata = metadataRecord(change.metadata)
  return metadata.branch_published === true && metadata.verification_source === 'itbem-github-app'
}

function hasValidPreview(change: DeliveryChangeSet | undefined) {
  return Boolean(change?.preview_url && /^https?:\/\/\S+$/i.test(change.preview_url))
}
function planDetails(value?: string | Record<string, unknown>) {
  try {
    const parsed = typeof value === 'object' && value !== null
      ? value
      : JSON.parse(value ?? '{}') as Record<string, unknown>
    const lines = (key: string) =>
      Array.isArray(parsed[key])
        ? parsed[key].filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        : []
    return {
      goal: typeof parsed.goal_interpretation === 'string' ? parsed.goal_interpretation : '',
      autonomy: typeof parsed.autonomy_boundary === 'string' ? parsed.autonomy_boundary : '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      gaps: lines('context_gaps'),
      decisions: lines('human_decisions'),
      steps: lines('implementation_steps'),
      qa: lines('qa_plan'),
      evidence: lines('evidence_plan'),
      files: lines('files_impacted'),
      rollback: lines('rollback_plan'),
      browserQaMode:
        parsed.browser_qa_mode === 'approved_test_flow'
          ? ('approved_test_flow' as const)
          : parsed.browser_qa_mode === 'approved_navigation'
            ? ('approved_navigation' as const)
            : ('read_only' as const),
      browserQaCases: Array.isArray(parsed.browser_qa_cases)
        ? parsed.browser_qa_cases.filter(
            (entry): entry is { id: string; title: string; steps: Array<{ kind: string }> } =>
              Boolean(entry) &&
              typeof entry === 'object' &&
              typeof (entry as { id?: unknown }).id === 'string' &&
              typeof (entry as { title?: unknown }).title === 'string' &&
              Array.isArray((entry as { steps?: unknown }).steps)
          )
        : [],
      stagehandRequired: Array.isArray(parsed.qa_execution_matrix) && parsed.qa_execution_matrix.some(
        (entry) => Boolean(entry) && typeof entry === 'object' && (entry as { run_stagehand?: unknown }).run_stagehand === true
      ),
    }
  } catch {
    return {
      goal: '',
      autonomy: '',
      confidence: null,
      gaps: [],
      decisions: [],
      steps: [],
      qa: [],
      evidence: [],
      files: [],
      rollback: [],
      browserQaMode: 'read_only' as const,
      browserQaCases: [],
      stagehandRequired: false,
    }
  }
}
function frozenClientContext(value?: string) {
  try {
    const parsed = JSON.parse(value ?? '{}') as Record<string, unknown>
    return {
      health: typeof parsed.health === 'string' ? parsed.health : '',
      rules: Array.isArray(parsed.rules)
        ? parsed.rules.filter((entry): entry is string => typeof entry === 'string')
        : [],
      conversationSummary: typeof parsed.conversation_summary === 'string' ? parsed.conversation_summary : '',
      updatedAt: typeof parsed.profile_updated_at === 'string' ? parsed.profile_updated_at : '',
    }
  } catch {
    return { health: '', rules: [], conversationSummary: '', updatedAt: '' }
  }
}
function taskBadge(task: DeliveryAutomationTask) {
  return task.status === 'completed'
    ? 'emerald'
    : task.status === 'failed' || task.status === 'dispatch_failed'
      ? 'rose'
      : task.status === 'cancelled' || task.status === 'cancel_requested'
        ? 'zinc'
      : task.status === 'running'
        ? 'sky'
        : 'amber'
}

type AutomationExecution = {
  id: string
  step_key: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  total_tokens: number
  input_cost_microusd: number
  output_cost_microusd: number
  cached_cost_microusd: number
  cache_write_cost_microusd: number
  total_cost_microusd: number
  pricing_basis: string
  provider_outcome?: {
    finish_reason?: string
    input_sensitive?: boolean
    output_sensitive?: boolean
    status_code?: number
  }
  completed_at?: string
}

type AutomationToolExecution = AutomationExecution & {
  tool: string
  call_key?: string
  call_status?: 'completed' | 'failed'
  created_at?: string
}

type AutomationTrace = {
  executions: AutomationExecution[] | null
  tool_executions: AutomationToolExecution[] | null
  entries?: TraceEntry[] | null
}

type TraceEntry = AutomationExecution & {
  execution_kind: 'agent' | 'tool'
  tool?: string
  call_key?: string
  call_status?: 'completed' | 'failed'
}
type GateReadiness = { label: string; detail: string; ready: boolean }

function cost(value = 0) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(
    value / 1_000_000
  )
}

function providerFailureGuidance(task: DeliveryAutomationTask) {
  if (task.status !== 'failed' || !/provider request rejected \(401\)/i.test(task.error_message ?? '')) {
    return null
  }
  return {
    title: 'No se pudo verificar la credencial del proveedor',
    detail:
      'La ejecución se detuvo y no avanzó ningún gate. Revisa la credencial del entorno activo, su acceso a la API y los créditos o permisos de la cuenta antes de generar un nuevo plan.',
  }
}

type PipelineStage = {
  label: string
  shortLabel: string
  operation?: string
  completeAt: number
  activeAt: number
}

const pipelineStages: PipelineStage[] = [
  { label: 'Plan de cambio', shortLabel: 'Plan', operation: 'delivery.plan', completeAt: 1, activeAt: 0 },
  { label: 'Gate de plan', shortLabel: 'Validar', completeAt: 2, activeAt: 1 },
  { label: 'Worktree aislado', shortLabel: 'Construir', operation: 'delivery.implementation', completeAt: 3, activeAt: 2 },
  { label: 'Gate de código', shortLabel: 'Revisar', completeAt: 4, activeAt: 3 },
  { label: 'Preview y QA', shortLabel: 'Verificar', operation: 'delivery.qa', completeAt: 5, activeAt: 4 },
  { label: 'Entrega', shortLabel: 'Entregar', operation: 'delivery.summary', completeAt: 6, activeAt: 5 },
]

function isActiveTask(task: DeliveryAutomationTask) {
  return task.status === 'queued' || task.status === 'running'
}

function operationLabel(operation?: string) {
  const labels: Record<string, string> = {
    'delivery.plan': 'Analizando contexto y preparando el plan',
    'delivery.implementation': 'Preparando cambio aislado',
    'delivery.qa': 'Ejecutando validaciones y evidencia',
    'delivery.summary': 'Redactando resumen de entrega',
    'delivery.publish': 'Publicando rama revisada',
  }
  return labels[operation ?? ''] ?? 'Sincronizando la ejecución'
}

function DeliveryPipeline({
  item,
  stage,
  isRefreshing,
  isPlanProposalReady,
  streamStatus,
  onOpenActivity,
  onOpenControl,
  onRefresh,
}: {
  item: DeliveryWorkItem
  stage: number
  isRefreshing: boolean
  isPlanProposalReady: boolean
  streamStatus?: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'
  onOpenActivity: (taskId?: string) => void
  onOpenControl: () => void
  onRefresh?: () => void
}) {
  const tasks = item.automation_tasks ?? []
  const activeTask = [...tasks]
    .filter(isActiveTask)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]
  const latestTask = [...tasks]
    .sort((left, right) => Date.parse(right.completed_at ?? right.created_at) - Date.parse(left.completed_at ?? left.created_at))[0]
  const latestFailedTask = unresolvedFailedTasks(tasks)
    .sort((left, right) => Date.parse(right.completed_at ?? right.created_at) - Date.parse(left.completed_at ?? left.created_at))[0]
  const cancellingTask = hasCancellationRequest(tasks)
    ? [...tasks]
      .filter((task) => task.status === 'cancel_requested')
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]
    : undefined
  const live = Boolean(activeTask) && !cancellingTask
  const needsAttention = Boolean(latestFailedTask) && !cancellingTask
  // A cancelled execution is a neutral record. Only the work-item state can
  // close the delivery flow itself; later/retried work may still continue.
  const cancelled = item.state === 'cancelled'
  const awaitingDecision = ['plan_review', 'code_review', 'qa_review', 'release_review'].includes(item.state)
  const providerNeedsMaintenance = /provider request rejected \(401\)/i.test(latestFailedTask?.error_message ?? '')
  const streamLimited = streamStatus === 'offline' || streamStatus === 'error'
  const streamReconnecting = streamStatus === 'connecting' || streamStatus === 'reconnecting'
  const statusCopy = isPlanProposalReady
    ? 'Propuesta preparada'
    : cancellingTask
      ? 'Deteniendo ejecución'
    : activeTask
    ? operationLabel(activeTask.operation)
    : needsAttention
      ? providerNeedsMaintenance
        ? 'Mantenimiento del proveedor'
        : 'Atención requerida'
    : cancelled
      ? 'Flujo cancelado'
    : item.state === 'released'
      ? 'Entrega lista'
    : awaitingDecision
        ? 'Decisión requerida'
      : stage > 0
        ? `${pipelineStages[stage]?.label ?? 'Siguiente etapa'} en preparación`
        : 'Plan listo para iniciar'
  const statusDetail = isPlanProposalReady
    ? 'La propuesta queda preparada para que el siguiente gate la verifique.'
    : cancellingTask
      ? 'La solicitud fue recibida; el historial se conserva mientras la tarea se cierra.'
    : activeTask
    ? streamLimited
      ? 'El agente puede seguir avanzando; actualiza para recuperar el pulso en vivo.'
      : streamReconnecting
        ? 'Conservamos el último movimiento mientras el canal en vivo se reconecta.'
        : 'El agente avanza y sincroniza el siguiente estado automáticamente.'
    : providerNeedsMaintenance
      ? 'El agente detuvo los reintentos para evitar costes sin una credencial válida.'
      : needsAttention
          ? 'Revisa la incidencia para que el flujo pueda continuar.'
          : awaitingDecision
            ? `Tu confirmación desbloquea ${stateLabel[item.state] ?? 'el siguiente gate'}.`
            : cancelled
              ? 'La evidencia y el historial siguen disponibles.'
              : item.state === 'released'
                ? 'La evidencia, gates y resultados quedan vinculados a esta entrega.'
                : 'El flujo preparará la siguiente etapa por su cuenta.'
  const lastActivity = activeTask?.created_at ?? latestFailedTask?.completed_at ?? latestFailedTask?.created_at ?? latestTask?.completed_at ?? latestTask?.created_at ?? item.updated_at

  return (
    <section aria-label="Pipeline de entrega en vivo" className="premium-surface relative mt-6 overflow-hidden rounded-[1.75rem]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-(--tenant-accent) to-transparent" />
      {live && <div aria-hidden="true" className="delivery-signal pointer-events-none absolute inset-x-16 top-0 h-px bg-linear-to-r from-transparent via-(--tenant-accent) to-transparent" />}
      <div className="p-5 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`flex size-8 items-center justify-center rounded-xl ${live ? 'bg-(--tenant-accent) text-white shadow-lg shadow-(--tenant-accent)/20' : isPlanProposalReady ? 'bg-(--tenant-accent)/10 text-(--tenant-accent)' : needsAttention ? 'bg-rose-500/10 text-rose-700' : cancellingTask || cancelled ? 'bg-surface-interactive text-ink-secondary' : awaitingDecision ? 'bg-amber-500/10 text-amber-700' : 'bg-surface-interactive text-(--tenant-accent)'}`}>
              {live ? <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" /> : isPlanProposalReady ? <ClipboardDocumentCheckIcon className="size-4" /> : needsAttention ? '!' : cancellingTask || cancelled ? <StopIcon className="size-4" /> : awaitingDecision ? <ClipboardDocumentCheckIcon className="size-4" /> : <BoltIcon className="size-4" />}
            </span>
            <p className="text-xs font-bold tracking-[0.16em] text-ink-muted uppercase">Ejecución</p>
            {streamLimited && onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/[.05] px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-500/[.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/35 dark:text-rose-300"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-rose-500" />
                Señal limitada · actualizar
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">
                <span className={`size-1.5 rounded-full ${streamReconnecting ? 'animate-pulse motion-reduce:animate-none bg-amber-500' : live ? 'animate-pulse motion-reduce:animate-none bg-emerald-500' : needsAttention ? 'bg-rose-500' : cancellingTask || cancelled ? 'bg-ink-muted/50' : awaitingDecision ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {streamReconnecting ? 'Reconectando' : live ? 'En vivo' : isPlanProposalReady ? 'Listo para revisar' : providerNeedsMaintenance ? 'Mantenimiento requerido' : needsAttention ? 'Atención requerida' : cancellingTask ? 'Deteniéndose' : awaitingDecision ? 'Decisión requerida' : cancelled ? 'Cancelado' : 'Actualizado'}
              </span>
            )}
            {isRefreshing && <span role="status" className="sr-only">Actualizando el estado del agente.</span>}
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">{statusCopy}</h2>
          <p className="mt-1.5 flex flex-wrap items-start gap-x-1.5 gap-y-0.5 text-sm text-ink-muted">
            <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 sm:flex-none">{statusDetail}</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <time dateTime={lastActivity} title={date(lastActivity)} className="w-full text-xs text-ink-muted sm:w-auto sm:text-sm">Actualizado {activityTime(lastActivity)}</time>
          </p>
          {needsAttention && (
            <button
              type="button"
              onClick={() => onOpenActivity(latestFailedTask?.id)}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/[.05] px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/[.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/35 dark:text-rose-300"
            >
              Revisar incidencia
              <ArrowRightIcon className="size-3.5" />
            </button>
          )}
          {awaitingDecision && (
            <button
              type="button"
              onClick={onOpenControl}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[.06] px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-500/[.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35 dark:text-amber-300"
            >
              Abrir decisión
              <ArrowRightIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="relative border-t border-border-subtle bg-surface-soft/55 px-3 py-4 sm:px-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-linear-to-l from-surface-soft/95 to-transparent sm:hidden" />
        <ol aria-label="Etapas de entrega. Desliza para ver las siguientes etapas." className="flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1 pr-7 scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto sm:grid sm:grid-cols-6 sm:gap-x-2 sm:overflow-visible sm:px-0 sm:pb-0 sm:pr-0">
          {pipelineStages.map((pipelineStage, index) => {
            const task = pipelineStage.operation ? [...tasks]
              .filter((entry) => entry.operation === pipelineStage.operation && isActiveTask(entry))
              .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] : undefined
            const recordedTask = pipelineStage.operation ? [...tasks]
              .filter((entry) => entry.operation === pipelineStage.operation)
              .sort((left, right) => Date.parse(right.completed_at ?? right.created_at) - Date.parse(left.completed_at ?? left.created_at))[0] : undefined
            const failed = pipelineStage.operation ? hasUnresolvedOperationFailure(tasks, pipelineStage.operation) : false
            const complete = !cancelled && stage >= pipelineStage.completeAt
            const current = !cancelled && stage === pipelineStage.activeAt
            const human = awaitingDecision && current
            // A failed run pauses the autonomous path. Do not leave a later
            // stage glowing as active while the operator is being asked to
            // resolve an incident in an earlier execution.
            const attentionStage = needsAttention && (failed || current)
            const active = !cancelled && !cancellingTask && !human && !attentionStage && (Boolean(task) || (current && !failed))
            const interactive = Boolean(recordedTask)
            const stepClassName = `relative flex w-20 shrink-0 snap-center flex-col items-center text-center sm:w-auto sm:shrink ${interactive ? 'cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)' : ''}`
            const stepContent = <>
              {index < pipelineStages.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute top-4 left-[calc(50%+1.35rem)] block h-px w-[calc(100%-2.7rem)] ${
                    complete ? 'bg-emerald-500/55' : attentionStage ? 'bg-rose-500/45' : active ? 'delivery-rail' : human ? 'bg-amber-500/45' : 'bg-border-subtle'
                  }`}
                />
              )}
              <span className={`relative z-10 flex size-8 items-center justify-center rounded-full border text-xs font-bold transition motion-reduce:transition-none motion-reduce:[animation:none] ${attentionStage ? 'border-rose-500/40 bg-rose-500/10 text-rose-700' : complete ? 'border-emerald-500 bg-emerald-500 text-white' : human ? 'border-amber-500 bg-amber-500/10 text-amber-700' : active ? 'delivery-orbit border-(--tenant-accent) bg-(--tenant-accent) text-white ring-4 ring-(--tenant-accent)/15' : 'border-border-subtle bg-surface-raised text-ink-muted'}`}>
                {complete ? <CheckCircleIcon className="size-4" /> : attentionStage ? '!' : human ? <ClipboardDocumentCheckIcon className="size-3.5" /> : active ? <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : index + 1}
              </span>
              <span className={`mt-2 text-[11px] font-semibold ${attentionStage ? 'text-rose-700 dark:text-rose-300' : active ? 'text-ink' : complete ? 'text-emerald-700 dark:text-emerald-300' : human ? 'text-amber-700 dark:text-amber-300' : 'text-ink-muted'}`}>{pipelineStage.shortLabel}</span>
              <span className="mt-0.5 hidden text-[10px] leading-4 text-ink-muted sm:block">{pipelineStage.label}</span>
            </>
            return (
              <li
                key={pipelineStage.label}
                aria-current={current ? 'step' : undefined}
                className="relative w-20 shrink-0 snap-center sm:w-auto sm:shrink"
              >
                {interactive ? <button type="button" title={`Abrir ejecución de ${pipelineStage.label}`} aria-label={`Abrir ejecución de ${pipelineStage.label}`} onClick={() => onOpenActivity(recordedTask?.id)} className={stepClassName}>{stepContent}</button> : <div className={stepClassName}>{stepContent}</div>}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

type DeliveryRunEvent = {
  id: string
  at: string
  title: string
  detail: string
  nodeLabel: string
  tone: 'active' | 'queued' | 'complete' | 'human' | 'attention' | 'cancelling' | 'cancelled'
  attempts?: number
  trackKey: string
  taskId?: string
}

function deliveryRunEvents(item: DeliveryWorkItem): DeliveryRunEvent[] {
  const taskEvents = (item.automation_tasks ?? []).map((task) => ({
    id: `task-${task.id}`,
    taskId: task.id,
    at: task.completed_at ?? task.created_at,
    title: task.status === 'completed' ? `${operationLabel(task.operation)} completado` : operationLabel(task.operation),
    nodeLabel: pipelineStages.find((stage) => stage.operation === task.operation)?.shortLabel ?? 'Agente',
    trackKey: task.operation,
    detail:
      task.status === 'running'
        ? 'El agente está trabajando sobre esta etapa.'
        : task.status === 'queued'
          ? 'En cola; empezará automáticamente cuando el agente pueda continuar.'
          : task.status === 'completed'
            ? 'Resultado y evidencia disponibles para revisión.'
            : task.status === 'cancel_requested'
              ? 'Solicitud recibida; el agente cerrará este paso de forma segura.'
            : task.status === 'cancelled'
              ? 'La ejecución se detuvo; no se iniciarán pasos nuevos.'
            : 'Necesita atención. El diagnóstico completo está disponible en Ejecuciones.',
    tone:
      task.status === 'running'
        ? ('active' as const)
        : task.status === 'queued'
          ? ('queued' as const)
          : task.status === 'completed'
          ? ('complete' as const)
          : task.status === 'cancel_requested'
            ? ('cancelling' as const)
          : task.status === 'cancelled'
            ? ('cancelled' as const)
          : ('attention' as const),
  }))
  const gateEvents = (item.gates ?? []).map((gate) => ({
    id: `gate-${gate.id}`,
    at: gate.decided_at,
    title: `${gateLabel[gate.kind] ?? gate.kind}: ${gate.decision === 'approved' ? 'aprobado' : 'requiere cambios'}`,
    nodeLabel: 'Gate',
    trackKey: `gate-${gate.kind}`,
    detail: gate.comment || 'Decisión humana registrada en el flujo.',
    tone: gate.decision === 'approved' ? ('human' as const) : ('attention' as const),
  }))
  const pendingGate = {
    plan_review: { kind: 'plan', label: 'Plan' },
    code_review: { kind: 'code_review', label: 'Código' },
    qa_review: { kind: 'qa_review', label: 'QA' },
    release_review: { kind: 'release', label: 'Entrega' },
  }[item.state]
  // The read model only includes decided gates. While an approval is pending,
  // preserve that human pause in the fallback graph instead of pretending the
  // agent is idle or fabricating a technical execution.
  const pendingGateEvent = pendingGate ? [{
    id: `pending-gate-${item.id}-${pendingGate.kind}`,
    at: item.updated_at,
    title: `${pendingGate.label}: decisión requerida`,
    nodeLabel: 'Gate',
    trackKey: `gate-${pendingGate.kind}`,
    detail: 'El agente espera una confirmación antes de abrir la siguiente etapa.',
    tone: 'human' as const,
  }] : []
  const evidenceEvents = (item.evidence ?? []).map((evidence) => ({
    id: `evidence-${evidence.id}`,
    at: evidence.captured_at ?? '',
    title: `Evidencia lista: ${evidence.title}`,
    nodeLabel: 'Evidencia',
    trackKey: `evidence-${evidence.phase}`,
    detail: `${evidence.kind.replace('_', ' ')} · fase ${evidence.phase}`,
    tone: 'complete' as const,
  }))
  const messageEvents = (item.messages ?? []).map((message) => ({
    id: `message-${message.id}`,
    at: message.created_at,
    title: message.author_type === 'agent' ? 'Actualización del agente' : 'Nota del equipo',
    nodeLabel: message.author_type === 'agent' ? 'Agente' : 'Equipo',
    trackKey: message.author_type === 'agent' ? 'agent-updates' : 'team-notes',
    detail: message.body,
    tone: message.author_type === 'agent' ? ('active' as const) : ('human' as const),
  }))
  const chronologicalEvents = [...taskEvents, ...gateEvents, ...pendingGateEvent, ...evidenceEvents, ...messageEvents]
    .filter((event) => Boolean(event.at))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))

  return chronologicalEvents.reduce<DeliveryRunEvent[]>((events, event) => {
    const previous = events.at(-1)
    if (previous && previous.trackKey === event.trackKey && previous.nodeLabel === event.nodeLabel && previous.title === event.title && previous.tone === event.tone) {
      previous.attempts = (previous.attempts ?? 1) + 1
      return events
    }
    events.push({ ...event, attempts: 1 })
    return events
  }, []).slice(0, 60)
}

function DeliveryRunActivity({ item, graphEvents, streamStatus, onOpenActivity, onInspectTask, onCancelTask, onRefresh }: { item: DeliveryWorkItem; graphEvents?: ExecutionGraphEvent[]; streamStatus?: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error'; onOpenActivity: () => void; onInspectTask: (taskId: string) => void; onCancelTask: (taskId: string) => void; onRefresh?: () => void }) {
  // The compact fallback timeline is derived from the full work-item payload.
  // Keep it stable while the operator changes tabs, opens an inspector, or the
  // stream pulse changes; on long flows that avoids rebuilding the historical
  // list unless the authoritative task snapshot actually changes.
  const events = useMemo(() => deliveryRunEvents(item), [item])
  return <LiveExecutionMap events={events} graphEvents={graphEvents} streamStatus={streamStatus} onOpenActivity={onOpenActivity} onInspectTask={onInspectTask} onCancelTask={onCancelTask} onRefresh={onRefresh} />
}

function AutomationTaskRow({
  task,
  busy,
  onInspect,
  onCancel,
  onRetryCodeReview,
  isCurrentFailure = true,
  selected = false,
}: {
  task: DeliveryAutomationTask
  busy: string
  onInspect: (task: DeliveryAutomationTask) => void
  onCancel: (task: DeliveryAutomationTask) => void
  onRetryCodeReview: (task: DeliveryAutomationTask) => void
  isCurrentFailure?: boolean
  selected?: boolean
}) {
  const active = task.status === 'running' || task.status === 'queued'
  const complete = task.status === 'completed'
  const failedAttempt = task.status === 'failed' || task.status === 'dispatch_failed'
  const needsAttention = failedAttempt && isCurrentFailure
  const replacedAttempt = failedAttempt && !isCurrentFailure
  const cancelled = task.status === 'cancelled'
  const cancelling = task.status === 'cancel_requested'
  const providerNeedsMaintenance = /provider request rejected \(401\)/i.test(task.error_message ?? '')
  const canRetryCodeReview = task.operation === 'code.review' && task.status === 'failed'
  const failureGuidance = needsAttention ? providerFailureGuidance(task) : null
  const statusLabel = complete
    ? 'Completado'
    : active
      ? task.status === 'queued'
        ? 'En cola'
        : 'En ejecución'
      : needsAttention
        ? 'Requiere atención'
        : replacedAttempt
          ? 'Reemplazada'
        : cancelling
          ? 'Deteniéndose'
        : cancelled
          ? 'Cancelada'
        : task.status
  return (
    <li aria-current={selected ? 'true' : undefined} className={`group flex flex-col gap-3 px-4 py-4 transition-all duration-200 motion-reduce:transition-none sm:flex-row sm:gap-4 sm:px-6 ${selected ? 'bg-(--tenant-accent)/[.055] shadow-[inset_3px_0_0_var(--tenant-accent)]' : 'hover:bg-surface-soft/75'}`}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none ${complete ? 'bg-emerald-500/10 text-emerald-700' : active ? 'bg-(--tenant-accent)/10 text-(--tenant-accent)' : needsAttention ? 'bg-rose-500/10 text-rose-700' : 'bg-surface-interactive text-ink-secondary'}`}>
        {complete ? <CheckCircleIcon className="size-5" /> : active ? <ArrowPathIcon className="size-5 animate-spin motion-reduce:animate-none" /> : <CodeBracketSquareIcon className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{operationLabel(task.operation)}</p>
          <Badge color={taskBadge(task)}>{statusLabel}</Badge>
          {selected && <span className="rounded-full bg-(--tenant-accent)/10 px-2 py-0.5 text-[10px] font-bold text-(--tenant-accent)">Abierta</span>}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {task.model
            ? `${task.provider} · ${task.model}`
            : task.operation === 'delivery.publish'
              ? 'Operación determinista · sin llamada a IA'
              : cancelling
                ? 'Solicitud recibida · esperando detención segura'
              : cancelled
                ? 'Ejecución detenida · sin pasos nuevos'
              : providerNeedsMaintenance
                ? 'Configuración del proveedor requiere atención'
                : replacedAttempt
                  ? 'Un intento posterior reemplazó este resultado'
                : needsAttention
                  ? 'Ejecución detenida · diagnóstico disponible'
              : 'Esperando proveedor'}{' '}
          · <time dateTime={task.completed_at ?? task.created_at} title={date(task.completed_at ?? task.created_at)}>{activityTime(task.completed_at ?? task.created_at)}</time>
        </p>
        {needsAttention && (
          <div className="mt-2.5 flex gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2.5">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-rose-500" />
            <p className="min-w-0 text-xs leading-5 text-rose-800">
              <span className="block font-semibold">
                {failureGuidance?.title ?? 'El agente detuvo este intento'}
              </span>
              <span className="mt-0.5 block text-rose-800/80">
                {failureGuidance?.detail ?? 'No se avanzó ningún gate. Revisa el intento antes de decidir si el flujo debe continuar o necesita más contexto.'}
              </span>
            </p>
          </div>
        )}
      </div>
      <div className="flex w-full shrink-0 items-start gap-2 sm:w-auto">
        {(task.status === 'completed' || failedAttempt || (task.status === 'cancelled' && task.output_ref)) && (
          <Button outline onClick={() => onInspect(task)} className="flex-1 sm:flex-none">
            {task.status === 'completed' ? 'Resultado' : failedAttempt ? 'Revisar' : 'Detalle'}
          </Button>
        )}
        {(task.status === 'queued' || task.status === 'running') && (
          <Button outline onClick={() => onCancel(task)} disabled={busy === `cancel-${task.id}`} className="flex-1 text-rose-700 sm:flex-none">
            {busy === `cancel-${task.id}` ? 'Deteniendo…' : 'Cancelar'}
          </Button>
        )}
        {canRetryCodeReview && (
          <Button outline onClick={() => onRetryCodeReview(task)} disabled={busy === `retry-review-${task.id}`} className="flex-1 sm:flex-none">
            {busy === `retry-review-${task.id}` ? 'Reintentando…' : 'Reintentar revisión'}
          </Button>
        )}
      </div>
    </li>
  )
}

export default function DeliveryWorkItemPage() {
  const [publicationTime] = useState(() => Date.now())
  const params = useParams<{ workItemId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedConsoleView = searchParams.get('view')
  const [consoleView, setConsoleView] = useState<DeliveryConsoleView>(() => {
    return requestedConsoleView === 'activity' || requestedConsoleView === 'evidence' || requestedConsoleView === 'control'
      ? requestedConsoleView
      : 'overview'
  })
  const [usageOpen, setUsageOpen] = useState(false)
  const consolePanelRef = useRef<HTMLDivElement | null>(null)
  const usagePanelRef = useRef<HTMLDetailsElement | null>(null)
  const workItem = useSWR<DeliveryWorkItem>(
    params.workItemId ? deliveryWorkItemPath(params.workItemId) : null,
    fetcher,
    {
      // The authorized stream below now covers every console surface. Keep a
      // single relaxed recovery cadence rather than speeding up background
      // reads whenever someone opens a technical detail.
      refreshInterval: 60_000,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      revalidateIfStale: true,
      keepPreviousData: true,
      dedupingInterval: 2000,
    }
  )
  const item = workItem.data
  const executionGraph = useSWR<DeliveryExecutionGraphSnapshot>(
    // The graph is only rendered in Live Steps. Avoid fetching its specialized
    // snapshot while the operator is reviewing evidence, executions or gates;
    // the stream will request a fresh snapshot as soon as Live Steps returns.
    params.workItemId && consoleView === 'overview' ? deliveryWorkItemExecutionGraphPath(params.workItemId) : null,
    fetcher,
    {
      // The stream invalidates this snapshot as soon as the agent moves. This
      // deliberately slow fallback only heals a suspended browser stream.
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      revalidateIfStale: true,
      refreshWhenHidden: false,
      keepPreviousData: true,
      dedupingInterval: 2_000,
    },
  )
  const graphStream = useDeliveryWorkItemStream(params.workItemId, {
    // Keep one subscription for the task across every console surface. An
    // operator can inspect evidence or a decision while the agent advances;
    // returning to Live Steps should not require a new connection or wait for
    // the slower polling fallback to learn that state.
    // A terminal result has immutable execution state. Closing its SSE stream
    // avoids an idle database read every few seconds while keeping the normal
    // focus revalidation path for someone reopening the detail later.
    enabled: deliveryWorkItemStreamEnabled(params.workItemId, item?.state),
    onSnapshot: () => {
      void workItem.mutate()
      if (consoleView === 'overview') void executionGraph.mutate()
      if (selectedResultIsActive) void trace.mutate()
    },
    onUpdate: () => {
      void workItem.mutate()
      if (consoleView === 'overview') void executionGraph.mutate()
      if (selectedResultIsActive) void trace.mutate()
    },
  })
  const executionGraphEvents = useMemo(
    () => deliveryExecutionGraphBelongsTo(executionGraph.data, item?.id) && executionGraph.data ? executionGraphEventsFromDelivery(executionGraph.data) : undefined,
    [executionGraph.data, item?.id],
  )
  const taskBudget = useSWR<DeliveryWorkItemBudget>(
    // Cost guardrails are maintenance data. Defer the request until the
    // compact "Uso del agente" disclosure is actually opened so live
    // execution inspection remains the fast path.
    params.workItemId && consoleView === 'activity' && usageOpen ? deliveryWorkItemBudgetPath(params.workItemId) : null,
    fetcher,
    {
      refreshInterval: 30_000,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      revalidateIfStale: true,
      keepPreviousData: true,
    }
  )
  const runtime = useSWR<AutomationRuntimeHealth>(
    consoleView === 'control' ? automationHealthPath() : null,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  )
  const [instructions, setInstructions] = useState('')
  const [newProposalOpen, setNewProposalOpen] = useState(false)
  const [phaseContextOpen, setPhaseContextOpen] = useState(false)
  const [selectedGateAction, setSelectedGateAction] = useState('')
  const [comment, setComment] = useState('')
  const [evidenceChecklist, setEvidenceChecklist] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [selectedResult, setSelectedResult] = useState('')
  const [selectedExecution, setSelectedExecution] = useState('')
  const [selectedExecutionKind, setSelectedExecutionKind] = useState<'agent' | 'tool'>('agent')
  const selectedResultPanelRef = useRef<HTMLDivElement | null>(null)
  const selectedTask = item?.automation_tasks?.find((task) => task.id === selectedResult)
  const selectedDiagnostic = selectedTask && (selectedTask.status === 'failed' || selectedTask.status === 'dispatch_failed')
    ? providerFailureGuidance(selectedTask) ?? {
      title: 'El agente detuvo este intento',
      detail: 'No se avanzó ningún gate. Revisa este intento antes de decidir si el flujo debe continuar o necesita más contexto.',
    }
    : undefined
  const selectedResultIsActive = Boolean(selectedResult && item?.automation_tasks?.some((task) => task.id === selectedResult && isActiveTask(task)))
  const selectedResultExists = Boolean(selectedResult && item?.automation_tasks?.some((task) => task.id === selectedResult))
  const [budgetUSD, setBudgetUSD] = useState('')
  const [budgetAlertPercent, setBudgetAlertPercent] = useState('80')
  const trace = useSWR<AutomationTrace>(
    selectedResult && consoleView === 'activity' ? automationTaskTracePath(selectedResult) : null,
    fetcher,
    {
    // A healthy work-item stream invalidates the trace as the agent moves.
    // Poll only as a compact fallback while that connection is recovering.
    refreshInterval: deliveryTraceRefreshInterval(selectedResultIsActive, graphStream.status),
    refreshWhenHidden: false,
    revalidateOnFocus: true,
    revalidateIfStale: true,
    keepPreviousData: true,
    }
  )
  useEffect(() => {
    // A task can disappear from the compact server snapshot after a terminal
    // update. Never leave a stale result drawer open with a dead reference.
    if (!selectedResult || selectedResultExists) return
    setSelectedExecutionKind('agent')
    setSelectedExecution('')
    setSelectedResult('')
  }, [selectedResult, selectedResultExists])
  const traceEntries: TraceEntry[] = trace.data?.entries ?? [
    ...(trace.data?.executions ?? []).map((execution) => ({ ...execution, execution_kind: 'agent' as const })),
    ...(trace.data?.tool_executions ?? []).map((execution) => ({ ...execution, execution_kind: 'tool' as const })),
  ].sort((left, right) => {
    const leftAt = left.completed_at ? Date.parse(left.completed_at) : 0
    const rightAt = right.completed_at ? Date.parse(right.completed_at) : 0
    return leftAt - rightAt
  })
  const [note, setNote] = useState('')
  const [plan, setPlan] = useState({
    summary: '',
    goalInterpretation: '',
    confidence: '0.7',
    autonomyBoundary: 'No avanzar sin una decisión humana en cada gate.',
    contextReviewed: '',
    contextGaps: '',
    assumptions: '',
    humanDecisions: '',
    implementationSteps: '',
    filesImpacted: '',
    risks: '',
    qaPlan: '',
    evidencePlan: '',
    acceptanceCriteria: '',
    rollbackPlan: '',
    estimate: '',
    questions: '',
    browserQaMode: 'read_only' as 'read_only' | 'approved_navigation' | 'approved_test_flow',
    browserQaCases: [] as DeliveryBrowserQAFormCase[],
  })
  const [changeSet, setChangeSet] = useState({
    repositoryRef: '',
    branch: '',
    commitSha: '',
    reviewType: 'pull_request' as 'pull_request' | 'local_worktree',
    pullRequestUrl: '',
    ciStatus: 'pending',
    ciUrl: '',
    previewUrl: '',
  })
  const [release, setRelease] = useState({
    whatChanged: '',
    why: '',
    howToTest: '',
    risks: '',
    decisions: '',
    evidence: '',
    reportRef: '',
  })
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [publicationReason, setPublicationReason] = useState('')
  const [publicationExpiry, setPublicationExpiry] = useState('30')
  const [createPullRequest, setCreatePullRequest] = useState(true)
  const [publicationRepositoryRef, setPublicationRepositoryRef] = useState('')
  const [revocationReason, setRevocationReason] = useState('')
  const [publicationVerification, setPublicationVerification] = useState<DeliveryPublicationVerification | null>(null)

  const requestedTaskID = searchParams.get('task')
  const requestedExecutionID = searchParams.get('execution')
  const requestedExecutionKind = searchParams.get('execution_kind')
  const requestedUsage = searchParams.get('usage')
  const requestedProjectReturn = searchParams.get('from_project')
  const appliedConsoleViewRequestRef = useRef<string | null>(null)
  useEffect(() => {
    if (
      (requestedConsoleView !== 'overview' && requestedConsoleView !== 'activity' && requestedConsoleView !== 'evidence' && requestedConsoleView !== 'control') ||
      appliedConsoleViewRequestRef.current === requestedConsoleView
    ) return
    appliedConsoleViewRequestRef.current = requestedConsoleView
    setConsoleView(requestedConsoleView)
  }, [requestedConsoleView])
  useEffect(() => {
    if (requestedUsage !== '1') return
    setConsoleView('activity')
    setUsageOpen(true)
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('usage')
    router.replace(`/automation/work-items/${params.workItemId}${nextParams.size ? `?${nextParams}` : ''}`, { scroll: false })
  }, [params.workItemId, requestedUsage, router, searchParams])
  useEffect(() => {
    if (consoleView !== 'activity' || !usageOpen) return
    const frame = window.requestAnimationFrame(() => {
      const panel = usagePanelRef.current
      if (!panel) return
      panel.focus({ preventScroll: true })
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [consoleView, usageOpen])
  useEffect(() => {
    if (
      !requestedTaskID ||
      !requestedExecutionID ||
      !item?.automation_tasks?.some((task) => task.id === requestedTaskID)
    )
      return
    setSelectedResult(requestedTaskID)
    setSelectedExecutionKind(requestedExecutionKind === 'tool' ? 'tool' : 'agent')
    setSelectedExecution(requestedExecutionID)
    setConsoleView('activity')
    // Deep links from Costs are intentful: land the operator in the selected
    // execution rather than leaving focus on the overview that was rendered
    // during navigation. A second frame waits for the activity panel mount.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.getElementById('delivery-console-panel-activity')?.focus())
    })
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('task')
    nextParams.delete('execution')
    nextParams.delete('execution_kind')
    router.replace(`/automation/work-items/${params.workItemId}${nextParams.size ? `?${nextParams}` : ''}`, { scroll: false })
  }, [item?.automation_tasks, params.workItemId, requestedExecutionID, requestedExecutionKind, requestedTaskID, router, searchParams])
  useEffect(() => {
    if (consoleView !== 'activity' || !selectedResult) return
    const frame = window.requestAnimationFrame(() => {
      const panel = selectedResultPanelRef.current
      if (!panel) return
      panel.focus({ preventScroll: true })
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [consoleView, selectedExecution, selectedResult])
  const taskBudgetMicros = taskBudget.data?.budget_microusd
  const taskBudgetAlert = taskBudget.data?.alert_percent
  useEffect(() => {
    if (taskBudgetMicros === undefined) return
    setBudgetUSD(taskBudgetMicros ? String(taskBudgetMicros / 1_000_000) : '')
    setBudgetAlertPercent(String(taskBudgetAlert || 80))
  }, [taskBudgetAlert, taskBudgetMicros])
  const publicationReadiness = useSWR<DeliveryPublicationReadiness>(
    item?.project_id && consoleView === 'control' ? deliveryProjectPublicationReadinessPath(item.project_id) : null,
    fetcher,
    { refreshInterval: 30000 }
  )
  const publicationIntegrationReady = publicationReadiness.data?.state === 'ready'
  const clientContext = frozenClientContext(item?.client_context)
  const activePhase = item ? phaseByState[item.state] : undefined
  const transitions = item ? (transitionByState[item.state] ?? []) : []
  const gateTransitions = transitions.filter((transition) => humanGateActions.has(transition.action))
  const activeGateAction = gateTransitions.some((transition) => transition.action === selectedGateAction)
    ? selectedGateAction
    : gateTransitions[0]?.action ?? ''
  const activeGateTransition = gateTransitions.find((transition) => transition.action === activeGateAction)
  const stage = item ? (stageByState[item.state] ?? 0) : 0
  const completedOperations = new Set(
    (item?.automation_tasks ?? []).filter((task) => task.status === 'completed').map((task) => task.operation)
  )
  const currentFailedTaskIDs = new Set(unresolvedFailedTasks(item?.automation_tasks ?? []).map((task) => task.id))
  const taskRelevance = (task: DeliveryAutomationTask) => {
    if (task.status === 'running' || task.status === 'queued') return 0
    if (currentFailedTaskIDs.has(task.id)) return 1
    if (task.status === 'cancel_requested') return 2
    if (task.status === 'completed') return 3
    return 4
  }
  const orderedAutomationTasks = [...(item?.automation_tasks ?? [])].sort(
    (left, right) => taskRelevance(left) - taskRelevance(right) || Date.parse(right.completed_at ?? right.created_at) - Date.parse(left.completed_at ?? left.created_at)
  )
  // The graph is the live trace. This compact rail only surfaces the current
  // execution and the immediately relevant recent outcome; older work stays
  // available behind one intentional disclosure.
  const recentAutomationTasks = orderedAutomationTasks.slice(0, 2)
  const historicalAutomationTasks = orderedAutomationTasks.slice(2)
  const activeAutomationTaskCount = (item?.automation_tasks ?? []).filter(isActiveTask).length
  const completedAutomationTaskCount = (item?.automation_tasks ?? []).filter((task) => task.status === 'completed').length
  const latestAutomationTask = orderedAutomationTasks[0]
  const activityPulse = orderedAutomationTasks.length === 0
    ? { label: 'Preparando', color: 'zinc' as const, detail: 'Aún no hay movimientos registrados' }
    : activeAutomationTaskCount > 0
      ? { label: `${activeAutomationTaskCount} en curso`, color: 'indigo' as const, detail: 'El agente está avanzando' }
    : currentFailedTaskIDs.size > 0
      ? { label: `${currentFailedTaskIDs.size} requiere atención`, color: 'rose' as const, detail: 'Hay una intervención pendiente' }
      : { label: `${completedAutomationTaskCount} completada${completedAutomationTaskCount === 1 ? '' : 's'}`, color: 'emerald' as const, detail: 'Último estado sincronizado' }
  const emptyActivityState = ['plan_review', 'code_review', 'qa_review', 'release_review'].includes(item?.state ?? '')
    ? { title: 'El agente espera una decisión', detail: 'Al confirmar el gate, continuará automáticamente.', action: 'Abrir decisión', view: 'control' as const }
    : (item?.dependencies ?? []).some((dependency) => dependency.depends_on?.state !== 'released')
      ? { title: 'El agente espera entregas relacionadas', detail: 'El flujo continuará al liberarse las dependencias.', action: 'Ver Live Steps', view: 'overview' as const }
    : activePhase
        ? { title: 'El agente prepara el siguiente paso', detail: `“${activePhase.label}” comenzará cuando el gate y el contexto estén listos.`, action: 'Ver Live Steps', view: 'overview' as const }
        : { title: 'El agente aún no inició una ejecución', detail: 'Live Steps muestra el siguiente movimiento disponible.', action: 'Ver Live Steps', view: 'overview' as const }
  const latestPlanTask = [...(item?.automation_tasks ?? [])]
    .filter((task) => task.operation === 'delivery.plan')
    .sort((left, right) => Date.parse(right.completed_at ?? right.created_at) - Date.parse(left.completed_at ?? left.created_at))[0]
  const hasGeneratedPlan = item?.state === 'planning' && latestPlanTask?.status === 'completed'
  const latestGeneratedPlanTask = hasGeneratedPlan ? latestPlanTask : undefined
  const generatedPlanResult = useSWR<{ structured_result?: Record<string, unknown> }>(
    hasGeneratedPlan && latestGeneratedPlanTask?.id && consoleView === 'control'
      ? automationTaskResultPath(latestGeneratedPlanTask.id)
      : null,
    fetcher
  )
  const generatedPlanDetails = planDetails(generatedPlanResult.data?.structured_result)
  const generatedPlanNeedsStagehandCases = generatedPlanDetails.stagehandRequired && generatedPlanDetails.browserQaCases.length === 0
  const generatedPlanValidationInProgress = hasGeneratedPlan && generatedPlanResult.isLoading
  const generatedPlanInspectionPending = hasGeneratedPlan && (generatedPlanResult.isLoading || Boolean(generatedPlanResult.error))
  const generatedPlanCanBeVersioned = hasGeneratedPlan && !generatedPlanInspectionPending && !generatedPlanNeedsStagehandCases
  const hasVersionedPlan = (item?.plans?.length ?? 0) > 0
  const approvedPlan = [...(item?.plans ?? [])]
    .filter((plan) => plan.status === 'approved')
    .sort((left, right) => right.version - left.version)[0]
  const plannedRepositoryImpacts = repositoryImpacts(approvedPlan?.structured_result)
  const changedRepositories = plannedRepositoryImpacts.filter((repository) => repository.impact === 'changes')
  const changeSetsByRepository = (reference: string) =>
    (item?.change_sets ?? []).filter((change) => change.repository_ref === reference)
  const repositoryCoverage = changedRepositories.map((repository) => {
    const changes = changeSetsByRepository(repository.reference)
    const reviewed = changes.some((change) => hasPassedReview(change))
    const published = changes.some((change) => publishedByGitHubApp(change))
    const preview = changes.some((change) => publishedByGitHubApp(change) && hasValidPreview(change))
    return { ...repository, reviewed, published, preview }
  })
  // Old work items did not retain a frozen repository-impact matrix. Preserve
  // their historical manual-preview path while new plans use strict coverage.
  const usesRepositoryCoverage = changedRepositories.length > 0
  const reviewableChangeReady = usesRepositoryCoverage
    ? repositoryCoverage.every((repository) => repository.reviewed)
    : Boolean((item?.change_sets ?? []).some((change) => hasPassedReview(change)))
  const previewReady = usesRepositoryCoverage
    ? repositoryCoverage.every((repository) => repository.published) && repositoryCoverage.some((repository) => repository.preview)
    : Boolean((item?.change_sets ?? []).some((change) => hasValidPreview(change)))
  const reviewedPublicationChanges = (item?.change_sets ?? []).filter((change) => {
    const metadata = metadataRecord(change.metadata)
    return (
      change.review_type === 'local_worktree' &&
      change.ci_status === 'passed' &&
      Boolean(change.branch) &&
      metadata.verification_source === 'itbem-local-agent' &&
      typeof metadata.automation_task_id === 'string' &&
      metadata.worktree === `${change.repository_ref}#${change.branch}` &&
      typeof metadata.base_sha === 'string'
    )
  })
  const reviewedPublicationChange =
    reviewedPublicationChanges.find((change) => change.repository_ref === publicationRepositoryRef) ??
    reviewedPublicationChanges[0]
  const reviewedBaseSHA =
    typeof metadataRecord(reviewedPublicationChange?.metadata).base_sha === 'string'
      ? (metadataRecord(reviewedPublicationChange?.metadata).base_sha as string)
      : ''
  const reviewedGitHubRepository =
    typeof metadataRecord(reviewedPublicationChange?.metadata).github_repository === 'string'
      ? (metadataRecord(reviewedPublicationChange?.metadata).github_repository as string)
      : ''
  const reviewedDiffSHA256 =
    typeof metadataRecord(reviewedPublicationChange?.metadata).review_diff_sha256 === 'string'
      ? (metadataRecord(reviewedPublicationChange?.metadata).review_diff_sha256 as string)
      : ''
  const reviewedPublicationReady = Boolean(
    reviewedPublicationChange?.branch && reviewedBaseSHA && reviewedGitHubRepository && reviewedDiffSHA256
  )
  const activePublicationGrants = (item?.publication_grants ?? []).filter(
    (grant) => !grant.revoked_at && new Date(grant.expires_at).getTime() > publicationTime
  )
  const activePublicationGrantForReviewedChange = reviewedPublicationChange
    ? activePublicationGrants.find(
        (grant) =>
          grant.repository_ref === reviewedPublicationChange.repository_ref &&
          grant.branch === reviewedPublicationChange.branch
      )
    : undefined
  const activePublicationGrant = activePublicationGrantForReviewedChange ?? activePublicationGrants[0]
  const requiredWorkspaceIDs = Array.from(
    new Set(
      (item?.context_snapshots ?? [])
        .map((snapshot) => snapshot.reference)
        .filter((reference) => reference.startsWith('workspace://'))
        .map((reference) => reference.slice('workspace://'.length))
    )
  )
  const workspaceReadinessByID = new Map<string, WorkspacePreflight>()
  for (const worker of runtime.data?.workers ?? []) {
    for (const workspace of worker.workspace_readiness ?? []) {
      if (!workspaceReadinessByID.has(workspace.id)) workspaceReadinessByID.set(workspace.id, workspace)
    }
  }
  const unavailableWorkspaces = requiredWorkspaceIDs.filter((workspaceID) => !workspaceReadinessByID.get(workspaceID)?.ready)
  const gateReadiness: GateReadiness[] = (() => {
    if (!item) return []
    switch (item.state) {
      case 'planning':
        return [
          {
            label: 'Contexto congelado',
            detail: (item.context_snapshots?.length ?? 0) > 0 ? 'El agente recibe fuentes versionadas.' : 'Falta congelar al menos una fuente.',
            ready: (item.context_snapshots?.length ?? 0) > 0,
          },
          {
            label: 'Propuesta del agente',
            detail: !hasGeneratedPlan
              ? 'El último intento no produjo una propuesta válida.'
              : generatedPlanInspectionPending
                ? 'Verificando el contrato de QA antes de versionar.'
                : generatedPlanNeedsStagehandCases
                  ? 'Faltan recorridos E2E concretos en navegador.'
                  : 'Lista para versionar y revisar.',
            ready: hasGeneratedPlan && generatedPlanCanBeVersioned,
          },
        ]
      case 'implementation':
        return [
          { label: 'Plan humano', detail: 'El plan aprobado define el alcance de este worktree.', ready: true },
          {
            label: 'Cambio aislado',
            detail: reviewableChangeReady ? 'Hay evidencia revisable con validación.' : 'El agente debe terminar su worktree y validaciones.',
            ready: reviewableChangeReady,
          },
        ]
      case 'plan_review':
        return [
          {
            label: 'Preflight del worker',
            detail:
              requiredWorkspaceIDs.length === 0
                ? 'Esta tarea no seleccionó workspaces locales para ejecutar.'
                : unavailableWorkspaces.length === 0
                  ? `${requiredWorkspaceIDs.length} workspace${requiredWorkspaceIDs.length === 1 ? '' : 's'} listo${requiredWorkspaceIDs.length === 1 ? '' : 's'} para la siguiente fase.`
                  : `Sin preflight listo para: ${unavailableWorkspaces.join(', ')}. Puedes aprobar el plan, pero la ejecución esperará un worker preparado.`,
            ready: unavailableWorkspaces.length === 0,
          },
          { label: 'Decisión humana', detail: 'Revisa alcance, riesgos, contexto y QA antes de aprobar el plan.', ready: false },
        ]
      case 'code_review':
        return [
          {
            label: 'Cobertura de revisión',
            detail: usesRepositoryCoverage
              ? 'Cada repositorio marcado con cambios requiere CI aprobada.'
              : 'Debe existir una revisión trazable con CI aprobada.',
            ready: reviewableChangeReady,
          },
          { label: 'Decisión humana', detail: 'Documenta qué revisaste y su evidencia antes de aprobar.', ready: false },
        ]
      case 'preview_pending':
        return [
          {
            label: 'GitHub App',
            detail: publicationIntegrationReady ? 'Integración preparada para el grant acotado.' : 'La integración debe estar disponible antes de publicar.',
            ready: publicationIntegrationReady,
          },
          {
            label: 'Permiso humano',
            detail: activePublicationGrantForReviewedChange
              ? 'Existe un grant vigente para el repositorio seleccionado.'
              : 'Emite un grant temporal para la rama revisada.',
            ready: Boolean(activePublicationGrantForReviewedChange),
          },
          {
            label: 'Cobertura de Preview',
            detail: previewReady
              ? 'La publicación y el preview trazable ya están listos.'
              : 'Publica los repositorios requeridos y registra un preview.',
            ready: previewReady,
          },
        ]
      case 'qa_running':
        return [
          { label: 'Preview trazable', detail: item.preview_url ? 'El QA opera sobre el preview registrado.' : 'La API no encontró un preview válido.', ready: Boolean(item.preview_url) },
          { label: 'Evidencia visual', detail: 'El agente guardará capturas y resultados privados de QA.', ready: true },
        ]
      case 'qa_review':
        return [
          {
            label: 'Resultado de QA',
            detail: completedOperations.has('delivery.qa') ? 'Revisa ejecuciones, logs y capturas antes de decidir.' : 'El resultado de QA aún no está disponible.',
            ready: completedOperations.has('delivery.qa'),
          },
          { label: 'Decisión humana', detail: 'Aprueba o devuelve a implementación con evidencia concreta.', ready: false },
        ]
      case 'release_review':
        return [
          { label: 'QA aprobado', detail: 'El gate anterior ya liberó la preparación de entrega.', ready: true },
          { label: 'Resumen de entrega', detail: completedOperations.has('delivery.summary') ? 'El borrador trazable está listo para revisión humana.' : 'Prepara qué cambió, cómo probarlo y sus riesgos.', ready: completedOperations.has('delivery.summary') },
        ]
      default:
        return []
    }
  })()
  async function verifyPublicationIntegration() {
    if (!item?.project_id || !publicationIntegrationReady) return
    setBusy('verify-publication-integration')
    setMessage('')
    try {
      const response = await api.post<DeliveryPublicationVerification>(
        deliveryProjectPublicationReadinessVerifyPath(item.project_id)
      )
      setPublicationVerification(response.data)
      setMessage(
        'GitHub App verificada con un token efímero de sólo lectura. No se guardaron credenciales ni datos de repositorios.'
      )
      await publicationReadiness.mutate()
    } catch {
      setPublicationVerification(null)
      setMessage(
        'No se pudo verificar GitHub App. El control plane seguirá bloqueando grants y publicación hasta que una verificación pase.'
      )
    } finally {
      setBusy('')
    }
  }
  async function startRun() {
    if (!item || !activePhase) return
    if (activePhase.phase === 'publish' && !activePublicationGrantForReviewedChange) {
      setMessage(
        'Selecciona un repositorio con un permiso temporal vigente antes de publicar. Cada publicación consume un grant específico.'
      )
      return
    }
    setBusy('run')
    setMessage('')
    try {
      await api.post(deliveryWorkItemAgentRunsPath(item.id), {
        phase: activePhase.phase,
        instructions: instructions.trim(),
        ...(activePhase.phase === 'publish'
          ? { publication_grant_id: activePublicationGrantForReviewedChange?.id }
          : {}),
      })
      setInstructions('')
      setMessage('El siguiente movimiento ya está en marcha. Live Steps se actualizará al recibir el resultado.')
      await workItem.mutate()
    } catch {
      setMessage(
        'No se pudo iniciar esta fase. Confirma el estado, el contexto congelado y la configuración del agente local.'
      )
    } finally {
      setBusy('')
    }
  }
  async function createPublicationGrant() {
    if (!item || !reviewedPublicationReady || !reviewedPublicationChange?.branch || !publicationReason.trim()) return
    setBusy('publication-grant')
    setMessage('')
    try {
      await api.post(deliveryWorkItemPublicationGrantsPath(item.id), {
        repository_ref: reviewedPublicationChange.repository_ref,
        base_sha: reviewedBaseSHA,
        branch: reviewedPublicationChange.branch,
        capabilities: createPullRequest
          ? ['commit:stage', 'branch:publish', 'pull_request:create']
          : ['commit:stage', 'branch:publish'],
        expires_in_minutes: Number(publicationExpiry),
        reason: publicationReason.trim(),
      })
      setPublicationReason('')
      setMessage('Permiso temporal creado. Revisa su alcance y luego inicia la publicación controlada.')
      await workItem.mutate()
    } catch {
      setMessage(
        'No se pudo emitir el permiso. Confirma el gate de código, el worktree validado y la duración elegida.'
      )
    } finally {
      setBusy('')
    }
  }
  async function revokePublicationGrant() {
    if (!item || !activePublicationGrant || !revocationReason.trim()) return
    setBusy('revoke-publication-grant')
    setMessage('')
    try {
      await api.post(deliveryWorkItemPublicationGrantRevokePath(item.id, activePublicationGrant.id), {
        reason: revocationReason.trim(),
      })
      setRevocationReason('')
      setMessage('Permiso revocado. No se podrá publicar con esa autorización.')
      await workItem.mutate()
    } catch {
      setMessage('No se pudo revocar el permiso. Actualiza la tarea e inténtalo de nuevo.')
    } finally {
      setBusy('')
    }
  }
  async function transition(action: string, quickConfirmation?: string) {
    if (!item) return
    setBusy(action)
    setMessage('')
    try {
      const recordedComment = comment.trim() || quickConfirmation || ''
      const writtenEvidence = deliveryLines(evidenceChecklist)
      // A gate needs an auditable reason and at least one reviewed signal.
      // For the common path one concise operator note is both, while a
      // separate checklist remains available for teams that need more detail.
      const reviewedEvidence = writtenEvidence.length > 0
        ? writtenEvidence
        : humanGateActions.has(action) && recordedComment
          ? [recordedComment]
          : []
      await api.post(deliveryWorkItemTransitionPath(item.id), {
        action,
        comment: recordedComment,
        evidence_checklist: reviewedEvidence,
      })
      setComment('')
      setEvidenceChecklist('')
      setMessage(`Decisión registrada. ${nextAgentMoveAfterGate(action)}`)
      await workItem.mutate()
    } catch {
      setMessage(
        'No se pudo aplicar la transición. Revisa que exista el resultado de agente requerido y completa la información solicitada.'
      )
    } finally {
      setBusy('')
    }
  }
  async function cancelAutomationTask(task: DeliveryAutomationTask) {
    if (!item || (task.status !== 'queued' && task.status !== 'running')) return
    if (!window.confirm('¿Solicitar la cancelación de esta ejecución? Si ya existe una llamada a IA en curso, se conservará su coste y resultado privado para auditoría, pero no podrá avanzar el workflow.')) return
    setBusy(`cancel-${task.id}`)
    setMessage('')
    try {
      await api.post(automationTaskCancelPath(task.id), {
        reason: 'Cancellation requested from the Delivery work item by an authorized operator.',
      })
      setMessage(task.status === 'queued' ? 'Ejecución cancelada antes de iniciar.' : 'Cancelación solicitada. La llamada que ya esté en vuelo sólo podrá cerrar su auditoría; no avanzará el workflow.')
      await workItem.mutate()
    } catch {
      setMessage('No se pudo solicitar la cancelación. Actualiza la tarea y verifica que tienes permisos de gestión de Delivery.')
    } finally {
      setBusy('')
    }
  }
  async function retryCodeReview(task: DeliveryAutomationTask) {
    if (!item || task.operation !== 'code.review' || task.status !== 'failed') return
    if (!window.confirm('¿Crear un nuevo intento con el mismo diff congelado? El resultado fallido permanecerá disponible para auditoría y no se descargará ni revisará otro commit.')) return
    setBusy(`retry-review-${task.id}`)
    setMessage('')
    try {
      await api.post(automationTaskRetryCodeReviewPath(task.id))
      setMessage('Reintento de revisión en cola. Conserva el mismo diff congelado y el intento anterior sigue disponible para auditoría.')
      await workItem.mutate()
    } catch {
      setMessage('No se pudo reintentar la revisión. Verifica que el intento siga fallido y que tienes permisos de gestión de Delivery.')
    } finally {
      setBusy('')
    }
  }
  async function sendNote(event: FormEvent) {
    event.preventDefault()
    if (!item || !note.trim()) return
    setBusy('note')
    setMessage('')
    try {
      await api.post(deliveryWorkItemMessagesPath(item.id), { phase: item.state, body: note.trim() })
      setNote('')
      setMessage('Contexto incorporado. El agente lo tendrá en cuenta en el siguiente paso.')
      await workItem.mutate()
    } catch {
      setMessage('No se pudo guardar la nota para el agente.')
    } finally {
      setBusy('')
    }
  }
  async function savePlan(event: FormEvent) {
    event.preventDefault()
    if (!item) return
    if (
      plan.browserQaMode === 'approved_test_flow' &&
      plan.browserQaCases.some(
        (browserCase) =>
          (browserCase.clickSelector.trim() || browserCase.expectedPath.trim()) &&
          !browserCase.postActionSelector?.trim() &&
          !browserCase.postActionText?.trim() &&
          !browserCase.assertPath?.trim() &&
          !browserCase.expectedPath.trim()
      )
    ) {
      setMessage('Cada acción del flujo de prueba necesita una comprobación posterior: define un elemento, texto o ruta esperada.')
      return
    }
    setBusy('plan')
    setMessage('')
    try {
      await api.post(deliveryWorkItemPlansPath(item.id), deliveryPlanPayload(plan))
      setMessage('Plan versionado y listo para enviar a revisión cuando termine el agente.')
      await workItem.mutate()
    } catch {
      setMessage('No se pudo guardar el plan. Revisa los campos requeridos y que la tarea siga en planificación.')
    } finally {
      setBusy('')
    }
  }
  async function promoteAgentPlan() {
    if (!item) return
    setBusy('promote-plan')
    setMessage('')
    try {
      await api.post(deliveryWorkItemPromoteAgentPlanPath(item.id))
      setMessage(
        'El plan estructurado del agente se guardó como una versión candidata. Revísalo y decide el gate humano.'
      )
      await workItem.mutate()
    } catch {
      setMessage(
        'No se pudo promover el plan. Espera a que termine la ejecución de planificación y revisa su resultado privado.'
      )
    } finally {
      setBusy('')
    }
  }
  async function saveChangeSet(event: FormEvent) {
    event.preventDefault()
    if (!item) return
    setBusy('change')
    setMessage('')
    try {
      await api.post(deliveryWorkItemChangeSetsPath(item.id), {
        repository_ref: changeSet.repositoryRef.trim(),
        branch: changeSet.branch.trim(),
        commit_sha: changeSet.commitSha.trim(),
        review_type: changeSet.reviewType,
        pull_request_url: changeSet.pullRequestUrl.trim(),
        ci_status: changeSet.ciStatus,
        ci_url: changeSet.ciUrl.trim(),
        preview_url: changeSet.previewUrl.trim(),
        environment: 'preview',
      })
      setMessage('Cambio registrado con revisión, CI y/o preview como evidencia trazable.')
      await workItem.mutate()
    } catch {
      setMessage('No se pudo registrar el cambio. Añade el repositorio y URLs http(s) válidas si las incluyes.')
    } finally {
      setBusy('')
    }
  }
  async function saveRelease(event: FormEvent) {
    event.preventDefault()
    if (!item) return
    setBusy('release')
    setMessage('')
    try {
      await api.put(deliveryWorkItemReleasePath(item.id), deliveryReleasePayload(release))
      setMessage('Entrega preparada. Aún requiere el gate humano final para liberar.')
      await workItem.mutate()
    } catch {
      setMessage('No se pudo preparar la entrega. Revisa los resúmenes JSON y el estado de la tarea.')
    } finally {
      setBusy('')
    }
  }
  function useReleaseDraft(draft: DeliveryReleaseDraft) {
    setRelease({
      whatChanged: draft.executive.whatChanged,
      why: draft.executive.why,
      howToTest: draft.executive.howToTest,
      risks: draft.executive.risks.join('\n'),
      decisions: draft.technical.decisions.join('\n'),
      evidence: draft.technical.evidence.join('\n'),
      reportRef: '',
    })
    setSelectedExecutionKind('agent')
    setSelectedExecution('')
    setSelectedResult('')
    setMessage('Borrador del agente cargado. Revísalo, ajusta lo necesario y prepara la entrega; el gate final sigue siendo humano.')
  }
  async function updateTaskBudget(event: FormEvent) {
    event.preventDefault()
    if (!item) return
    const amount = budgetUSD.trim() ? Number(budgetUSD) : 0
    const alert = Number(budgetAlertPercent)
    if (!Number.isFinite(amount) || amount < 0 || amount > 100_000 || !Number.isInteger(alert) || alert < 50 || alert > 100) {
      setMessage('El límite debe estar entre 0 y 100,000 USD y el aviso entre 50% y 100%.')
      return
    }
    setBusy('task-budget')
    setMessage('')
    try {
      await api.put(deliveryWorkItemBudgetPath(item.id), {
        budget_microusd: Math.round(amount * 1_000_000),
        alert_percent: alert,
      })
      setMessage(amount > 0 ? 'Límite de IA de la tarea actualizado.' : 'La tarea quedó sin límite adicional de IA.')
      await taskBudget.mutate()
      await workItem.mutate()
    } catch {
      setMessage('No se pudo actualizar el límite. Confirma tus permisos y vuelve a intentarlo.')
    } finally {
      setBusy('')
    }
  }
  async function downloadReport() {
    if (!item) return
    setDownloadingReport(true)
    setMessage('')
    try {
      const response = await api.get(deliveryWorkItemReleaseReportPath(item.id), { responseType: 'blob' })
      const url = URL.createObjectURL(response.data as Blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `itbem-delivery-${item.id.slice(0, 8)}.md`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setMessage('Reporte de entrega descargado.')
    } catch {
      setMessage('No se pudo descargar el reporte. Prepara y aprueba la entrega primero.')
    } finally {
      setDownloadingReport(false)
    }
  }

  if (workItem.isLoading)
    return (
      <main className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
        <div role="status" aria-live="polite" className="mx-auto max-w-5xl">
          <div className="h-4 w-36 animate-pulse rounded-full bg-surface-soft motion-reduce:animate-none" />
          <div className="mt-5 grid grid-cols-4 gap-1 rounded-2xl border border-border-subtle bg-surface-raised p-1.5 sm:flex">
            {[0, 1, 2, 3].map((step) => <div key={step} className="h-11 flex-1 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />)}
          </div>
          <section className="premium-surface relative mt-5 overflow-hidden rounded-3xl p-5 sm:p-6">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-(--tenant-accent) to-transparent" />
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">
              <span aria-hidden="true" className="size-2 rounded-full bg-(--tenant-accent) delivery-signal motion-reduce:animate-none" />
              Conectando flujo vivo
            </div>
            <p className="mt-2 text-sm text-ink-muted">Sincronizando movimientos y decisiones.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(10rem,.7fr)_minmax(0,1.6fr)]">
              <div className="h-40 rounded-2xl border border-border-subtle bg-surface-soft p-4">
                <div className="h-2.5 w-20 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
                <div className="mt-5 space-y-3">
                  <div className="h-3 w-4/5 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
                  <div className="h-3 w-3/5 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
                </div>
              </div>
              <div className="relative h-52 overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft/65 p-4">
                <div className="h-2.5 w-24 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" />
                <div className="mt-7 flex items-center gap-3"><span className="size-9 rounded-xl bg-(--tenant-accent)/10" /><span className="h-3 flex-1 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" /></div>
                <div className="mt-6 ml-9 flex items-center gap-3"><span className="size-9 rounded-xl bg-surface-raised" /><span className="h-3 w-3/5 animate-pulse rounded-full bg-surface-interactive motion-reduce:animate-none" /></div>
              </div>
            </div>
          </section>
          <span className="sr-only">Cargando ejecución de automatización</span>
        </div>
      </main>
    )
  const workItemErrorStatus = (workItem.error as { response?: { status?: number }; status?: number } | undefined)?.response?.status ??
    (workItem.error as { status?: number } | undefined)?.status
  const unavailableTaskCopy =
    workItemErrorStatus === 401
      ? 'Tu sesión local necesita validarse de nuevo para abrir esta ejecución.'
      : workItemErrorStatus === 403
      ? 'No tienes acceso a este resultado. Pide acceso a su espacio si necesitas revisarlo.'
        : workItemErrorStatus === 404
          ? 'Esta tarea ya no está disponible o fue archivada.'
          : 'El estado del agente no pudo sincronizarse todavía. Tus datos no se han modificado.'
  const unavailableTaskTitle =
    workItemErrorStatus === 401
      ? 'Tu sesión necesita atención'
      : workItemErrorStatus === 403
        ? 'Este resultado es privado'
        : workItemErrorStatus === 404
          ? 'Este resultado ya no está activo'
          : 'No pudimos cargar este flujo'
  if (!item)
    return (
      <main className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8">
        <section className="premium-surface mx-auto max-w-xl rounded-3xl p-6 text-center sm:p-8" role="alert">
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-200">
            {workItemErrorStatus === 404 ? <ArchiveBoxIcon className="size-5" aria-hidden="true" /> : <BoltIcon className="size-5" aria-hidden="true" />}
          </div>
          <p className="mt-4 text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Estado del flujo</p>
          <h1 className="mt-2 text-lg font-semibold text-ink">{unavailableTaskTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            {unavailableTaskCopy}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {workItemErrorStatus !== 401 && workItemErrorStatus !== 403 && workItemErrorStatus !== 404 && (
              <Button color="indigo" onClick={() => void workItem.mutate()}>
                <ArrowPathIcon data-slot="icon" />
                Intentar de nuevo
              </Button>
            )}
            {workItemErrorStatus === 404 ? (
              <Button color="indigo" href="/automation/projects">Explorar resultados</Button>
            ) : (
              <Button outline href="/automation">Volver al Centro</Button>
            )}
          </div>
        </section>
      </main>
    )
  const dependencies = item.dependencies ?? []
  const releasedDependencies = dependencies.filter((dependency) => dependency.depends_on?.state === 'released')
  const pendingDependencies = dependencies.filter((dependency) => dependency.depends_on?.state !== 'released')
  const deliveryIsBlockedByDependencies = pendingDependencies.length > 0
  // Keep the live console focused on movement. The frozen brief is useful
  // only when it actually contains a decision, scope, dependency or source;
  // an empty “0 sources” accordion reads like setup rather than automation.
  const hasOverviewContext = Boolean(
    item.description ||
    textList(item.included_scope).length ||
    textList(item.excluded_scope).length ||
    textList(item.acceptance_criteria).length ||
    (item.context_snapshots?.length ?? 0) > 0 ||
    dependencies.length > 0 ||
    item.pull_request_url ||
    clientContext.health ||
    clientContext.rules.length > 0 ||
    clientContext.conversationSummary
  )
  const workItemIsStopping = hasCancellationRequest(item.automation_tasks ?? [])
  const hasRunAttention = unresolvedFailedTasks(item.automation_tasks ?? []).length > 0 && !workItemIsStopping
  const awaitsDecision = ['plan_review', 'code_review', 'qa_review', 'release_review'].includes(item.state) && !workItemIsStopping
  const consoleTabs: Array<{ view: DeliveryConsoleView; label: string; compact: string; attention?: boolean }> = [
    { view: 'overview', label: 'Live Steps', compact: 'Live' },
    { view: 'activity', label: `Ejecuciones ${item.automation_tasks?.length ? `(${item.automation_tasks.length})` : ''}`, compact: 'Ejec.', attention: hasRunAttention },
    { view: 'evidence', label: `Evidencia ${item.evidence?.length ? `(${item.evidence.length})` : ''}`, compact: 'Evid.' },
    { view: 'control', label: 'Decisiones', compact: 'Decis.', attention: awaitsDecision },
  ]
  const showConsoleView = (view: DeliveryConsoleView, focusPanel = false) => {
    setConsoleView(view)
    if (!focusPanel) return
    window.requestAnimationFrame(() => {
      // The panel remounts for every view. A second frame guarantees that the
      // intended tabpanel, not the outgoing one, receives focus.
      window.requestAnimationFrame(() => {
        const panel = consolePanelRef.current
        if (!panel) return
        panel.focus({ preventScroll: true })
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      })
    })
  }
  const moveConsoleTab = (event: KeyboardEvent<HTMLButtonElement>, view: DeliveryConsoleView) => {
    const currentIndex = consoleTabs.findIndex((tab) => tab.view === view)
    if (currentIndex < 0) return
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % consoleTabs.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + consoleTabs.length) % consoleTabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = consoleTabs.length - 1
    else return
    event.preventDefault()
    const next = consoleTabs[nextIndex]
    // Tabs switch the visible surface without pulling the viewport away from
    // the control the operator is using. Direct CTAs still request panel focus.
    showConsoleView(next.view)
    window.requestAnimationFrame(() => document.getElementById(`delivery-console-tab-${next.view}`)?.focus())
  }
  return (
    <PageTransition>
      <main className="mx-auto max-w-[96rem] px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10 2xl:px-10">
        <Link
          href={item.project_id && requestedProjectReturn === item.project_id ? `/automation/projects/${requestedProjectReturn}` : item.project_id ? `/automation/projects/${item.project_id}` : '/automation/projects'}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink"
        >
          <ArrowLeftIcon className="size-4" />
          Volver al resultado
        </Link>
        <div className="mt-2 flex min-w-0 items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-ink sm:text-base">{item.title}</h1>
          <span className="hidden shrink-0 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-secondary sm:inline-flex">
            {stateLabel[item.state] ?? item.state}
          </span>
        </div>
        <nav
          aria-label="Consola del resultado"
          role="tablist"
          className="sticky top-3 z-20 mt-4 flex gap-1 overflow-x-auto overscroll-x-contain rounded-2xl border border-border-subtle bg-surface-raised/92 p-1.5 shadow-[0_10px_30px_-24px_rgb(15_23_42_/_0.45)] backdrop-blur-xl sm:mt-5"
        >
          {consoleTabs.map(({ view, label, compact, attention }) => (
            <button
              key={view}
              type="button"
              role="tab"
              id={`delivery-console-tab-${view}`}
              onClick={() => showConsoleView(view)}
              onKeyDown={(event) => moveConsoleTab(event, view)}
              aria-label={attention ? `${label}: requiere atención` : label}
              aria-selected={consoleView === view}
              aria-controls={`delivery-console-panel-${view}`}
              tabIndex={consoleView === view ? 0 : -1}
              className={`min-h-11 min-w-[4.5rem] shrink-0 rounded-xl px-3 text-xs font-semibold whitespace-nowrap transition-all duration-200 motion-reduce:transition-none sm:min-h-10 sm:min-w-0 sm:px-4 sm:text-sm ${
                consoleView === view
                  ? 'bg-ink text-white shadow-lg shadow-ink/15'
                  : 'text-ink-secondary hover:-translate-y-px hover:bg-surface-interactive hover:text-ink motion-reduce:hover:translate-y-0'
              }`}
            >
              <span className="inline-flex items-center justify-center gap-1 sm:hidden">
                {compact}
                {attention ? <span aria-hidden="true" className="size-1.5 rounded-full bg-rose-400 shadow-[0_0_0_3px_rgb(244_63_94_/_0.12)]" /> : null}
              </span>
              <span className="hidden sm:inline-flex items-center justify-center gap-1.5">
                {label}
                {attention ? <span aria-hidden="true" className="size-1.5 rounded-full bg-rose-400 shadow-[0_0_0_3px_rgb(244_63_94_/_0.12)]" /> : null}
              </span>
            </button>
          ))}
        </nav>
        {message && (
          <div role="status" aria-live="polite" className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-soft px-4 py-3 text-xs leading-5 text-ink-secondary">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')} className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-interactive hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)" aria-label="Cerrar mensaje">
              <XMarkIcon className="size-4" />
            </button>
          </div>
        )}
        <div
          key={consoleView}
          ref={consolePanelRef}
          id={`delivery-console-panel-${consoleView}`}
          role="tabpanel"
          aria-labelledby={`delivery-console-tab-${consoleView}`}
          tabIndex={0}
          className="dashboard-reveal focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)"
        >
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Vista activa: {consoleTabs.find((tab) => tab.view === consoleView)?.label ?? 'Consola'}</p>
          {consoleView === 'overview' && (
            <section aria-label="Live Steps">
              <DeliveryPipeline
                item={item}
                stage={stage}
                isRefreshing={workItem.isValidating}
                isPlanProposalReady={hasGeneratedPlan && !hasVersionedPlan}
                streamStatus={graphStream.status}
                onRefresh={() => { void workItem.mutate(); void executionGraph.mutate() }}
                onOpenActivity={(taskId) => {
                  showConsoleView('activity', true)
                  if (taskId) {
                    setSelectedExecutionKind('agent')
                    setSelectedExecution('')
                    setSelectedResult(taskId)
                  }
                }}
                onOpenControl={() => showConsoleView('control', true)}
              />
              <DeliveryRunActivity
                item={item}
                graphEvents={executionGraphEvents}
                streamStatus={graphStream.status}
                onOpenActivity={() => showConsoleView('activity', true)}
                onInspectTask={(taskId) => {
                  showConsoleView('activity', true)
                  setSelectedExecutionKind('agent')
                  setSelectedExecution('')
                  setSelectedResult(taskId)
                }}
                onCancelTask={(taskId) => {
                  const task = item.automation_tasks?.find((candidate) => candidate.id === taskId)
                  if (task) void cancelAutomationTask(task)
                }}
                onRefresh={() => { void workItem.mutate(); void executionGraph.mutate() }}
              />
            </section>
          )}
        <div
          className={`mt-5 grid gap-5 ${
            consoleView === 'control'
              ? 'xl:grid-cols-[minmax(0,64rem)] xl:justify-center'
              : 'xl:grid-cols-1'
          }`}
        >
          {consoleView !== 'control' && (
          <section className="space-y-5">
            {consoleView === 'overview' && hasOverviewContext && (
            <details className="premium-surface rounded-3xl group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <span>
                    <span className="block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Contexto</span>
                  <span className="mt-1 block text-sm font-semibold text-ink">
                    {deliveryIsBlockedByDependencies
                      ? `En espera de ${pendingDependencies.length} dependencia${pendingDependencies.length === 1 ? '' : 's'}`
                      : `${item.context_snapshots?.length ?? 0} fuentes listas`}
                  </span>
                </span>
                {deliveryIsBlockedByDependencies && <span className="rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">Atención</span>}
                <>
                  <span className="rounded-xl bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-secondary group-open:hidden">Ver detalle</span>
                  <span className="hidden rounded-xl bg-surface-interactive px-3 py-1.5 text-xs font-semibold text-ink-secondary group-open:inline">Ocultar</span>
                </>
              </summary>
              <div className="border-t border-border-subtle px-5 py-5 sm:px-6">
              <div className="grid gap-5 md:grid-cols-2">
                {item.description && <div>
                  <h2 className="text-sm font-semibold text-ink">Descripción</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-secondary">
                    {item.description}
                  </p>
                </div>}
                {textList(item.included_scope).length > 0 && <div>
                  <h2 className="text-sm font-semibold text-ink">Alcance incluido</h2>
                  <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
                    {textList(item.included_scope).map((scope) => <li key={scope}>• {scope}</li>)}
                  </ul>
                </div>}
                {textList(item.excluded_scope).length > 0 && <div>
                  <h2 className="text-sm font-semibold text-ink">Fuera de alcance</h2>
                  <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
                    {textList(item.excluded_scope).map((scope) => <li key={scope}>• {scope}</li>)}
                  </ul>
                </div>}
                {textList(item.acceptance_criteria).length > 0 && <div>
                  <h2 className="text-sm font-semibold text-ink">Criterios de aceptación</h2>
                  <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
                    {textList(item.acceptance_criteria).map((criterion) => <li key={criterion}>• {criterion}</li>)}
                  </ul>
                </div>}
                {(item.context_snapshots?.length ?? 0) > 0 && <div>
                  <h2 className="text-sm font-semibold text-ink">Contexto congelado</h2>
                  <p className="mt-2 text-sm text-ink-secondary">
                    {item.context_snapshots?.length} fuentes y revisiones capturadas al crear esta tarea.
                  </p>
                </div>}
                {(clientContext.health || clientContext.rules.length > 0 || clientContext.conversationSummary) && (
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Contexto de cliente congelado</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {clientContext.health && (
                        <Badge
                          color={
                            clientContext.health === 'at_risk'
                              ? 'rose'
                              : clientContext.health === 'watch'
                                ? 'amber'
                                : 'emerald'
                          }
                        >
                          {clientContext.health === 'at_risk'
                            ? 'En riesgo'
                            : clientContext.health === 'watch'
                              ? 'En seguimiento'
                              : 'Sano'}
                        </Badge>
                      )}
                      {clientContext.rules.map((rule) => (
                        <Badge key={rule} color="zinc">
                          {rule}
                        </Badge>
                      ))}
                    </div>
                    {clientContext.conversationSummary && (
                      <p className="mt-2 text-sm leading-6 text-ink-secondary">{clientContext.conversationSummary}</p>
                    )}
                    {clientContext.updatedAt && (
                      <p className="mt-2 text-xs text-ink-muted">Perfil capturado: {date(clientContext.updatedAt)}</p>
                    )}
                  </div>
                )}
                {dependencies.length > 0 && (
                  <div className="md:col-span-2">
                    <div
                      className={`overflow-hidden rounded-2xl border ${
                        deliveryIsBlockedByDependencies
                          ? 'border-amber-200 bg-amber-50/65 dark:border-amber-900/70 dark:bg-amber-950/20'
                          : 'border-emerald-200 bg-emerald-50/65 dark:border-emerald-900/70 dark:bg-emerald-950/20'
                      }`}
                    >
                      <div className="flex flex-col gap-3 border-b border-inherit px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span
                            className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${
                              deliveryIsBlockedByDependencies
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {deliveryIsBlockedByDependencies ? (
                              <LockClosedIcon className="size-4" />
                            ) : (
                              <CheckCircleIcon className="size-5" />
                            )}
                          </span>
                          <div>
                            <h2 className="text-sm font-semibold text-ink">Ruta de dependencias</h2>
                            <p className="mt-1 text-sm leading-5 text-ink-secondary">
                              {deliveryIsBlockedByDependencies
                                ? `Esta tarea espera ${pendingDependencies.length} entrega${pendingDependencies.length === 1 ? '' : 's'} antes de pasar a revisión de plan.`
                                : 'Todas las entregas previas fueron liberadas. Esta tarea puede continuar por sus gates.'}
                            </p>
                          </div>
                        </div>
                        <Badge color={deliveryIsBlockedByDependencies ? 'amber' : 'emerald'}>
                          {releasedDependencies.length}/{dependencies.length} liberadas
                        </Badge>
                      </div>
                      <ul className="divide-y divide-inherit">
                        {dependencies.map((dependency) => {
                          const dependencyItem = dependency.depends_on
                          const released = dependencyItem?.state === 'released'
                          const label =
                            stateLabel[dependencyItem?.state ?? ''] ?? dependencyItem?.state ?? 'Estado pendiente'
                          return (
                            <li
                              key={dependency.id}
                              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">
                                  {dependencyItem?.title ?? dependency.depends_on_work_item_id}
                                </p>
                                {dependencyItem?.expected_outcome && (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">
                                    {dependencyItem.expected_outcome}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge color={released ? 'emerald' : 'zinc'}>{label}</Badge>
                                <Link
                                  href={`/automation/work-items/${dependency.depends_on_work_item_id}`}
                                  className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-(--tenant-accent) hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent) dark:hover:bg-white/5"
                                >
                                  Ver tarea <ArrowRightIcon className="size-3.5" />
                                </Link>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                      <p className="px-4 py-3 text-xs leading-5 text-ink-muted">
                        {deliveryIsBlockedByDependencies
                          ? 'El agente puede preparar un plan preliminar con el contexto congelado, pero no puede enviarlo a revisión ni iniciar implementación hasta liberar estas tareas.'
                          : 'La secuencia está desbloqueada. Los gates humanos siguen siendo obligatorios para cada fase.'}
                      </p>
                    </div>
                  </div>
                )}
                {item.pull_request_url && (
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Cambio revisable</h2>
                    <a
                      href={item.pull_request_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-sm break-all text-(--tenant-accent) hover:underline"
                    >
                      Abrir pull request
                    </a>
                  </div>
                )}
              </div>
              </div>
            </details>
            )}
            {consoleView === 'evidence' && <DeliveryEvidenceGallery workItemId={item.id} evidence={item.evidence} />}
            {consoleView === 'overview' && (
            <div>
            {item.state === 'planning' && !hasGeneratedPlan && (
              <details className="premium-surface group rounded-3xl">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
                  <span>
                    <span className="block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Opcional</span>
                    <span className="mt-1 block text-sm font-semibold text-ink">Corregir el rumbo</span>
                  </span>
                  <span className="rounded-xl bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-secondary group-open:hidden">Opcional</span>
                  <span className="hidden rounded-xl bg-surface-interactive px-3 py-1.5 text-xs font-semibold text-ink-secondary group-open:inline">Cerrar</span>
                </summary>
                <div className="border-t border-border-subtle p-5 sm:p-6">
                <p className="text-sm leading-6 text-ink-muted">
                  Sólo si necesitas cambiar el rumbo. Las propuestas y aprobaciones están en Decisiones.
                </p>
                <details className="mt-5 overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                    <span>Añadir plan manual</span>
                  </summary>
                  <form onSubmit={savePlan} className="grid gap-4 px-4 pt-4 pb-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-ink sm:col-span-2">
                      Resumen del plan
                      <input
                        required
                        value={plan.summary}
                        onChange={(event) => setPlan({ ...plan, summary: event.target.value })}
                        className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        placeholder="Qué hará, por qué y cómo se validará"
                      />
                    </label>
                    <label className="text-sm font-medium text-ink sm:col-span-2">
                      Pasos de implementación
                      <textarea
                        required
                        rows={4}
                        value={plan.implementationSteps}
                        onChange={(event) => setPlan({ ...plan, implementationSteps: event.target.value })}
                        placeholder="Un paso acotado por línea"
                        className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-ink">
                      Estimación
                      <input
                        required
                        value={plan.estimate}
                        onChange={(event) => setPlan({ ...plan, estimate: event.target.value })}
                        placeholder="Ej. 2 h o una iteración"
                        className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-ink">
                      Plan de QA
                      <textarea
                        required
                        rows={3}
                        value={plan.qaPlan}
                        onChange={(event) => setPlan({ ...plan, qaPlan: event.target.value })}
                        placeholder="Una validación por línea"
                        className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-ink">
                      Criterios de aceptación
                      <textarea
                        required
                        rows={3}
                        value={plan.acceptanceCriteria}
                        onChange={(event) => setPlan({ ...plan, acceptanceCriteria: event.target.value })}
                        placeholder="Un criterio verificable por línea"
                        className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                      />
                    </label>
                    <details className="group rounded-2xl border border-border-subtle bg-surface-soft/60 sm:col-span-2">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset">
                        Añadir contexto y trazabilidad
                        <span className="text-xs font-medium text-ink-muted group-open:hidden">Opcional</span>
                        <span className="hidden text-xs font-medium text-ink-muted group-open:inline">Ocultar</span>
                      </summary>
                      <div className="grid gap-4 border-t border-border-subtle p-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-ink">
                          Contexto revisado
                          <textarea rows={3} value={plan.contextReviewed} onChange={(event) => setPlan({ ...plan, contextReviewed: event.target.value })} placeholder="Una fuente o decisión por línea" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm" />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Suposiciones
                          <textarea rows={3} value={plan.assumptions} onChange={(event) => setPlan({ ...plan, assumptions: event.target.value })} placeholder="Una suposición por línea" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm" />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Archivos impactados
                          <textarea rows={3} value={plan.filesImpacted} onChange={(event) => setPlan({ ...plan, filesImpacted: event.target.value })} placeholder="Una ruta por línea" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 font-mono text-xs" />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Riesgos
                          <textarea rows={3} value={plan.risks} onChange={(event) => setPlan({ ...plan, risks: event.target.value })} placeholder="Un riesgo por línea" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm" />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Evidencia esperada
                          <textarea rows={3} value={plan.evidencePlan} onChange={(event) => setPlan({ ...plan, evidencePlan: event.target.value })} placeholder="QA, logs o enlaces; uno por línea" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm" />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Preguntas pendientes
                          <textarea rows={3} value={plan.questions} onChange={(event) => setPlan({ ...plan, questions: event.target.value })} placeholder="Una pregunta por línea" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm" />
                        </label>
                      </div>
                    </details>
                    <details className="rounded-2xl border border-border-subtle bg-surface-soft p-4 sm:col-span-2">
                      <summary className="cursor-pointer text-sm font-semibold text-ink">
                        Añadir evaluación de autonomía y reversión{' '}
                        <span className="font-normal text-ink-muted">(opcional)</span>
                      </summary>
                      <p className="mt-2 text-xs leading-5 text-ink-muted">
                        Normalmente el agente completa esto. Úsalo sólo para una propuesta manual que necesite dejar
                        explícitas sus incertidumbres y límites.
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-ink sm:col-span-2">
                          Interpretación del objetivo
                          <input
                            value={plan.goalInterpretation}
                            onChange={(event) => setPlan({ ...plan, goalInterpretation: event.target.value })}
                            placeholder="Si se deja vacío, se toma el resumen del plan."
                            className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Confianza (0 a 1)
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={plan.confidence}
                            onChange={(event) => setPlan({ ...plan, confidence: event.target.value })}
                            className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Límite de autonomía
                          <input
                            value={plan.autonomyBoundary}
                            onChange={(event) => setPlan({ ...plan, autonomyBoundary: event.target.value })}
                            className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Vacíos de contexto
                          <textarea
                            rows={3}
                            value={plan.contextGaps}
                            onChange={(event) => setPlan({ ...plan, contextGaps: event.target.value })}
                            placeholder="Un vacío por línea"
                            className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-ink">
                          Decisiones humanas requeridas
                          <textarea
                            rows={3}
                            value={plan.humanDecisions}
                            onChange={(event) => setPlan({ ...plan, humanDecisions: event.target.value })}
                            placeholder="Una decisión por línea"
                            className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-ink sm:col-span-2">
                          Plan de reversión
                          <textarea
                            rows={3}
                            value={plan.rollbackPlan}
                            onChange={(event) => setPlan({ ...plan, rollbackPlan: event.target.value })}
                            placeholder="Cómo se vuelve al estado seguro; un paso por línea"
                            className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    </details>
                    <details className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.035] p-4 sm:col-span-2">
                      <summary className="cursor-pointer text-sm font-semibold text-ink">
                        Casos E2E en navegador{' '}
                        <span className="font-normal text-ink-muted">(opcional, se aprueban con el plan)</span>
                      </summary>
                      <p className="mt-2 max-w-3xl text-xs leading-5 text-ink-secondary">
                        Define exactamente qué puede comprobar QA en el preview. El flujo de prueba aislado usa referencias locales, no valores de acceso, y siempre conserva el gate humano.
                      </p>
                      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-sky-500/15 bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className="text-sm font-medium text-ink">
                          Alcance de navegación
                          <select
                            value={plan.browserQaMode}
                            onChange={(event) =>
                              setPlan({
                                ...plan,
                                browserQaMode: event.target.value as 'read_only' | 'approved_navigation' | 'approved_test_flow',
                              })
                            }
                            className="mt-1 block h-10 rounded-lg border border-border-subtle bg-surface-soft px-3 text-sm"
                          >
                            <option value="read_only">Solo lectura: abrir y comprobar</option>
                            <option value="approved_navigation">Navegación aprobada: permite enlaces definidos</option>
                            <option value="approved_test_flow">Flujo de prueba: acceso aislado con evidencia</option>
                          </select>
                        </label>
                        <Button
                          type="button"
                          outline
                          onClick={() =>
                            setPlan({
                              ...plan,
                              browserQaCases: [
                                ...plan.browserQaCases,
                                {
                                  id: `browser-case-${plan.browserQaCases.length + 1}`,
                                  title: '',
                                  path: '/',
                                  visibleSelector: '',
                                  expectedText: '',
                                  clickSelector: '',
                                  expectedPath: '',
                                  emailSelector: 'input[type=email]',
                                  emailValueEnv: 'ITBEM_QA_LOGIN_EMAIL',
                                  passwordSelector: 'input[type=password]',
                                  passwordValueEnv: 'ITBEM_QA_LOGIN_PASSWORD',
                                  postActionSelector: '',
                                  postActionText: '',
                                  assertPath: '',
                                },
                              ],
                            })
                          }
                        >
                          Agregar caso
                        </Button>
                      </div>
                      <div className="mt-3 space-y-3">
                        {plan.browserQaCases.map((browserCase, index) => {
                          const updateBrowserCase = (patch: Partial<DeliveryBrowserQAFormCase>) => {
                            const next = [...plan.browserQaCases]
                            next[index] = { ...browserCase, ...patch }
                            setPlan({ ...plan, browserQaCases: next })
                          }
                          return (
                            <article key={`${browserCase.id || 'case'}-${index}`} className="rounded-xl border border-border-subtle bg-surface-raised p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-ink">Caso {index + 1}</p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPlan({
                                      ...plan,
                                      browserQaCases: plan.browserQaCases.filter((_, candidate) => candidate !== index),
                                    })
                                  }
                                  className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300"
                                >
                                  Quitar
                                </button>
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label className="text-xs font-medium text-ink-secondary">
                                  Nombre del caso
                                  <input value={browserCase.title} onChange={(event) => updateBrowserCase({ title: event.target.value })} placeholder="Ej. Página de acceso" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 text-sm text-ink" />
                                </label>
                                <label className="text-xs font-medium text-ink-secondary">
                                  Ruta inicial
                                  <input value={browserCase.path} onChange={(event) => updateBrowserCase({ path: event.target.value })} placeholder="/login" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                </label>
                                <label className="text-xs font-medium text-ink-secondary">
                                  Elemento que debe verse <span className="font-normal text-ink-muted">(CSS, opcional)</span>
                                  <input value={browserCase.visibleSelector} onChange={(event) => updateBrowserCase({ visibleSelector: event.target.value })} placeholder="form[data-qa=login]" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                </label>
                                <label className="text-xs font-medium text-ink-secondary">
                                  Texto esperado <span className="font-normal text-ink-muted">(opcional)</span>
                                  <input value={browserCase.expectedText} onChange={(event) => updateBrowserCase({ expectedText: event.target.value })} placeholder="Inicia sesión" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 text-sm text-ink" />
                                </label>
                                {(plan.browserQaMode === 'approved_navigation' || plan.browserQaMode === 'approved_test_flow') && (
                                  <>
                                    <label className="text-xs font-medium text-ink-secondary">
                                      {plan.browserQaMode === 'approved_test_flow' ? 'Acción aprobada' : 'Enlace aprobado'} <span className="font-normal text-ink-muted">(CSS, opcional)</span>
                                      <input value={browserCase.clickSelector} onChange={(event) => updateBrowserCase({ clickSelector: event.target.value })} placeholder={plan.browserQaMode === 'approved_test_flow' ? 'button[type=submit]' : 'a[data-qa=forgot-password]'} className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                    </label>
                                    <label className="text-xs font-medium text-ink-secondary">
                                      {plan.browserQaMode === 'approved_test_flow' ? 'Ruta posterior esperada' : 'Ruta esperada'}
                                      <input value={browserCase.expectedPath} onChange={(event) => updateBrowserCase({ expectedPath: event.target.value })} placeholder={plan.browserQaMode === 'approved_test_flow' ? '/' : '/forgot-password'} className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                    </label>
                                  </>
                                )}
                                {plan.browserQaMode === 'approved_test_flow' && (
                                  <>
                                    <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/[0.035] p-3 text-xs leading-5 text-ink-secondary sm:col-span-2">
                                      <p className="font-semibold text-indigo-900 dark:text-indigo-100">Cuenta de pruebas aislada</p>
                                      <p className="mt-1">Sólo se guardan referencias de entorno. La plataforma no recibe, muestra ni manda valores de acceso al modelo.</p>
                                    </div>
                                    <label className="text-xs font-medium text-ink-secondary">
                                      Selector de correo
                                      <input value={browserCase.emailSelector ?? ''} onChange={(event) => updateBrowserCase({ emailSelector: event.target.value })} placeholder="input[type=email]" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                    </label>
                                    <label className="text-xs font-medium text-ink-secondary">
                                      Referencia del correo
                                      <input value={browserCase.emailValueEnv ?? ''} onChange={(event) => updateBrowserCase({ emailValueEnv: event.target.value.toUpperCase() })} placeholder="ITBEM_QA_LOGIN_EMAIL" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                    </label>
                                    <label className="text-xs font-medium text-ink-secondary">
                                      Selector de contraseña
                                      <input value={browserCase.passwordSelector ?? ''} onChange={(event) => updateBrowserCase({ passwordSelector: event.target.value })} placeholder="input[type=password]" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                    </label>
                                    <label className="text-xs font-medium text-ink-secondary">
                                      Referencia de contraseña
                                      <input value={browserCase.passwordValueEnv ?? ''} onChange={(event) => updateBrowserCase({ passwordValueEnv: event.target.value.toUpperCase() })} placeholder="ITBEM_QA_LOGIN_PASSWORD" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                    </label>
                                    <label className="text-xs font-medium text-ink-secondary sm:col-span-2">
                                      Elemento visible después de la acción <span className="font-normal text-ink-muted">(CSS, opcional)</span>
                                      <input value={browserCase.postActionSelector ?? ''} onChange={(event) => updateBrowserCase({ postActionSelector: event.target.value })} placeholder="[data-qa=workspace-ready]" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                    </label>
                                    <label className="text-xs font-medium text-ink-secondary sm:col-span-2">
                                      Texto visible después de la acción <span className="font-normal text-ink-muted">(opcional)</span>
                                      <input value={browserCase.postActionText ?? ''} onChange={(event) => updateBrowserCase({ postActionText: event.target.value })} placeholder="Operación lista" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 text-sm text-ink" />
                                    </label>
                                    <label className="text-xs font-medium text-ink-secondary sm:col-span-2">
                                      Ruta posterior <span className="font-normal text-ink-muted">(opcional)</span>
                                      <input value={browserCase.assertPath ?? ''} onChange={(event) => updateBrowserCase({ assertPath: event.target.value })} placeholder="/automation" className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink" />
                                      <span className="mt-1 block text-[11px] font-normal text-ink-muted">Tras una acción debes definir al menos una señal: elemento, texto o ruta. Se ejecutan en el orden mostrado.</span>
                                    </label>
                                  </>
                                )}
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </details>
                    <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.04] p-3 text-xs leading-5 text-ink-secondary sm:col-span-2">
                      Versionar esta propuesta sólo crea un registro revisable. El envío y la aprobación siguen siendo
                      decisiones humanas separadas.
                    </div>
                    <Button color="indigo" type="submit" disabled={busy === 'plan'} className="sm:col-span-2">
                      {busy === 'plan' ? 'Guardando…' : 'Versionar plan manual'}
                    </Button>
                  </form>
                </details>
                {(item.plans?.length ?? 0) > 0 && (
                  <ol className="mt-5 space-y-2">
                    {item.plans?.map((entry) => {
                      const details = planDetails(entry.structured_result)
                      return (
                        <li key={entry.id} className="rounded-2xl border border-border-subtle bg-surface-soft p-4">
                          <div className="flex items-center gap-2">
                            <Badge
                              color={
                                entry.status === 'approved'
                                  ? 'emerald'
                                  : entry.status === 'changes_requested'
                                    ? 'rose'
                                    : 'amber'
                              }
                            >
                              v{entry.version} · {entry.status}
                            </Badge>
                            <p className="text-sm font-semibold text-ink">{entry.summary}</p>
                          </div>
                          {(details.goal || details.confidence !== null) && (
                            <div className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
                              {details.goal && <p className="text-sm leading-6 text-ink-secondary">{details.goal}</p>}
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                {details.confidence !== null && (
                                  <Badge
                                    color={
                                      details.confidence >= 0.75
                                        ? 'emerald'
                                        : details.confidence >= 0.5
                                          ? 'amber'
                                          : 'rose'
                                    }
                                  >
                                    Confianza {Math.round(details.confidence * 100)}%
                                  </Badge>
                                )}
                                <Badge color="zinc">{details.steps.length} pasos previstos</Badge>
                                <Badge color="zinc">{details.files.length} archivos previstos</Badge>
                                <Badge color="zinc">{details.qa.length} pruebas previstas</Badge>
                                <Badge color="zinc">{details.evidence.length} evidencias</Badge>
                                {details.browserQaCases.length > 0 && (
                                  <Badge color="sky">{details.browserQaCases.length} casos E2E aprobables</Badge>
                                )}
                              </div>
                            </div>
                          )}
                          {details.steps.length > 0 && (
                            <div className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-ink-secondary">Secuencia propuesta</p>
                                <span className="text-xs text-ink-muted">Se aprueba como parte del gate de plan</span>
                              </div>
                              <ol className="mt-3 space-y-2">
                                {details.steps.map((step, index) => (
                                  <li
                                    key={`${entry.id}-step-${index}`}
                                    className="flex gap-2 text-sm leading-5 text-ink-secondary"
                                  >
                                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--tenant-accent)/10 text-[10px] font-bold text-(--tenant-accent)">
                                      {index + 1}
                                    </span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {details.browserQaCases.length > 0 && (
                            <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-sky-900 dark:text-sky-100">QA E2E que el agente puede ejecutar</p>
                                <Badge color="sky">
                                  {details.browserQaMode === 'approved_test_flow'
                                    ? 'Flujo de prueba aislado'
                                    : details.browserQaMode === 'approved_navigation'
                                      ? 'Navegación aprobada'
                                      : 'Solo lectura'}
                                </Badge>
                              </div>
                              <ul className="mt-3 space-y-2">
                                {details.browserQaCases.map((browserCase) => (
                                  <li key={`${entry.id}-${browserCase.id}`} className="rounded-lg border border-sky-500/10 bg-surface-raised px-3 py-2">
                                    <p className="text-sm font-medium text-ink">{browserCase.title}</p>
                                    <p className="mt-1 text-xs text-ink-secondary">
                                      {browserCase.steps.length} comprobaciones declaradas · {browserCase.steps.map((step) => step.kind).join(' · ')}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-2 text-xs leading-5 text-ink-muted">
                                {details.browserQaMode === 'approved_test_flow'
                                  ? 'Usa una cuenta de pruebas por referencias locales; ningún valor de acceso queda en el plan ni en la evidencia. Estas comprobaciones se congelan al aprobar el plan.'
                                  : 'No puede autenticar, enviar formularios, modificar datos ni salir del preview. Estas comprobaciones se congelan al aprobar el plan.'}
                              </p>
                            </div>
                          )}
                          {(details.gaps.length > 0 || details.decisions.length > 0) && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {details.gaps.length > 0 && (
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                                    Contexto por resolver
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                                    {details.gaps.join(' · ')}
                                  </p>
                                </div>
                              )}
                              {details.decisions.length > 0 && (
                                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3">
                                  <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                                    Decisiones que requieren persona
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                                    {details.decisions.join(' · ')}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          {details.autonomy && (
                            <p className="mt-3 text-xs leading-5 text-ink-muted">
                              Límite de autonomía: {details.autonomy}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-ink-muted">
                            Contexto congelado: {entry.context_digest?.slice(0, 12) ?? 'pendiente'}
                          </p>
                        </li>
                      )
                    })}
                  </ol>
                )}
                </div>
              </details>
            )}
            {(item.state === 'implementation' ||
              item.state === 'code_review' ||
              item.state === 'preview_pending' ||
              item.state === 'qa_running' ||
              item.state === 'qa_review' ||
              item.state === 'release_review' ||
              item.state === 'released') && (
              <section className="premium-surface rounded-3xl p-5 sm:p-6">
                <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Cambio y validación</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">
                  Revisión, validación y preview en un mismo registro
                </h2>
                {usesRepositoryCoverage && (
                  <section className="mt-5 overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft" aria-label="Cobertura de repositorios antes de Preview">
                    <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Cobertura multirrepositorio</p>
                        <h3 className="mt-1 text-sm font-semibold text-ink">Lo aprobado debe quedar publicado de forma verificable</h3>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-secondary">
                          Esta matriz proviene del plan aprobado. El agente no puede iniciar QA hasta que cada repositorio con cambios tenga una publicación comprobada por GitHub App y exista un preview trazable.
                        </p>
                      </div>
                      <Badge color={previewReady ? 'emerald' : 'amber'}>
                        {previewReady ? 'Listo para registrar Preview' : 'Faltan comprobaciones'}
                      </Badge>
                    </div>
                    <ul className="divide-y divide-border-subtle">
                      {repositoryCoverage.map((repository) => (
                        <li key={repository.reference} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{repository.name}</p>
                            <p className="mt-0.5 truncate text-xs text-ink-muted">{repository.reference}</p>
                            <p className="mt-1 text-xs leading-5 text-ink-secondary">{repository.notes}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Badge color={repository.reviewed ? 'emerald' : 'amber'}>
                              {repository.reviewed ? 'Revisión aprobada' : 'Falta revisión'}
                            </Badge>
                            <Badge color={repository.published ? 'emerald' : 'amber'}>
                              {repository.published ? 'Rama publicada' : 'Falta publicar'}
                            </Badge>
                            {repository.preview && <Badge color="sky">Preview disponible</Badge>}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-border-subtle px-4 py-3 text-xs leading-5 text-ink-muted">
                      {previewReady
                        ? 'La cobertura está completa. El siguiente gate registra el preview que se usará para QA.'
                        : 'Un preview aislado no cubre repositorios sin publicación. Emite un grant por repositorio, publica únicamente la rama revisada y vuelve a esta matriz.'}
                    </p>
                  </section>
                )}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {(item.change_sets ?? []).map((change) => {
                    const changeMetadata = metadataRecord(change.metadata)
                    const localAgentRecord =
                      change.review_type === 'local_worktree' &&
                      changeMetadata.verification_source === 'itbem-local-agent'
                    return (
                      <article key={change.id} className="rounded-2xl border border-border-subtle bg-surface-soft p-3">
                        <Badge
                          color={
                            change.ci_status === 'passed' ? 'emerald' : change.ci_status === 'failed' ? 'rose' : 'amber'
                          }
                        >
                          {localAgentRecord
                            ? change.ci_status === 'passed'
                              ? 'Validación local aprobada'
                              : 'Validación local pendiente'
                            : `CI ${change.ci_status}`}
                        </Badge>
                        <p className="mt-2 truncate text-sm font-semibold text-ink">
                          {change.branch || change.repository_ref}
                        </p>
                        {change.review_type === 'local_worktree' && (
                          <p className="mt-2 text-xs font-medium text-indigo-700">
                            Revisión local en worktree aislado{localAgentRecord ? ' · registrada por el agente' : ''}
                          </p>
                        )}
                        {change.pull_request_url && (
                          <a
                            className="mt-2 block text-xs text-(--tenant-accent) hover:underline"
                            href={change.pull_request_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir PR
                          </a>
                        )}
                        {change.preview_url && (
                          <a
                            className="mt-1 block text-xs text-(--tenant-accent) hover:underline"
                            href={change.preview_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir preview
                          </a>
                        )}
                      </article>
                    )
                  })}
                </div>
                {item.state !== 'released' && (
                  <details className="mt-5 rounded-2xl border border-border-subtle bg-surface-soft">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
                      Agregar referencia externa o corregir un registro
                    </summary>
                    <form
                      onSubmit={saveChangeSet}
                      className="mt-5 grid gap-3 border-t border-border-subtle pt-5 sm:grid-cols-2"
                    >
                      <label className="text-sm font-medium text-ink">
                        Repositorio
                        <input
                          required
                          value={changeSet.repositoryRef}
                          onChange={(event) => setChangeSet({ ...changeSet, repositoryRef: event.target.value })}
                          placeholder="workspace://repo"
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink">
                        Rama
                        <input
                          value={changeSet.branch}
                          onChange={(event) => setChangeSet({ ...changeSet, branch: event.target.value })}
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink">
                        Tipo de revisión
                        <select
                          value={changeSet.reviewType}
                          onChange={(event) =>
                            setChangeSet({
                              ...changeSet,
                              reviewType: event.target.value as 'pull_request' | 'local_worktree',
                              pullRequestUrl: event.target.value === 'local_worktree' ? '' : changeSet.pullRequestUrl,
                            })
                          }
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        >
                          <option value="pull_request">Pull request remoto</option>
                          <option value="local_worktree">Worktree local aislado</option>
                        </select>
                      </label>
                      <label className="text-sm font-medium text-ink">
                        {changeSet.reviewType === 'local_worktree' ? 'Referencia de revisión local' : 'URL del PR'}
                        <input
                          required={changeSet.reviewType === 'pull_request'}
                          value={changeSet.pullRequestUrl}
                          onChange={(event) => setChangeSet({ ...changeSet, pullRequestUrl: event.target.value })}
                          placeholder={
                            changeSet.reviewType === 'local_worktree'
                              ? 'No se usa: el worktree y rama son la referencia'
                              : 'https://…'
                          }
                          disabled={changeSet.reviewType === 'local_worktree'}
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink">
                        Estado CI
                        <select
                          value={changeSet.ciStatus}
                          onChange={(event) => setChangeSet({ ...changeSet, ciStatus: event.target.value })}
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        >
                          <option>pending</option>
                          <option>running</option>
                          <option>passed</option>
                          <option>failed</option>
                        </select>
                      </label>
                      <label className="text-sm font-medium text-ink">
                        URL CI
                        <input
                          value={changeSet.ciUrl}
                          onChange={(event) => setChangeSet({ ...changeSet, ciUrl: event.target.value })}
                          placeholder="https://…"
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink">
                        URL preview
                        <input
                          value={changeSet.previewUrl}
                          onChange={(event) => setChangeSet({ ...changeSet, previewUrl: event.target.value })}
                          placeholder="https://…"
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                        />
                      </label>
                      <Button color="indigo" type="submit" disabled={busy === 'change'} className="sm:col-span-2">
                        {busy === 'change' ? 'Guardando…' : 'Registrar cambio'}
                      </Button>
                      <p className="text-xs leading-5 text-ink-muted sm:col-span-2">
                        El worktree local conserva rama, diff y CI sin crear ni simular un PR remoto. La aprobación del
                        código sigue siendo un gate humano.
                      </p>
                    </form>
                  </details>
                )}
              </section>
            )}
            {item.state === 'release_review' && (
              <section className="premium-surface rounded-3xl p-5 sm:p-6">
                <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Entrega presentada</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">Confirma la entrega</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  Sólo hacen falta el resultado y cómo validarlo. La trazabilidad técnica queda disponible si la necesitas.
                </p>
                <form onSubmit={saveRelease} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-ink sm:col-span-2">
                    Qué cambió
                    <textarea
                      required
                      rows={3}
                      value={release.whatChanged}
                      onChange={(event) => setRelease({ ...release, whatChanged: event.target.value })}
                      placeholder="Cambios entregados y resultado para el cliente"
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm font-medium text-ink">
                    Cómo probarlo
                    <textarea
                      required
                      rows={3}
                      value={release.howToTest}
                      onChange={(event) => setRelease({ ...release, howToTest: event.target.value })}
                      placeholder="Pasos claros para validar la entrega"
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <details className="group rounded-2xl border border-border-subtle bg-surface-soft/60 sm:col-span-2">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset">
                      Añadir trazabilidad técnica
                      <span className="text-xs font-medium text-ink-muted group-open:hidden">Opcional</span>
                      <span className="hidden text-xs font-medium text-ink-muted group-open:inline">Ocultar</span>
                    </summary>
                    <div className="grid gap-4 border-t border-border-subtle p-4 sm:grid-cols-2">
                      <label className="text-sm font-medium text-ink">
                        Por qué se hizo
                        <textarea
                          rows={3}
                          value={release.why}
                          onChange={(event) => setRelease({ ...release, why: event.target.value })}
                          placeholder="Objetivo o decisión de negocio"
                          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink">
                        Riesgos o seguimiento
                        <textarea
                          rows={3}
                          value={release.risks}
                          onChange={(event) => setRelease({ ...release, risks: event.target.value })}
                          placeholder="Un elemento por línea"
                          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink">
                        Decisiones técnicas
                        <textarea
                          rows={3}
                          value={release.decisions}
                          onChange={(event) => setRelease({ ...release, decisions: event.target.value })}
                          placeholder="Una decisión por línea"
                          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink">
                        Evidencias incluidas
                        <textarea
                          rows={3}
                          value={release.evidence}
                          onChange={(event) => setRelease({ ...release, evidence: event.target.value })}
                          placeholder="QA, CI o artefactos; uno por línea"
                          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-sm font-medium text-ink sm:col-span-2">
                        Referencia adicional del informe
                        <input
                          value={release.reportRef}
                          onChange={(event) => setRelease({ ...release, reportRef: event.target.value })}
                          placeholder="Opcional: URL o referencia privada"
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm"
                        />
                      </label>
                    </div>
                  </details>
                  <p className="text-xs leading-5 text-ink-secondary sm:col-span-2">
                    Preparar la entrega no la libera: la aprobación sigue siendo el gate final.
                  </p>
                  <Button color="indigo" type="submit" disabled={busy === 'release'} className="sm:col-span-2">
                    {busy === 'release' ? 'Preparando…' : 'Preparar entrega para revisión'}
                  </Button>
                </form>
              </section>
            )}
            {item.state === 'released' && (
              <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5 sm:p-6">
                <p className="text-xs font-semibold tracking-[0.14em] text-emerald-700 uppercase">Entrega liberada</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">Resumen listo para compartir</h2>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">
                  El reporte reúne decisión humana, cambios, QA, evidencia y enlaces trazables de esta entrega.
                </p>
                <Button
                  color="indigo"
                  onClick={() => void downloadReport()}
                  disabled={downloadingReport}
                  className="mt-4"
                >
                  {downloadingReport ? 'Preparando descarga…' : 'Descargar informe de entrega'}
                </Button>
              </section>
            )}
            </div>
            )}
            {consoleView === 'activity' && (
            <div className="flex flex-col gap-5">
            <details ref={usagePanelRef} open={usageOpen} tabIndex={-1} onToggle={(event) => setUsageOpen(event.currentTarget.open)} className="order-2 premium-surface group rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-surface-soft text-(--tenant-accent)"><BoltIcon className="size-4" /></span>
                  <span>
                    <span className="block text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Uso y límites</span>
                    <span className="mt-0.5 block text-sm font-semibold text-ink">{item.cost_summary?.executions ?? 0} ejecuci{(item.cost_summary?.executions ?? 0) === 1 ? 'ón' : 'ones'} registradas</span>
                  </span>
                </div>
                <span className="rounded-xl bg-(--tenant-accent)/10 px-3 py-2 text-xs font-semibold text-(--tenant-accent) group-open:hidden">Ver detalle</span>
                <span className="hidden rounded-xl bg-surface-interactive px-3 py-2 text-xs font-semibold text-ink-secondary group-open:inline">Ocultar</span>
              </summary>
              <div className="border-t border-border-subtle px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-soft px-3.5 py-3">
                <span>
                  <span className="block text-xs font-semibold text-ink">Consumo dentro del flujo</span>
                  <span className="mt-0.5 block text-[11px] text-ink-muted">Límites, tokens y desglose bajo demanda.</span>
                </span>
                <Badge color={taskBudget.data?.enforced ? 'indigo' : 'zinc'}>{taskBudget.data?.enforced ? 'Límite activo' : 'Sin límite adicional'}</Badge>
              </div>
              <details className="mt-3 group rounded-xl border border-border-subtle bg-surface-raised">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-ink-secondary">
                  Ver coste, límites y telemetría
                  <ChevronDownIcon className="size-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="border-t border-border-subtle px-3 pb-3">
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-surface-soft p-3">
                  <p className="text-xs text-ink-muted">Costo acumulado</p>
                  <p className="mt-1 text-xl font-semibold text-ink tabular-nums">
                    {cost(item.cost_summary?.total_cost_microusd)}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface-soft p-3">
                  <p className="text-xs text-ink-muted">Ejecuciones</p>
                  <p className="mt-1 text-xl font-semibold text-ink tabular-nums">
                    {item.cost_summary?.executions ?? 0}
                  </p>
                </div>
              </div>
              <details className="mt-3 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">Ver métricas técnicas</summary>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Caché leída</dt><dd className="font-medium text-ink tabular-nums">{(item.cost_summary?.cached_input_tokens ?? 0).toLocaleString('es-MX')}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Caché escrita</dt><dd className="font-medium text-ink tabular-nums">{(item.cost_summary?.cache_write_tokens ?? 0).toLocaleString('es-MX')}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Razonamiento</dt><dd className="font-medium text-ink tabular-nums">{(item.cost_summary?.reasoning_tokens ?? 0).toLocaleString('es-MX')}</dd></div>
                </dl>
              </details>
              <section className={`mt-5 rounded-2xl border p-4 ${taskBudget.data?.enforced ? 'border-indigo-500/20 bg-indigo-500/[0.045]' : 'border-border-subtle bg-surface-soft'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Guardrail de esta tarea</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {taskBudget.data?.enforced
                        ? `${cost(taskBudget.data.remaining_microusd)} disponibles de ${cost(taskBudget.data.budget_microusd)}`
                        : 'Sin límite adicional'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink-secondary">
                      {taskBudget.data?.enforced
                        ? `${cost(taskBudget.data.spent_microusd)} reales + ${cost(taskBudget.data.reserved_microusd)} reservados. Se bloquea una nueva llamada antes de rebasar el tope.`
                        : 'El presupuesto mensual del proyecto sigue aplicando si está configurado.'}
                    </p>
                  </div>
                  <Badge color={taskBudget.data?.enforced ? 'indigo' : 'zinc'}>
                    {taskBudget.data?.enforced ? 'Límite activo' : 'Opcional'}
                  </Badge>
                </div>
                <details className="mt-4 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-ink">Ajustar límite de IA de esta tarea</summary>
                  <form onSubmit={updateTaskBudget} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
                    <label className="text-xs font-medium text-ink-secondary">
                      Máximo USD <span className="font-normal text-ink-muted">(vacío = sin límite)</span>
                      <input type="number" min="0" max="100000" step="0.01" value={budgetUSD} onChange={(event) => setBudgetUSD(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink" />
                    </label>
                    <label className="text-xs font-medium text-ink-secondary">
                      Aviso %
                      <input type="number" min="50" max="100" step="1" value={budgetAlertPercent} onChange={(event) => setBudgetAlertPercent(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink" />
                    </label>
                    <Button type="submit" outline disabled={busy === 'task-budget'} className="min-h-10">
                      {busy === 'task-budget' ? 'Guardando…' : 'Guardar límite'}
                    </Button>
                  </form>
                </details>
              </section>
              {(item.cost_summary?.steps.length ?? 0) > 0 && (
                <ul className="mt-5 divide-y divide-border-subtle rounded-2xl border border-border-subtle">
                  {item.cost_summary?.steps.map((step) => (
                    <li
                      key={`${step.execution_kind}-${step.tool ?? 'agent'}-${step.step_key}`}
                      className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                    >
                      <span>
                        <span className="font-semibold text-ink">
                          {step.execution_kind === 'tool' ? `${step.tool || 'Herramienta'} · ${step.step_key || 'QA de navegador'}` : step.step_key}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {step.executions} ejecuciones · {step.input_tokens.toLocaleString('es-MX')} entrada ·{' '}
                          {step.output_tokens.toLocaleString('es-MX')} salida
                          {step.cached_input_tokens > 0
                            ? ` · ${step.cached_input_tokens.toLocaleString('es-MX')} caché leída`
                            : ''}
                          {step.cache_write_tokens > 0
                            ? ` · ${step.cache_write_tokens.toLocaleString('es-MX')} caché escrita`
                            : ''}
                          {step.reasoning_tokens > 0
                            ? ` · ${step.reasoning_tokens.toLocaleString('es-MX')} razonamiento`
                            : ''}
                        </span>
                      </span>
                      <span className="text-xs text-ink-muted tabular-nums">
                        {step.total_tokens.toLocaleString('es-MX')} tokens
                      </span>
                      <span className="font-semibold text-ink tabular-nums">{cost(step.total_cost_microusd)}</span>
                    </li>
                  ))}
                </ul>
              )}
                </div>
              </details>
              </div>
            </details>
            <section className="order-1 premium-surface overflow-hidden rounded-3xl">
              <div className="border-b border-border-subtle px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
                      Actividad del agente
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-ink">Pulso de ejecución</h2>
                  </div>
                  <span role="status" aria-live="polite" aria-atomic="true">
                    <Badge color={activityPulse.color}>{activityPulse.label}</Badge>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                  <span>{activityPulse.detail}</span>
                  {latestAutomationTask && <><span aria-hidden="true">·</span><span>Último: {latestAutomationTask.operation.replace('delivery.', '')}</span></>}
                </div>
              </div>
              {(item.automation_tasks?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                  <div>
                    <p className="text-sm font-semibold text-ink">{emptyActivityState.title}</p>
                    <p className="mt-1 text-sm leading-6 text-ink-muted">{emptyActivityState.detail}</p>
                  </div>
                  <Button outline onClick={() => showConsoleView(emptyActivityState.view, true)}>
                    {emptyActivityState.action}
                    <ArrowRightIcon data-slot="icon" />
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {recentAutomationTasks.map((task) => (
                    <AutomationTaskRow
                      key={task.id}
                      task={task}
                      busy={busy}
                      isCurrentFailure={currentFailedTaskIDs.has(task.id)}
                      selected={selectedResult === task.id}
                      onInspect={(selectedTask) => {
                        setSelectedExecutionKind('agent')
                        setSelectedExecution('')
                        setSelectedResult(selectedTask.id)
                      }}
                      onCancel={(selectedTask) => void cancelAutomationTask(selectedTask)}
                      onRetryCodeReview={(selectedTask) => void retryCodeReview(selectedTask)}
                    />
                  ))}
                </ul>
              )}
              {historicalAutomationTasks.length > 0 && (
                <details className="group border-t border-border-subtle px-5 py-3 sm:px-6">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-ink-secondary">
                    <span><span className="block text-[10px] font-bold tracking-[.12em] text-ink-muted uppercase">Historial</span><span className="mt-0.5 block">{historicalAutomationTasks.length} ejecuciones anteriores</span></span>
                    <span className="flex items-center gap-2"><span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Ocultar</span><ChevronDownIcon className="size-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></span>
                  </summary>
                  <ul className="mt-3 -mx-5 divide-y divide-border-subtle border-t border-border-subtle sm:-mx-6">
                    {historicalAutomationTasks.map((task) => (
                      <AutomationTaskRow
                        key={task.id}
                        task={task}
                        busy={busy}
                        isCurrentFailure={currentFailedTaskIDs.has(task.id)}
                        selected={selectedResult === task.id}
                        onInspect={(selectedTask) => {
                          setSelectedExecutionKind('agent')
                          setSelectedExecution('')
                          setSelectedResult(selectedTask.id)
                        }}
                        onCancel={(selectedTask) => void cancelAutomationTask(selectedTask)}
                        onRetryCodeReview={(selectedTask) => void retryCodeReview(selectedTask)}
                      />
                    ))}
                  </ul>
                </details>
              )}
              {selectedResult && (
                <div ref={selectedResultPanelRef} id="delivery-selected-execution" tabIndex={-1} className="px-5 pb-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
                  <DeliveryResultPanel
                    taskId={selectedResult}
                    executionId={selectedExecution || undefined}
                    executionKind={selectedExecution ? selectedExecutionKind : undefined}
                    execution={selectedExecution ? traceEntries.find((entry) => entry.id === selectedExecution) : undefined}
                    diagnostic={!selectedExecution && Boolean(selectedDiagnostic)}
                    diagnosticSummary={!selectedExecution ? selectedDiagnostic : undefined}
                    onUseReleaseDraft={useReleaseDraft}
                    onClose={() => {
                      setSelectedExecutionKind('agent')
                      setSelectedExecution('')
                      setSelectedResult('')
                    }}
                  />
                  <details open={false} className="group mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset">
                      <div>
                        <p className="text-xs font-semibold tracking-[.12em] text-ink-muted uppercase">
                          Costos y trazabilidad
                        </p>
                        <p className="mt-1 text-sm text-ink-secondary">
                          Disponible cuando necesites auditar esta ejecución
                        </p>
                      </div>
                      <span className="flex items-center gap-2">
                        <Badge color="indigo">{traceEntries.length} registros</Badge>
                        <span className="text-xs text-ink-muted group-open:hidden">Ver</span>
                        <span className="hidden text-xs text-ink-muted group-open:inline">Ocultar</span>
                      </span>
                    </summary>
                    <div className="border-t border-border-subtle p-4">
                      {traceEntries.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                        <span className="self-center text-xs text-ink-muted">Inspección exacta por llamada:</span>
                        {traceEntries.map((execution, index) => (
                          <button
                            key={`inspect-${execution.id || index}`}
                            type="button"
                            onClick={() => {
                              setSelectedExecutionKind(execution.execution_kind)
                              setSelectedExecution(execution.id)
                            }}
                            disabled={!execution.id}
                            className={`min-h-9 rounded-xl border px-3 text-xs font-semibold transition ${selectedExecution === execution.id ? 'border-(--tenant-accent) bg-(--tenant-accent)/10 text-(--tenant-accent)' : 'border-border-subtle bg-surface-raised text-ink hover:bg-surface-interactive'} disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {execution.execution_kind === 'tool'
                              ? `Abrir QA · ${execution.call_key || 'llamada'}`
                              : `Abrir llamada ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                      {trace.isLoading ? (
                        <div className="mt-4 h-16 animate-pulse rounded-xl bg-surface-raised motion-reduce:animate-none" />
                      ) : trace.error ? (
                        <p className="mt-4 text-sm text-ink-muted">No pudimos cargar el detalle de esta ejecución.</p>
                      ) : (
                        <ul className="mt-4 divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-raised">
                        {traceEntries.map((execution, index) => (
                          <li key={execution.id || `${execution.step_key}-${index}`} className="px-3 py-3">
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                              <span>
                                <p className="text-sm font-semibold text-ink">
                                  {execution.execution_kind === 'tool'
                                    ? `${execution.tool || 'Herramienta'} · ${execution.call_key || execution.step_key || 'QA de navegador'}`
                                    : execution.step_key}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-muted">
                                  {execution.execution_kind === 'tool' ? 'Herramienta verificada · ' : 'Agente · '}
                                  {execution.provider} · {execution.model} ·{' '}
                                  {execution.input_tokens.toLocaleString('es-MX')} entrada ·{' '}
                                  {execution.output_tokens.toLocaleString('es-MX')} salida ·{' '}
                                  {execution.cached_input_tokens.toLocaleString('es-MX')} caché
                                  {execution.cache_write_tokens > 0
                                    ? ` · ${execution.cache_write_tokens.toLocaleString('es-MX')} escritura`
                                    : ''}
                                  {execution.reasoning_tokens > 0
                                    ? ` · ${execution.reasoning_tokens.toLocaleString('es-MX')} razonamiento`
                                    : ''}
                                </p>
                              </span>
                              <span className="text-xs text-ink-muted tabular-nums">
                                {execution.total_tokens.toLocaleString('es-MX')} tokens
                              </span>
                              <span className="text-sm font-semibold text-ink tabular-nums">
                                {cost(execution.total_cost_microusd)}
                              </span>
                            </div>
                            <details className="mt-3 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">
                                Ver desglose de coste y precio aplicado
                              </summary>
                              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                <div className="flex items-center justify-between gap-3">
                                  <dt className="text-ink-muted">Entrada</dt>
                                  <dd className="font-medium text-ink tabular-nums">
                                    {cost(execution.input_cost_microusd)}
                                  </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <dt className="text-ink-muted">Salida</dt>
                                  <dd className="font-medium text-ink tabular-nums">
                                    {cost(execution.output_cost_microusd)}
                                  </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <dt className="text-ink-muted">Caché leída</dt>
                                  <dd className="font-medium text-ink tabular-nums">
                                    {cost(execution.cached_cost_microusd)}
                                  </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <dt className="text-ink-muted">Caché escrita</dt>
                                  <dd className="font-medium text-ink tabular-nums">
                                    {cost(execution.cache_write_cost_microusd)}
                                  </dd>
                                </div>
                              </dl>
                              <p className="mt-3 text-xs leading-5 text-ink-muted">
                                Base: {execution.pricing_basis || 'snapshot del proveedor'} · El request y response
                                privados se inspeccionan arriba y nunca se exponen desde este resumen.
                              </p>
                            </details>
                          </li>
                        ))}
                        </ul>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </section>
            <details className="order-3 premium-surface group rounded-3xl">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                    <ChatBubbleLeftRightIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">Añadir contexto al agente</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-muted">
                      {(item.messages?.length ?? 0) > 0
                        ? `${item.messages?.length} nota${item.messages?.length === 1 ? '' : 's'} registrada${item.messages?.length === 1 ? '' : 's'}`
                        : 'Sólo cuando haya una precisión relevante'}
                    </span>
                  </span>
                </span>
                <span className="inline-flex min-h-9 shrink-0 items-center rounded-xl bg-surface-soft px-3 text-xs font-semibold text-ink-secondary group-open:hidden">Abrir</span>
                <span className="hidden min-h-9 shrink-0 items-center rounded-xl bg-surface-interactive px-3 text-xs font-semibold text-ink-secondary group-open:inline">Cerrar</span>
              </summary>
              <div className="border-t border-border-subtle px-5 py-4 sm:px-6">
                {(item.messages?.length ?? 0) > 0 && (
                  <details className="rounded-2xl border border-border-subtle bg-surface-soft/65">
                    <summary className="cursor-pointer list-none px-3.5 py-3 text-xs font-semibold text-ink-secondary">
                      Ver historial de contexto ({item.messages?.length})
                    </summary>
                    <div className="max-h-72 space-y-3 overflow-y-auto border-t border-border-subtle p-3">
                      {(item.messages ?? []).map((entry) => (
                        <article key={entry.id} className="rounded-xl bg-surface-raised p-3">
                          <p className="text-xs font-semibold text-ink-secondary">
                            {entry.author_type === 'human' ? 'Humano' : 'Agente'} · {entry.phase}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-ink">{entry.body}</p>
                          <p className="mt-2 text-xs text-ink-muted">{date(entry.created_at)}</p>
                        </article>
                      ))}
                    </div>
                  </details>
                )}
                <form onSubmit={sendNote} className={(item.messages?.length ?? 0) > 0 ? 'mt-4' : ''}>
                  <label className="block text-sm font-medium text-ink">
                    Instrucción puntual
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={12000}
                      rows={3}
                      placeholder="Añade sólo la precisión que cambia el siguiente paso."
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-ink-muted">Sólo afecta el siguiente paso disponible.</p>
                  <Button type="submit" outline disabled={busy === 'note' || !note.trim()} className="mt-3">
                    <PaperAirplaneIcon data-slot="icon" />
                    Guardar contexto
                  </Button>
                </form>
              </div>
            </details>
            </div>
            )}
          </section>
          )}
          {consoleView === 'control' && (
          <aside className="order-first space-y-5 xl:order-none">
            <section className="premium-surface rounded-3xl p-5 sm:p-6">
              <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Decisión actual</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">
                {generatedPlanValidationInProgress
                  ? 'Validando propuesta del agente'
                  : hasGeneratedPlan
                  ? hasVersionedPlan
                    ? 'Enviar plan a revisión'
                    : 'Revisar propuesta del agente'
                  : activePhase?.label ?? 'Decisión humana requerida'}
              </h2>
              {gateReadiness.length > 0 && (
                <details className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft" aria-label="Estado de preparación del gate actual">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="text-xs font-semibold text-ink">{generatedPlanValidationInProgress ? 'Validando propuesta' : gateReadiness.every((entry) => entry.ready) ? 'Listo para decidir' : 'Falta preparación'}</span>
                    <Badge color={gateReadiness.every((entry) => entry.ready) ? 'emerald' : 'amber'}>
                      {gateReadiness.filter((entry) => entry.ready).length}/{gateReadiness.length}
                    </Badge>
                  </summary>
                  <div className="border-t border-border-subtle p-3">
                  <ul className="mt-3 space-y-2">
                    {gateReadiness.map((entry) => (
                      <li key={entry.label} className="flex gap-2 text-xs leading-5">
                        <span
                          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${entry.ready ? 'bg-emerald-500 text-white' : 'bg-amber-500/15 text-amber-700 dark:text-amber-200'}`}
                          aria-hidden="true"
                        >
                          {entry.ready ? <CheckCircleIcon className="size-3" /> : '·'}
                        </span>
                        <span>
                          <span className="font-semibold text-ink">{entry.label}</span>
                          <span className="text-ink-secondary"> · {entry.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  </div>
                </details>
              )}
              {hasGeneratedPlan && !hasVersionedPlan ? (
                <div className="mt-4 rounded-2xl border border-(--tenant-accent)/20 bg-(--tenant-accent)/5 p-4">
                  <p className="text-sm font-semibold text-ink">
                    {generatedPlanValidationInProgress ? 'El agente está comprobando que la propuesta tenga la validación necesaria.' : hasVersionedPlan ? 'La propuesta ya está versionada.' : 'Hay una propuesta nueva lista para revisar.'}
                  </p>
                  {generatedPlanResult.error && !hasVersionedPlan && (
                    <div role="alert" className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-3">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">No pudimos leer la validación de la propuesta.</p>
                      <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-200/80">El gate permanece protegido. Vuelve a intentar la lectura o replantea la propuesta si cambió el alcance.</p>
                      <Button outline onClick={() => void generatedPlanResult.mutate()} className="mt-3 min-h-10">
                        <ArrowPathIcon data-slot="icon" /> Reintentar lectura
                      </Button>
                    </div>
                  )}
                  {!hasVersionedPlan && !generatedPlanValidationInProgress && (
                    <>
                      {latestGeneratedPlanTask && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExecutionKind('agent')
                            setSelectedExecution('')
                            setSelectedResult(latestGeneratedPlanTask.id)
                            showConsoleView('activity', true)
                          }}
                          className="mt-3 inline-flex min-h-11 items-center gap-1.5 px-1 text-xs font-semibold text-(--tenant-accent) transition hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
                        >
                          Abrir propuesta
                          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <Button
                        color="indigo"
                        onClick={() => void promoteAgentPlan()}
                        disabled={busy === 'promote-plan' || !generatedPlanCanBeVersioned}
                        className="mt-3 w-full"
                      >
                        <ClipboardDocumentCheckIcon data-slot="icon" />
                        {busy === 'promote-plan'
                          ? 'Versionando propuesta…'
                          : generatedPlanResult.error
                            ? 'No se pudo validar la propuesta'
                            : generatedPlanNeedsStagehandCases
                              ? 'Corrige los casos E2E antes de versionar'
                              : 'Versionar propuesta para revisar'}
                      </Button>
                      {generatedPlanNeedsStagehandCases && <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-xs leading-5 text-amber-900">Faltan recorridos de navegador para validar la propuesta. El gate permanece protegido hasta que una nueva versión incluya casos E2E acotados.</p>}
                    </>
                  )}
                  <details
                    open={newProposalOpen}
                    onToggle={(event) => setNewProposalOpen(event.currentTarget.open)}
                    className="mt-3 border-t border-(--tenant-accent)/15 pt-3"
                  >
                    <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">
                      Replantear propuesta
                    </summary>
                    {newProposalOpen && (
                      <>
                        <p className="mt-2 text-xs leading-5 text-ink-muted">
                          Úsalo sólo si cambió el alcance, el contexto o la validación. La propuesta actual se conserva como historial.
                        </p>
                        <textarea
                          value={instructions}
                          onChange={(event) => setInstructions(event.target.value)}
                          rows={3}
                          maxLength={12000}
                          placeholder="Indica qué debe replantearse (opcional)."
                          className="mt-3 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                        />
                        <Button outline onClick={() => void startRun()} disabled={busy === 'run'} className="mt-3 w-full">
                          <PlayIcon data-slot="icon" />
                          {busy === 'run' ? 'Encolando…' : 'Generar nueva propuesta'}
                        </Button>
                      </>
                    )}
                  </details>
                </div>
              ) : !hasVersionedPlan && activePhase && (
                <>
                  <details
                    open={phaseContextOpen}
                    onToggle={(event) => setPhaseContextOpen(event.currentTarget.open)}
                    className="mt-4 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2"
                  >
                    <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">Añadir contexto para este paso (opcional)</summary>
                    {phaseContextOpen && (
                      <textarea
                        value={instructions}
                        onChange={(event) => setInstructions(event.target.value)}
                        rows={3}
                        maxLength={12000}
                        placeholder="Sólo si el agente necesita una precisión adicional."
                        className="mt-3 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm"
                      />
                    )}
                  </details>
                  <Button
                    color="indigo"
                    onClick={() => void startRun()}
                    disabled={busy === 'run'}
                    className="mt-3 w-full"
                  >
                    <PlayIcon data-slot="icon" />
                    {busy === 'run' ? 'Iniciando movimiento…' : 'Iniciar siguiente movimiento'}
                  </Button>
                </>
              )}
              {gateTransitions.length > 1 && activeGateTransition && (
                <div className="mt-4 border-t border-border-subtle pt-4">
                  <p className="text-xs font-semibold tracking-[.12em] text-ink-muted uppercase">Decisión</p>
                  <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Elegir decisión">
                    {gateTransitions.map((transition) => (
                      <button
                        key={transition.action}
                        type="button"
                        aria-pressed={transition.action === activeGateAction}
                        onClick={() => setSelectedGateAction(transition.action)}
                        className={`min-h-11 rounded-xl border px-3 text-left text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) ${transition.action === activeGateAction ? transition.tone === 'rose' ? 'border-rose-500/35 bg-rose-500/[.07] text-rose-700' : 'border-(--tenant-accent)/35 bg-(--tenant-accent)/[.08] text-(--tenant-accent)' : 'border-border-subtle bg-surface-soft text-ink-secondary hover:bg-surface-interactive'}`}
                      >
                        {transition.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {transitions
                // A generated plan first becomes a reviewed, immutable
                // proposal. Do not show the later gate action beside the
                // validation/versioning CTA: it reads as a second primary
                // action and could imply the agent can skip its own review.
                .filter((transition) => transition.action !== 'submit_plan' || hasVersionedPlan)
                .filter((transition) => !humanGateActions.has(transition.action) || transition.action === activeGateAction)
                .map((transitionItem) => {
                const waitingForResult = humanTransitionAwaitsAgentResult(transitionItem.action, completedOperations)
                const decisionCopy = gateDecisionCopy(transitionItem.action)
                return (
                  <div key={transitionItem.action} className="mt-4 border-t border-border-subtle pt-4">
                    <details className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${transitionItem.tone === 'rose' ? 'bg-rose-500/[0.06] text-rose-800 dark:text-rose-200' : 'bg-(--tenant-accent)/[0.06] text-ink-secondary'}`}>
                      <summary className="cursor-pointer list-none font-semibold marker:hidden">Ver qué ocurre después</summary>
                      <div className="mt-2 flex items-start gap-2">
                      <ArrowRightIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span><span className="font-semibold text-ink">Después:</span> {nextAgentMoveAfterGate(transitionItem.action)}</span>
                      </div>
                    </details>
                    {humanGateActions.has(transitionItem.action) ? (
                      <div className="mt-3 rounded-2xl border border-border-subtle bg-surface-soft/65 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold tracking-[.12em] text-ink-muted uppercase">Confirmación</p>
                          {decisionCopy.quickConfirmation && !comment.trim() && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                              Lista para aprobar
                            </span>
                          )}
                        </div>
                        {decisionCopy.quickConfirmation ? (
                          <details className="mt-3 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2">
                            <summary className="min-h-9 cursor-pointer py-1 text-xs font-semibold text-ink-secondary">
                              Añadir nota o comprobaciones (opcional)
                            </summary>
                            <div className="border-t border-border-subtle pt-3">
                              <label className="block text-xs font-medium text-ink-secondary">
                                Nota para el historial
                                <textarea
                                  value={comment}
                                  onChange={(event) => setComment(event.target.value)}
                                  rows={2}
                                  maxLength={12000}
                                  placeholder={decisionCopy.placeholder}
                                  className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="mt-3 block text-xs font-medium text-ink-secondary">
                                {decisionCopy.evidence}
                                <textarea
                                  value={evidenceChecklist}
                                  onChange={(event) => setEvidenceChecklist(event.target.value)}
                                  rows={2}
                                  maxLength={12000}
                                  placeholder="Una comprobación por línea: resultado, CI, preview o QA."
                                  className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                                />
                              </label>
                              <p className="mt-2 text-[11px] leading-4 text-ink-muted">Se conserva junto con esta decisión.</p>
                            </div>
                          </details>
                        ) : (
                          <>
                            <label className="mt-3 block text-xs font-medium text-ink-secondary">
                              {decisionCopy.note} <span className="text-rose-600">*</span>
                              <textarea
                                value={comment}
                                onChange={(event) => setComment(event.target.value)}
                                rows={3}
                                maxLength={12000}
                                placeholder={decisionCopy.placeholder}
                                className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                              />
                              <span className="mt-1 block text-[11px] leading-4 text-ink-muted">Queda guardado en el historial del gate.</span>
                            </label>
                            <details className="mt-3 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">Añadir comprobaciones separadas</summary>
                              <label className="mt-3 block text-xs font-medium text-ink-secondary">
                                {decisionCopy.evidence}
                                <textarea
                                  value={evidenceChecklist}
                                  onChange={(event) => setEvidenceChecklist(event.target.value)}
                                  rows={2}
                                  maxLength={12000}
                                  placeholder="Una comprobación por línea: resultado, CI, preview o QA."
                                  className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                                />
                              </label>
                            </details>
                          </>
                        )}
                      </div>
                    ) : (
                      <details className="rounded-xl border border-border-subtle bg-surface-soft px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">Añadir nota al envío (opcional)</summary>
                        <textarea
                          value={comment}
                          onChange={(event) => setComment(event.target.value)}
                          rows={3}
                          maxLength={12000}
                          placeholder="Qué revisaste o qué debe saber el siguiente paso."
                          className="mt-3 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm"
                        />
                      </details>
                    )}
                    {transitionItem.action === 'preview_ready' && (
                      <p className="mt-3 rounded-xl bg-surface-soft p-3 text-xs leading-5 text-ink-secondary">
                        {previewReady
                          ? usesRepositoryCoverage
                            ? 'La publicación de todos los repositorios con cambios está comprobada y hay un preview trazable listo para QA.'
                            : 'El preview ya está registrado en el cambio trazable.'
                          : usesRepositoryCoverage
                            ? 'Completa la matriz: cada repositorio con cambios requiere publicación comprobada por GitHub App; además, uno debe aportar un preview HTTP(S) trazable.'
                            : 'Registra una URL de preview en el cambio antes de iniciar QA.'}
                      </p>
                    )}
                    {transitionItem.action === 'submit_code_review' && (
                      <p className="mt-3 rounded-xl bg-surface-soft p-3 text-xs leading-5 text-ink-secondary">
                        {reviewableChangeReady
                          ? usesRepositoryCoverage
                            ? 'Cada repositorio marcado con cambios tiene una revisión trazable y CI aprobada.'
                            : 'El PR y su CI aprobada ya están registrados en el cambio trazable.'
                          : usesRepositoryCoverage
                            ? 'Falta una revisión trazable con CI aprobada en alguno de los repositorios marcados con cambios en el plan.'
                            : 'Antes de enviar a revisión, registra una revisión remota o un worktree local aislado con CI en estado “passed”.'}
                      </p>
                    )}
                    <Button
                      color={transitionItem.tone ?? 'indigo'}
                      onClick={() => void transition(transitionItem.action, decisionCopy.quickConfirmation)}
                      disabled={
                        busy === transitionItem.action ||
                        waitingForResult ||
                        (humanGateActions.has(transitionItem.action) && !comment.trim() && !decisionCopy.quickConfirmation) ||
                        (transitionItem.action === 'submit_plan' && !hasGeneratedPlan) ||
                        (transitionItem.action === 'preview_ready' && !previewReady) ||
                        (transitionItem.action === 'submit_code_review' && !reviewableChangeReady)
                      }
                      className="mt-3 w-full"
                    >
                      {busy === transitionItem.action
                        ? 'Guardando…'
                        : waitingForResult
                          ? 'Esperando resultado del agente'
                          : transitionItem.label}
                    </Button>
                  </div>
                )
              })}
            </section>
            <details className={`premium-surface group rounded-3xl ${consoleView === 'control' ? '' : 'hidden'}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <span>
                  <span className="block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Historial</span>
                  <span className="mt-1 block text-sm font-semibold text-ink">Decisiones registradas</span>
                </span>
                <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-xs font-semibold text-ink-secondary">
                  {item.gates?.length ?? 0} gate{(item.gates?.length ?? 0) === 1 ? '' : 's'}
                </span>
              </summary>
              <div className="border-t border-border-subtle px-5 py-4">
                {(item.gates?.length ?? 0) === 0 ? (
                  <p className="text-sm leading-6 text-ink-muted">Aún no hay decisiones registradas.</p>
                ) : (
                  <ol className="space-y-3">
                    {item.gates?.map((gate) => {
                      const approved = gate.decision === 'approved'
                      return (
                        <li key={gate.id} className="rounded-2xl border border-border-subtle bg-surface-soft p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-ink">{gateLabel[gate.kind] ?? gate.kind}</p>
                            <Badge color={approved ? 'emerald' : 'rose'}>{approved ? 'Aprobado' : 'Cambios pedidos'}</Badge>
                          </div>
                          {gate.comment && <p className="mt-2 text-sm leading-5 text-ink-secondary">{gate.comment}</p>}
                          <p className="mt-2 text-xs text-ink-muted">{date(gate.decided_at)}</p>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </details>
            <details open={item.state === 'preview_pending'} className={`premium-surface group rounded-3xl ${consoleView === 'control' ? '' : 'hidden'}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <span>
                  <span className="block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Control de publicación</span>
                  <span className="mt-1 block text-sm font-semibold text-ink">{item.state === 'preview_pending' ? 'Autorizar publicación' : 'Permisos temporales'}</span>
                </span>
                <Badge
                  color={
                    item.publication_grants?.some(
                      (grant) => !grant.revoked_at && new Date(grant.expires_at).getTime() > publicationTime
                    )
                      ? 'emerald'
                      : 'amber'
                  }
                >
                  {item.publication_grants?.some(
                    (grant) => !grant.revoked_at && new Date(grant.expires_at).getTime() > publicationTime
                  )
                      ? 'Vigente'
                      : item.state === 'preview_pending'
                        ? 'Acción disponible'
                        : 'Sin permiso activo'}
                </Badge>
              </summary>
              <div className="border-t border-border-subtle px-5 py-4">
              {publicationReadiness.data && (
                <div
                  className={`rounded-2xl border p-3 ${publicationIntegrationReady ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-ink">Integración</p>
                      <p className="mt-0.5 text-xs leading-5 text-ink-secondary">{publicationReadiness.data.message}</p>
                    </div>
                    <Badge color={publicationIntegrationReady ? 'emerald' : 'amber'}>
                      {publicationIntegrationReady
                        ? 'Lista'
                        : publicationReadiness.data.state === 'invalid'
                          ? 'Requiere corrección'
                          : 'Sin configurar'}
                    </Badge>
                  </div>
                  {publicationIntegrationReady && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        color="indigo"
                        onClick={() => void verifyPublicationIntegration()}
                        disabled={busy === 'verify-publication-integration'}
                        className="min-h-9 px-3 text-xs"
                      >
                        {busy === 'verify-publication-integration' ? 'Verificando…' : 'Verificar conexión'}
                      </Button>
                      {publicationVerification && (
                        <span className="text-xs text-emerald-700">
                          Verificada {date(publicationVerification.checked_at)}
                        </span>
                      )}
                    </div>
                  )}
                  {(publicationReadiness.data.requirements?.length ?? 0) > 0 && (
                    <details className="mt-3 border-t border-current/10 pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">Ver requisitos de integración</summary>
                      <ol className="mt-3 grid gap-2 text-xs leading-5 text-ink-secondary">
                        {publicationReadiness.data.requirements?.map((requirement, index) => (
                          <li key={requirement} className="flex gap-2">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-ink">
                              {index + 1}
                            </span>
                            <span>{requirement}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              )}
              {item.state === 'preview_pending' &&
                (reviewedPublicationReady && reviewedPublicationChange?.branch ? (
                  <div className="mt-4 rounded-2xl border border-(--tenant-accent)/20 bg-(--tenant-accent)/[0.045] p-3">
                    {reviewedPublicationChanges.length > 1 && (
                      <label className="mt-3 block text-xs font-medium text-ink-secondary">
                        Repositorio a autorizar
                        <select
                          value={reviewedPublicationChange.repository_ref}
                          onChange={(event) => setPublicationRepositoryRef(event.target.value)}
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink"
                        >
                          {reviewedPublicationChanges.map((change) => {
                            const metadata = metadataRecord(change.metadata)
                            const remote =
                              typeof metadata.github_repository === 'string' ? metadata.github_repository : ''
                            const alreadyGranted = activePublicationGrants.some(
                              (grant) =>
                                grant.repository_ref === change.repository_ref && grant.branch === change.branch
                            )
                            return (
                              <option key={`${change.repository_ref}:${change.branch}`} value={change.repository_ref}>
                                {remote || change.repository_ref}
                                {alreadyGranted ? ' · autorización vigente' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </label>
                    )}
                    <p className="text-xs font-semibold text-ink">Autorizar la publicación revisada</p>
                    <p className="mt-1 text-xs leading-5 break-all text-ink-secondary">
                      {reviewedPublicationChange.branch} · base {reviewedBaseSHA.slice(0, 12)}…
                    </p>
                    <div className="mt-2 grid gap-1 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-xs leading-5 text-ink-secondary sm:grid-cols-2">
                      <p className="break-all">
                        <span className="text-ink-muted">Repositorio GitHub: </span>
                        {reviewedGitHubRepository}
                      </p>
                      <p className="break-all">
                        <span className="text-ink-muted">Diff revisado: </span>
                        {reviewedDiffSHA256.slice(0, 16)}…
                      </p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink-muted">
                      La rama, base, repositorio remoto y huella del diff provienen del worktree validado; no se editan
                      aquí.
                    </p>
                    <label className="mt-3 block text-xs font-medium text-ink-secondary">
                      Motivo de autorización <span className="text-rose-600">*</span>
                      <textarea
                        value={publicationReason}
                        onChange={(event) => setPublicationReason(event.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="Qué revisaste y por qué autorizas publicar esta rama."
                        className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium text-ink-secondary">
                        Vigencia
                        <select
                          value={publicationExpiry}
                          onChange={(event) => setPublicationExpiry(event.target.value)}
                          className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm"
                        >
                          <option value="5">5 minutos</option>
                          <option value="15">15 minutos</option>
                          <option value="30">30 minutos</option>
                          <option value="60">60 minutos</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-2 self-end rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-xs font-medium text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={createPullRequest}
                          onChange={(event) => setCreatePullRequest(event.target.checked)}
                        />{' '}
                        Crear pull request
                      </label>
                    </div>
                    <div className="mt-3 grid gap-2 rounded-xl border border-border-subtle bg-surface-raised p-3 text-xs leading-5 sm:grid-cols-2">
                      <div>
                        <p className="font-semibold text-ink">Este permiso sí habilita</p>
                        <p className="mt-1 text-ink-secondary">
                          Crear el commit revisado y publicar sólo esta rama{createPullRequest ? ', además de abrir su pull request.' : '.'}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-ink">Nunca habilita</p>
                        <p className="mt-1 text-ink-secondary">
                          Merge a ramas protegidas, despliegues, cambios de secretos ni publicaciones fuera del diff aprobado.
                        </p>
                      </div>
                    </div>
                    <Button
                      color="indigo"
                      onClick={() => void createPublicationGrant()}
                      disabled={
                        busy === 'publication-grant' ||
                        !publicationReason.trim() ||
                        !publicationIntegrationReady ||
                        !reviewedPublicationReady ||
                        Boolean(activePublicationGrantForReviewedChange)
                      }
                      className="mt-3 w-full"
                    >
                      {busy === 'publication-grant'
                        ? 'Autorizando…'
                        : activePublicationGrantForReviewedChange
                          ? 'Permiso vigente para este repositorio'
                          : publicationIntegrationReady
                            ? 'Emitir permiso temporal'
                            : 'Integración pendiente'}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-border-subtle bg-surface-soft p-3 text-xs leading-5 text-ink-muted">
                    Para autorizar publicación falta un worktree local aprobado con validaciones pasadas. El agente no
                    puede omitir ese requisito.
                  </div>
                ))}
              {(item.publication_grants?.length ?? 0) === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-border-subtle bg-surface-soft p-3 text-xs leading-5 text-ink-muted">
                  El trabajo permanece en worktree local. Cuando exista una integración GitHub App configurada y el gate
                  de código esté aprobado, aquí quedará el permiso auditable de publicación.
                </div>
              ) : (
                <ol className="mt-4 space-y-3">
                  {item.publication_grants?.map((grant) => {
                    const active = !grant.revoked_at && new Date(grant.expires_at).getTime() > publicationTime
                    return (
                      <li key={grant.id} className="rounded-2xl border border-border-subtle bg-surface-soft p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">
                            {active
                              ? 'Autorización vigente'
                              : grant.revoked_at
                                ? 'Autorización revocada'
                                : 'Autorización vencida'}
                          </p>
                          <Badge color={active ? 'emerald' : 'zinc'}>{active ? 'Controlada' : 'Inactiva'}</Badge>
                        </div>
                        <p className="mt-1 text-xs break-all text-ink-secondary">
                          {grant.repository_ref} · {grant.branch}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-ink-muted">
                          Base {grant.base_sha} · expira {date(grant.expires_at)}
                        </p>
                        {(grant.github_repository || grant.review_diff_sha256) && (
                          <div className="mt-2 grid gap-1 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-xs leading-5 text-ink-secondary sm:grid-cols-2">
                            {grant.github_repository && (
                              <p className="break-all">
                                <span className="text-ink-muted">Repositorio GitHub: </span>
                                {grant.github_repository}
                              </p>
                            )}
                            {grant.review_diff_sha256 && (
                              <p className="break-all">
                                <span className="text-ink-muted">Diff autorizado: </span>
                                {grant.review_diff_sha256.slice(0, 16)}…
                              </p>
                            )}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {publicationCapabilities(grant.capabilities).map((capability) => (
                            <span
                              key={capability}
                              className="rounded-full bg-surface-raised px-2 py-1 text-[11px] font-medium text-ink-secondary"
                            >
                              {capability}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-ink-secondary">{grant.reason}</p>
                        {grant.revocation_reason && (
                          <p className="mt-1 text-xs leading-5 text-rose-700">Revocada: {grant.revocation_reason}</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
              {activePublicationGrant && (
                <div className="mt-4 border-t border-border-subtle pt-4">
                  <label className="block text-xs font-medium text-ink-secondary">
                    Revocar permiso activo
                    <textarea
                      value={revocationReason}
                      onChange={(event) => setRevocationReason(event.target.value)}
                      rows={2}
                      maxLength={4000}
                      placeholder="Motivo de revocación requerido."
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <Button
                    outline
                    onClick={() => void revokePublicationGrant()}
                    disabled={busy === 'revoke-publication-grant' || !revocationReason.trim()}
                    className="mt-3 w-full text-rose-700"
                  >
                    {busy === 'revoke-publication-grant' ? 'Revocando…' : 'Revocar permiso'}
                  </Button>
                </div>
              )}
              </div>
            </details>
          </aside>
          )}
        </div>
        </div>
      </main>
    </PageTransition>
  )
}
