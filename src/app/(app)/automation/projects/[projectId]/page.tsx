'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@/components/dialog'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { deliveryWorkItemStreamEnabled, useDeliveryWorkItemStream } from '@/features/automation/use-delivery-work-item-stream'
import { hasCancellationRequest, hasUnresolvedTaskFailure } from '@/features/automation/delivery-task-status'
import { RepositoryOnboardingPanel } from '@/features/automation/repository-onboarding-panel'
import type {
  DeliveryContextSource,
  DeliveryProject,
  DeliveryProjectBudget,
  DeliveryPublicationReadiness,
  DeliveryRequest,
  DeliveryWorkItem,
} from '@/features/automation/delivery-types'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  automationHealthPath,
  deliveryProjectBudgetPath,
  deliveryProjectContextMetadataPath,
  deliveryProjectContextPath,
  deliveryProjectContextRefreshPath,
  deliveryProjectCostsPath,
  deliveryProjectLocalContextRefreshPath,
  deliveryProjectLocalRemoteFetchPath,
  deliveryProjectMembersPath,
  deliveryProjectPath,
  deliveryProjectPublicationReadinessPath,
  deliveryProjectRequestsPath,
  deliveryProjectWorkItemsPath,
  deliveryWorkItemAgentRunsPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DocumentPlusIcon,
  FolderOpenIcon,
  PlusIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { FormEvent, useRef, useState } from 'react'
import useSWR from 'swr'

const contextKinds = [
  'repository',
  'document',
  'design',
  'client_conversation',
  'decision',
  'runbook',
  'environment',
] as const

// A product can be one delivery project while spanning several repositories.
// This describes the operational surface of each repository; it is distinct
// from primary/supporting, which controls the bounded implementation worktree.
const repositoryKinds = [
  { value: 'unclassified', label: 'Sin clasificar todavía' },
  { value: 'frontend', label: 'Frontend / experiencia visual' },
  { value: 'backend_api', label: 'Backend / API' },
  { value: 'worker', label: 'Worker asíncrono' },
  { value: 'lambda', label: 'Lambda / función serverless' },
  { value: 'infrastructure', label: 'Infraestructura / IaC' },
  { value: 'shared_package', label: 'Paquete o contrato compartido' },
  { value: 'data', label: 'Datos / migraciones / analítica' },
  { value: 'automation', label: 'Automatización / agente' },
] as const

function repositoryKindLabel(value: unknown) {
  const key = typeof value === 'string' ? value : 'unclassified'
  return repositoryKinds.find((kind) => kind.value === key)?.label ?? 'Sin clasificar todavía'
}

function list(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

const stateLabel: Record<string, string> = {
  planning: 'Planificación',
  plan_review: 'Revisión del plan',
  implementation: 'Implementación',
  code_review: 'Revisión de código',
  preview_pending: 'Preview pendiente',
  qa_running: 'QA en curso',
  qa_review: 'Revisión QA',
  release_review: 'Revisión final',
  released: 'Entregado',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
}

function displayDate(value?: string) {
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Sin fecha'
}

function compactIdentity(value: string) {
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

// GORM persists Delivery metadata as JSONB but its current HTTP model returns
// the JSON document as a string. Decode defensively at the UI boundary so a
// malformed legacy row degrades to “no metadata” instead of silently changing
// topology, permissions or readiness decisions in the operator experience.
function contextMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || value.trim() === '') return {}
  try {
    const decoded: unknown = JSON.parse(value)
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? (decoded as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function isWorkspaceRepository(source: DeliveryContextSource) {
  return source.kind === 'repository' && source.reference.startsWith('workspace://')
}

function isRemoteMetadataRepository(source: DeliveryContextSource) {
  return source.kind === 'repository' && source.reference.startsWith('github://')
}

function remoteRepositoryMapFileCount(source: DeliveryContextSource) {
  const value = source.metadata?.github_code_map
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  const count = (value as Record<string, unknown>).file_count
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 0
}

type RemoteSourceContextSummary = {
  excerpts: string[]
  redactedValues: number
}

// The project surface exposes only safe filenames and the redaction count.
// Source bodies remain private planning context and never imply write access.
function remoteRepositorySourceContext(source: DeliveryContextSource): RemoteSourceContextSummary | null {
  const value = source.metadata?.github_code_context
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const context = value as Record<string, unknown>
  const rawExcerpts = Array.isArray(context.excerpts) ? context.excerpts : []
  const excerpts = rawExcerpts
    .map((entry) =>
      entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>).path : ''
    )
    .filter((path): path is string => typeof path === 'string' && path.length > 0)
    .slice(0, 8)
  if (excerpts.length === 0) return null
  const redactedValues =
    typeof context.redacted_values === 'number' &&
    Number.isInteger(context.redacted_values) &&
    context.redacted_values > 0
      ? context.redacted_values
      : 0
  return { excerpts, redactedValues }
}

function knownRemoteAhead(source: DeliveryContextSource) {
  const value = source.metadata?.remote_ahead
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

function isDirtyWorkspace(source: DeliveryContextSource) {
  return source.metadata?.local_workspace_dirty === true
}

function workspaceCanFetchRemote(source: DeliveryContextSource) {
  return (
    isWorkspaceRepository(source) &&
    Array.isArray(source.metadata?.workspace_capabilities) &&
    source.metadata.workspace_capabilities.includes('repository:fetch')
  )
}

function workspaceCapabilityPresentation(capability: string) {
  const labels: Record<string, { label: string; tone: 'neutral' | 'controlled' }> = {
    'repository:read': { label: 'Lectura de repositorio', tone: 'neutral' },
    'repository:fetch': { label: 'Actualizar referencias remotas', tone: 'neutral' },
    'worktree:create': { label: 'Crear worktree aislado', tone: 'neutral' },
    'patch:apply': { label: 'Aplicar cambios acotados', tone: 'neutral' },
    'commit:stage': { label: 'Commit local tras gate de código', tone: 'controlled' },
    'branch:publish': { label: 'Publicar rama con grant humano', tone: 'controlled' },
    'pull_request:create': { label: 'Crear PR con grant humano', tone: 'controlled' },
  }
  return labels[capability] ?? { label: capability, tone: 'neutral' as const }
}

function workspaceHarnessLabels(source: DeliveryContextSource) {
  const value = source.metadata?.workspace_harness
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [] as string[]
  const harness = value as Record<string, unknown>
  const labels: string[] = []
  const validation = harness.validation_command_count
  const qa = harness.qa_command_count
  if (typeof validation === 'number' && Number.isInteger(validation) && validation > 0) {
    labels.push(`${validation} validaci${validation === 1 ? 'ón' : 'ones'}`)
  }
  if (typeof qa === 'number' && Number.isInteger(qa) && qa > 0) {
    labels.push(`${qa} prueba${qa === 1 ? '' : 's'} QA`)
  }
  if (harness.artifact_collection === true) labels.push('Artefactos')
  if (harness.screenshot_mode === 'configured_command') labels.push('Captura configurada')
  if (harness.screenshot_mode === 'responsive_default') labels.push('Capturas responsive')
  if (harness.semantic_qa_mode === 'configured_command') labels.push('QA semántico con IA')
  // Keep this label ASCII-safe because older local shells can otherwise
  // double-encode Spanish accents in the generated dashboard source.
  if (harness.semantic_qa_mode === 'configured_command') labels[labels.length - 1] = 'QA semantico con IA'
  return labels
}

// Keep the visible QA contract ASCII-safe. Local development on Windows can
// otherwise double-encode labels even though the capability metadata itself
// is valid. This is the reviewer-facing summary, not a source of execution
// authority: the backend still enforces the configured harness.
function workspaceQAContractLabels(source: DeliveryContextSource) {
  const value = source.metadata?.workspace_harness
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [] as string[]
  const harness = value as Record<string, unknown>
  const labels: string[] = []
  const validation = harness.validation_command_count
  const qa = harness.qa_command_count
  if (typeof validation === 'number' && Number.isInteger(validation) && validation > 0) {
    labels.push(`${validation} validacion${validation === 1 ? '' : 'es'}`)
  }
  if (typeof qa === 'number' && Number.isInteger(qa) && qa > 0) {
    labels.push(`${qa} prueba${qa === 1 ? '' : 's'} QA`)
  }
  if (harness.artifact_collection === true) labels.push('Artefactos privados')
  if (harness.screenshot_mode === 'configured_command' || harness.screenshot_mode === 'responsive_default')
    labels.push('Capturas responsive')
  if (harness.semantic_qa_mode === 'configured_command') labels.push('Stagehand + IA')
  return labels
}

type WorkspaceArchitectureSignals = {
  runtimes: string[]
  entrypoints: string[]
  testRoots: string[]
  documentation: string[]
}

function boundedMetadataStrings(value: unknown, maximum = 4) {
  if (!Array.isArray(value)) return [] as string[]
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 240)
    .slice(0, maximum)
}

// These are observation signals from the safe workspace inventory, not an
// architectural verdict made by the UI. A person chooses the repository type
// after seeing the runtime, entrypoint and verification evidence.
function workspaceArchitectureSignals(source: DeliveryContextSource): WorkspaceArchitectureSignals {
  const value = source.metadata?.workspace_architecture
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { runtimes: [], entrypoints: [], testRoots: [], documentation: [] }
  }
  const architecture = value as Record<string, unknown>
  return {
    runtimes: boundedMetadataStrings(architecture.runtime_hints),
    entrypoints: boundedMetadataStrings(architecture.entrypoint_paths),
    testRoots: boundedMetadataStrings(architecture.test_roots, 3),
    documentation: boundedMetadataStrings(architecture.documentation_paths, 3),
  }
}

function WorkspaceArchitectureSignals({
  source,
  compact = false,
}: {
  source: DeliveryContextSource
  compact?: boolean
}) {
  if (!isWorkspaceRepository(source)) return null
  const architecture = workspaceArchitectureSignals(source)
  const observed =
    architecture.runtimes.length +
    architecture.entrypoints.length +
    architecture.testRoots.length +
    architecture.documentation.length
  if (observed === 0) {
    return (
      <p className={compact ? 'mt-2 text-[10px] leading-4 text-ink-muted' : 'mt-3 text-xs leading-5 text-ink-muted'}>
        El inventario seguro aparecerá al actualizar el checkpoint.
      </p>
    )
  }
  return (
    <div className={compact ? 'mt-3 border-t border-border-subtle pt-3' : 'mt-3 border-t border-border-subtle pt-3'}>
      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-muted uppercase">Señales observadas</p>
      {architecture.runtimes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {architecture.runtimes.map((runtime) => (
            <span
              key={runtime}
              className="rounded-full bg-sky-500/[0.09] px-2 py-1 font-mono text-[10px] font-medium text-sky-900"
            >
              {runtime}
            </span>
          ))}
        </div>
      )}
      {!compact && architecture.entrypoints.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] text-ink-muted">Entradas detectadas</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {architecture.entrypoints.map((entrypoint) => (
              <span
                key={entrypoint}
                className="max-w-full truncate rounded-md bg-surface-raised px-2 py-1 font-mono text-[10px] text-ink-secondary"
                title={entrypoint}
              >
                {entrypoint}
              </span>
            ))}
          </div>
        </div>
      )}
      {!compact && architecture.testRoots.length > 0 && (
        <p className="mt-2 text-[11px] leading-5 text-ink-muted">
          Pruebas detectadas: {architecture.testRoots.join(', ')}
        </p>
      )}
    </div>
  )
}

function localChangeCount(source: DeliveryContextSource) {
  const value = source.metadata?.local_change_count
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function usdFromMicros(value?: number) {
  return `$${((value ?? 0) / 1_000_000).toFixed(4)}`
}

type DeliveryProjectCosts = {
  summary: CostLedgerTotals & { executions: number; work_items: number }
  by_step: Array<
    CostLedgerTotals & {
      key: string
      execution_kind: 'agent' | 'tool'
      tool?: string
      executions: number
      work_items: number
    }
  >
  by_work_item: Array<CostLedgerTotals & { work_item_id: string; work_item_title: string; executions: number }>
}

type DeliveryWorkspaceReadiness = {
  id: string
  ready: boolean
  qa_ready: boolean
  visual_qa_ready: boolean
  publication_ready: boolean
  validation_command_count: number
  qa_command_count: number
}

type AutomationRuntimeHealth = {
  workers?: Array<{ workspace_readiness?: DeliveryWorkspaceReadiness[] }>
}

function runtimeReadinessForWorkspace(runtime: AutomationRuntimeHealth | undefined, source: DeliveryContextSource) {
  if (!isWorkspaceRepository(source)) return undefined
  const workspaceID = source.reference.slice('workspace://'.length)
  for (const worker of runtime?.workers ?? []) {
    const match = worker.workspace_readiness?.find((workspace) => workspace.id === workspaceID)
    if (match) return match
  }
  return undefined
}

type CostLedgerTotals = {
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
}

function costPhaseLabel(value: string) {
  const key = value.replace(/^delivery\./, '')
  return (
    (
      {
        plan: 'Plan',
        implementation: 'Implementación',
        publish: 'Publicación',
        qa: 'QA',
        summary: 'Entrega',
      } as Record<string, string>
    )[key] ?? value
  )
}

const deliveryPhases = [
  { key: 'planning', label: 'Plan' },
  { key: 'implementation', label: 'Construir' },
  { key: 'qa', label: 'Validar' },
  { key: 'release', label: 'Entregar' },
] as const

const reviewStates = new Set(['plan_review', 'code_review', 'qa_review', 'release_review'])
const completedStates = new Set(['released', 'cancelled'])

function isReviewState(state: string) {
  return reviewStates.has(state)
}

function workItemTone(state: string): 'emerald' | 'amber' | 'rose' | 'indigo' | 'zinc' {
  if (state === 'released') return 'emerald'
  if (state === 'blocked') return 'rose'
  if (state === 'cancelled') return 'zinc'
  if (isReviewState(state)) return 'amber'
  if (state === 'planning' || state === 'implementation' || state === 'qa_running') return 'indigo'
  return 'zinc'
}

function workItemNeedsAttention(workItem: DeliveryWorkItem) {
  if (hasCancellationRequest(workItem.automation_tasks ?? [])) return false
  return (
    workItem.state === 'blocked' ||
    hasUnresolvedTaskFailure(workItem.automation_tasks ?? [])
  )
}

function prioritizedWorkItem(workItems: readonly DeliveryWorkItem[]) {
  const priority = (workItem: DeliveryWorkItem) => {
    if (workItemNeedsAttention(workItem)) return 0
    if (isReviewState(workItem.state)) return 1
    if (hasCancellationRequest(workItem.automation_tasks ?? [])) return 2
    if ((workItem.automation_tasks ?? []).some((task) => task.status === 'running' || task.status === 'queued')) return 3
    return 4
  }

  return workItems
    .filter((workItem) => !completedStates.has(workItem.state))
    .toSorted(
      (left, right) =>
        priority(left) - priority(right) ||
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
    )[0]
}

function workItemOperationalLabel(workItem: DeliveryWorkItem) {
  const tasks = workItem.automation_tasks ?? []
  if (hasCancellationRequest(tasks)) return 'Deteniéndose'
  if (workItemNeedsAttention(workItem)) return 'Ejecución detenida'
  if (workItem.state === 'planning' && tasks.some((task) => task.operation === 'delivery.plan' && task.status === 'completed')) return 'Propuesta preparada'
  if (!tasks.some((task) => task.status === 'running' || task.status === 'queued') && tasks.some((task) => task.status === 'cancelled')) return 'Ejecución cancelada'
  return stateLabel[workItem.state] ?? workItem.state
}

function workItemOperationalTone(workItem: DeliveryWorkItem) {
  const tasks = workItem.automation_tasks ?? []
  if (hasCancellationRequest(tasks) || (!tasks.some((task) => task.status === 'running' || task.status === 'queued') && tasks.some((task) => task.status === 'cancelled'))) return 'zinc' as const
  if (workItemNeedsAttention(workItem)) return 'rose' as const
  return workItemTone(workItem.state)
}

function workItemPhase(state: string) {
  if (state === 'planning' || state === 'plan_review') return 0
  if (state === 'implementation' || state === 'code_review') return 1
  if (state === 'preview_pending' || state === 'qa_running' || state === 'qa_review') return 2
  return 3
}

function taskPulseTone(status: string) {
  if (status === 'completed') return 'bg-emerald-500'
  if (status === 'failed' || status === 'dispatch_failed') return 'bg-rose-500'
  if (status === 'cancelled' || status === 'cancel_requested') return 'bg-ink-muted/60'
  if (status === 'running') return 'bg-indigo-500'
  return 'bg-amber-400'
}

export default function DeliveryProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params.projectId
  const project = useSWR<DeliveryProject>(projectId ? deliveryProjectPath(projectId) : null, fetcher, {
    refreshInterval: 12_000,
    dedupingInterval: 4_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [operationsOpen, setOperationsOpen] = useState(false)
  const [repositoryMapOpen, setRepositoryMapOpen] = useState(false)
  const budget = useSWR<DeliveryProjectBudget>(
    projectId && (memoryOpen || operationsOpen) ? deliveryProjectBudgetPath(projectId) : null,
    fetcher
  )
  const costs = useSWR<DeliveryProjectCosts>(
    projectId && (memoryOpen || operationsOpen) ? deliveryProjectCostsPath(projectId) : null,
    fetcher
  )
  const runtime = useSWR<AutomationRuntimeHealth>(
    operationsOpen ? automationHealthPath() : null,
    fetcher,
    { refreshInterval: 15_000 }
  )
  const publicationReadiness = useSWR<DeliveryPublicationReadiness>(
    projectId && (memoryOpen || operationsOpen) ? deliveryProjectPublicationReadinessPath(projectId) : null,
    fetcher
  )
  const activeWorkItemForStream = prioritizedWorkItem(project.data?.work_items ?? [])
  const projectStream = useDeliveryWorkItemStream(activeWorkItemForStream?.id, {
    // Administration is progressive disclosure, not a different experience: the
    // cockpit must keep receiving the agent pulse while its controls are open.
    enabled: deliveryWorkItemStreamEnabled(activeWorkItemForStream?.id, activeWorkItemForStream?.state),
    onSnapshot: () => { void project.mutate() },
    onUpdate: () => { void project.mutate() },
  })
  const [context, setContext] = useState({
    kind: 'repository',
    name: '',
    reference: '',
    revision: '',
    excerpt: '',
    repositoryRole: 'primary',
    repositoryKind: 'unclassified',
    repositoryResponsibility: '',
    dependsOnRepositories: '',
  })
  const [task, setTask] = useState({
    requestId: '',
    contextSourceIds: [] as string[],
    dependsOnWorkItemIds: [] as string[],
    title: '',
    description: '',
    expectedOutcome: '',
    includedScope: '',
    excludedScope: '',
    acceptance: '',
    budgetUsd: '',
  })
  const [request, setRequest] = useState({
    title: '',
    body: '',
    priority: 'normal',
    expectedOutcome: '',
    constraints: '',
  })
  const [quickIntent, setQuickIntent] = useState('')
  const [intentOpen, setIntentOpen] = useState(false)
  const [member, setMember] = useState({ email: '', role: 'viewer' })
  const operationsSummaryRef = useRef<HTMLElement | null>(null)
  const intentFieldRef = useRef<HTMLTextAreaElement | null>(null)
  const [submitting, setSubmitting] = useState<
    'budget' | 'context' | 'architecture' | 'refresh' | 'fetch-remote' | 'request' | 'task' | 'member' | null
  >(null)
  const [message, setMessage] = useState('')

  function showProjectOperations() {
    setOperationsOpen(true)
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const summary = operationsSummaryRef.current
      summary?.focus({ preventScroll: true })
      summary?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
  }

  function showRemainingInterventions() {
    setOperationsOpen(true)
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const target = document.getElementById('delivery-work-gates')
      target?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      target?.setAttribute('tabindex', '-1')
      target?.focus({ preventScroll: true })
    })
  }

  function openProjectIntent() {
    setIntentOpen(true)
    requestAnimationFrame(() => intentFieldRef.current?.focus())
  }

  async function addContext(event: FormEvent) {
    event.preventDefault()
    setSubmitting('context')
    setMessage('')
    try {
      await api.post(deliveryProjectContextPath(projectId), {
        kind: context.kind,
        name: context.name.trim(),
        reference: context.reference.trim(),
        revision: context.revision.trim(),
        metadata: {
          ...(context.excerpt.trim() ? { excerpt: context.excerpt.trim() } : {}),
          ...(context.kind === 'repository'
            ? {
                repository_role: context.repositoryRole,
                repository_kind: context.repositoryKind,
                ...(context.repositoryResponsibility.trim()
                  ? { repository_responsibility: context.repositoryResponsibility.trim() }
                  : {}),
                ...(list(context.dependsOnRepositories).length
                  ? { depends_on_repositories: list(context.dependsOnRepositories) }
                  : {}),
              }
            : {}),
        },
      })
      setContext({
        kind: 'repository',
        name: '',
        reference: '',
        revision: '',
        excerpt: '',
        repositoryRole: 'primary',
        repositoryKind: 'unclassified',
        repositoryResponsibility: '',
        dependsOnRepositories: '',
      })
      setMessage('Fuente de contexto guardada. Las siguientes tareas congelarán esta revisión.')
      await project.mutate()
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No se pudo guardar la fuente. Revisa tipo, referencia y permisos.'))
    } finally {
      setSubmitting(null)
    }
  }

  async function updateRepositoryArchitecture(event: FormEvent<HTMLFormElement>, source: DeliveryContextSource) {
    event.preventDefault()
    setSubmitting('architecture')
    setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      await api.patch(deliveryProjectContextMetadataPath(projectId, source.id), {
        metadata: {
          repository_role: String(form.get('repositoryRole') ?? 'supporting'),
          repository_kind: String(form.get('repositoryKind') ?? 'unclassified'),
          repository_responsibility: String(form.get('repositoryResponsibility') ?? ''),
          depends_on_repositories: list(String(form.get('dependsOnRepositories') ?? '')),
        },
      })
      setMessage(`Arquitectura de ${source.name} actualizada. Las tareas existentes conservan su snapshot.`)
      await project.mutate()
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No se pudo actualizar la arquitectura del repositorio.'))
    } finally {
      setSubmitting(null)
    }
  }

  async function refreshRemoteContext(sourceId: string) {
    setSubmitting('refresh')
    setMessage('')
    try {
      await api.post(deliveryProjectContextRefreshPath(projectId, sourceId))
      setMessage(
        'Revisión remota actualizada. Las tareas existentes conservan su snapshot; las nuevas usarán esta revisión.'
      )
      await project.mutate()
    } catch {
      setMessage(
        'No se pudo actualizar la revisión remota. Verifica que GitHub App esté configurada y que tenga acceso de lectura a este repositorio.'
      )
    } finally {
      setSubmitting(null)
    }
  }

  async function refreshLocalContext(sourceId: string) {
    setSubmitting('refresh')
    setMessage('')
    try {
      await api.post(deliveryProjectLocalContextRefreshPath(projectId, sourceId))
      setMessage(
        'Checkpoint local actualizado. No se ejecutó pull, commit ni push; las tareas existentes conservan su snapshot.'
      )
      await project.mutate()
    } catch {
      setMessage(
        'No se pudo leer el checkpoint local. Verifica que el workspace siga registrado y sea un repositorio Git accesible.'
      )
    } finally {
      setSubmitting(null)
    }
  }

  async function fetchLocalRemoteRefs(sourceId: string) {
    setSubmitting('fetch-remote')
    setMessage('')
    try {
      await api.post(deliveryProjectLocalRemoteFetchPath(projectId, sourceId))
      setMessage(
        'Referencias remotas actualizadas. No se ejecutó pull ni cambió el checkpoint; revisa el estado ahead/behind antes de actualizar tu rama.'
      )
      await project.mutate()
    } catch {
      setMessage(
        'No se pudieron actualizar las referencias remotas. Este workspace necesita repository:fetch y un origin accesible sin interacción.'
      )
    } finally {
      setSubmitting(null)
    }
  }

  async function updateBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('monthlyBudgetUSD') ?? 0)
    const alertPercent = Number(form.get('alertPercent') ?? 80)
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(alertPercent)) {
      setMessage('El presupuesto debe ser un importe no negativo y el umbral debe ser un porcentaje entero.')
      return
    }
    setSubmitting('budget')
    setMessage('')
    try {
      await api.put(deliveryProjectBudgetPath(projectId), {
        monthly_budget_microusd: Math.round(amount * 1_000_000),
        alert_percent: alertPercent,
      })
      setMessage(
        amount > 0
          ? 'Presupuesto mensual actualizado. El agente detendrá nuevas llamadas cuando se alcance.'
          : 'Presupuesto desactivado para este proyecto.'
      )
      await budget.mutate()
    } catch {
      setMessage('No se pudo actualizar el presupuesto. Verifica el importe y tus permisos de Delivery.')
    } finally {
      setSubmitting(null)
    }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault()
    const taskBudgetUSD = task.budgetUsd.trim() ? Number(task.budgetUsd) : 0
    if (!Number.isFinite(taskBudgetUSD) || taskBudgetUSD < 0 || taskBudgetUSD > 100_000) {
      setMessage('El límite de IA por tarea debe estar entre 0 y 100,000 USD.')
      return
    }
    setSubmitting('task')
    setMessage('')
    try {
      await api.post(deliveryProjectWorkItemsPath(projectId), {
        request_id: task.requestId || undefined,
        context_source_ids: task.contextSourceIds,
        depends_on_work_item_ids: task.dependsOnWorkItemIds,
        title: task.title.trim(),
        description: task.description.trim(),
        expected_outcome: task.expectedOutcome.trim(),
        included_scope: list(task.includedScope),
        excluded_scope: list(task.excludedScope),
        acceptance_criteria: list(task.acceptance),
        budget_microusd: Math.round(taskBudgetUSD * 1_000_000),
        budget_alert_percent: 80,
      })
      setTask({
        requestId: '',
        contextSourceIds: [],
        dependsOnWorkItemIds: [],
        title: '',
        description: '',
        expectedOutcome: '',
        includedScope: '',
        excludedScope: '',
        acceptance: '',
        budgetUsd: '',
      })
      setMessage('Tarea creada con un snapshot del contexto que seleccionaste.')
      await project.mutate()
    } catch {
      setMessage('No se pudo crear la tarea. Agrega contexto listo y define un resultado esperado.')
    } finally {
      setSubmitting(null)
    }
  }

  async function createRequest(event: FormEvent) {
    event.preventDefault()
    setSubmitting('request')
    setMessage('')
    try {
      await api.post(deliveryProjectRequestsPath(projectId), {
        title: request.title.trim(),
        body: request.body.trim(),
        priority: request.priority,
        expected_outcome: request.expectedOutcome.trim(),
        constraints: list(request.constraints),
      })
      setRequest({ title: '', body: '', priority: 'normal', expectedOutcome: '', constraints: '' })
      setMessage('Solicitud registrada. Ahora puede convertirse en una tarea acotada para generar su plan.')
      await project.mutate()
    } catch {
      setMessage('No se pudo registrar la solicitud. Define título, prioridad y resultado esperado.')
    } finally {
      setSubmitting(null)
    }
  }

  async function captureIntent(event: FormEvent) {
    event.preventDefault()
    const body = quickIntent.trim()
    if (!body) return
    setSubmitting('request')
    setMessage('')
    try {
      // The API derives the short request label and initial outcome from the
      // human's intent. The agent expands the operational details in its plan.
      await api.post(deliveryProjectRequestsPath(projectId), {
        title: '',
        body,
        priority: 'normal',
        expected_outcome: '',
        constraints: [],
      })
      setQuickIntent('')
      setIntentOpen(false)
      setMessage(
        'Solicitud registrada. Agrega o verifica el contexto y pide al agente que proponga el plan; tú conservas el gate de aprobación.'
      )
      await project.mutate()
    } catch {
      setMessage('No se pudo registrar la solicitud. Describe el resultado que necesitas y vuelve a intentar.')
    } finally {
      setSubmitting(null)
    }
  }

  async function preparePlan(sourceRequest: DeliveryRequest) {
    const sourceIDs = (project.data?.context ?? [])
      .filter((source) => source.status === 'ready')
      .map((source) => source.id)
    if (sourceIDs.length === 0) {
      setMessage(
        'Antes de pedir un plan, registra al menos una fuente de contexto lista. El agente no debe planear a ciegas.'
      )
      return
    }
    setSubmitting('task')
    setMessage('')
    try {
      const created = await api.post(deliveryProjectWorkItemsPath(projectId), {
        request_id: sourceRequest.id,
        context_source_ids: sourceIDs,
        title: sourceRequest.title,
        description: sourceRequest.body,
        expected_outcome: sourceRequest.expected_outcome,
        included_scope: [],
        excluded_scope: [],
        acceptance_criteria: [],
      })
      const workItem = readApiData<{ id: string }>(created.data)
      await api.post(deliveryWorkItemAgentRunsPath(workItem.id), {
        phase: 'plan',
        instructions:
          'Propón un plan completo y estructurado. Declara el contexto que usaste, vacíos, riesgos, límites de autonomía, pruebas y evidencia. No implementes ni publiques cambios.',
      })
      await project.mutate()
      router.push(`/automation/work-items/${workItem.id}?from_project=${encodeURIComponent(projectId)}`)
    } catch {
      setMessage(
        'No se pudo preparar el plan. La solicitud sigue intacta; revisa que el contexto esté listo e inténtalo de nuevo.'
      )
    } finally {
      setSubmitting(null)
    }
  }

  async function saveMember(event: FormEvent) {
    event.preventDefault()
    setSubmitting('member')
    setMessage('')
    try {
      await api.put(deliveryProjectMembersPath(projectId), {
        user_email: member.email.trim(),
        role: member.role,
        permissions: [],
      })
      setMember({ email: '', role: 'viewer' })
      setMessage('Miembro actualizado. Sus permisos se aplicarán al siguiente acceso al proyecto.')
      await project.mutate()
    } catch {
      setMessage(
        'No se pudo actualizar el miembro. Confirma el correo, que la cuenta esté activa y tus permisos globales.'
      )
    } finally {
      setSubmitting(null)
    }
  }

  if (project.isLoading)
    return (
      <main className="mx-auto max-w-[96rem] px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10" aria-busy="true" aria-describedby="project-cockpit-loading-copy">
        <div role="status" aria-live="polite" aria-atomic="true" aria-label="Cargando el resultado y su flujo de automatización" className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm text-ink-secondary">
            <span className="flex size-8 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /></span>
            <span id="project-cockpit-loading-copy"><span className="block font-semibold text-ink">Preparando el resultado</span><span className="mt-0.5 block text-xs text-ink-muted">Conectando el flujo, las decisiones y la evidencia.</span></span>
          </div>
          <div className="h-4 w-32 animate-pulse rounded-full bg-surface-soft motion-reduce:animate-none" />
          <section className="premium-surface mt-5 overflow-hidden rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-5 sm:p-6">
              <div className="min-w-0 flex-1">
                <div className="h-3 w-28 animate-pulse rounded-full bg-surface-soft motion-reduce:animate-none" />
                <div className="mt-3 h-7 max-w-sm animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />
                <div className="mt-3 h-4 max-w-md animate-pulse rounded-full bg-surface-soft motion-reduce:animate-none" />
              </div>
              <div className="h-10 w-28 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />
            </div>
            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="h-56 animate-pulse rounded-2xl border border-border-subtle bg-surface-soft/70 motion-reduce:animate-none" />
              <div className="h-40 animate-pulse rounded-2xl border border-border-subtle bg-surface-soft/70 motion-reduce:animate-none" />
            </div>
          </section>
        </div>
      </main>
    )
  const projectErrorStatus = (project.error as { response?: { status?: number }; status?: number } | undefined)?.response?.status ??
    (project.error as { status?: number } | undefined)?.status
  const unavailableProjectCopy =
    projectErrorStatus === 401
      ? 'Tu sesión local necesita validarse de nuevo para abrir este resultado.'
      : projectErrorStatus === 403
        ? 'No tienes acceso a este resultado. Pide acceso a su espacio de trabajo si necesitas revisarlo.'
        : projectErrorStatus === 404
          ? 'Este resultado ya no está disponible o fue archivado.'
          : 'El cockpit no pudo sincronizarse todavía. Tus datos no se han modificado.'
  if (!project.data)
    return (
      <main className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8">
        <section className="premium-surface mx-auto max-w-xl rounded-3xl p-6 text-center sm:p-8" role="alert">
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-200">
            <FolderOpenIcon className="size-5" aria-hidden="true" />
          </div>
          <p className="mt-4 text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Resultado no disponible</p>
          <h1 className="mt-2 text-lg font-semibold text-ink">No pudimos abrir este resultado</h1>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">{unavailableProjectCopy}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button color="indigo" onClick={() => void project.mutate()}>
              <ArrowPathIcon data-slot="icon" />
              Reintentar
            </Button>
            <Button outline href="/automation/projects">Volver a Resultados</Button>
          </div>
        </section>
      </main>
    )
  const item = project.data
  const contexts = (item.context ?? []).map((source) => ({ ...source, metadata: contextMetadata(source.metadata) }))
  const members = item.members ?? []
  const requests = item.requests ?? []
  const workItems = item.work_items ?? []
  const repositories = contexts.filter((source) => source.kind === 'repository')
  const visibleRepositories = repositoryMapOpen ? repositories : repositories.slice(0, 3)
  const repositoryNameByReference = new Map(repositories.map((source) => [source.reference, source.name]))
  const environments = contexts.filter((source) => source.kind === 'environment')
  const decisions = contexts.filter((source) => source.kind === 'decision')
  const repositoryReferences = new Set(repositories.map((source) => source.reference))
  const localWorkspaceRepositories = repositories.filter(isWorkspaceRepository)
  const remoteMetadataRepositories = repositories.filter(isRemoteMetadataRepository)
  const classifiedRepositories = repositories.filter(
    (source) => source.metadata?.repository_kind && source.metadata.repository_kind !== 'unclassified'
  )
  const repositoriesWithArchitectureSignals = localWorkspaceRepositories.filter((source) => {
    const architecture = workspaceArchitectureSignals(source)
    return (
      architecture.runtimes.length +
        architecture.entrypoints.length +
        architecture.testRoots.length +
        architecture.documentation.length >
      0
    )
  })
  const explicitPrimaryRepositories = localWorkspaceRepositories.filter(
    (source) => source.metadata?.repository_role === 'primary'
  )
  const effectivePrimaryCount =
    localWorkspaceRepositories.length === 1 && explicitPrimaryRepositories.length === 0
      ? 1
      : explicitPrimaryRepositories.length
  const pendingRepositories = repositories.filter((source) => source.status !== 'ready')
  const unsafeWorkspaceCheckpoints = localWorkspaceRepositories.filter(
    (source) => isDirtyWorkspace(source) || knownRemoteAhead(source) > 0
  )
  const missingRepositoryDependencies = repositories.flatMap((source) =>
    Array.isArray(source.metadata?.depends_on_repositories)
      ? source.metadata.depends_on_repositories.filter(
          (value): value is string => typeof value === 'string' && !repositoryReferences.has(value)
        )
      : []
  )
  const repositoryTopologyReady =
    localWorkspaceRepositories.length > 0 &&
    pendingRepositories.length === 0 &&
    unsafeWorkspaceCheckpoints.length === 0 &&
    effectivePrimaryCount === 1 &&
    missingRepositoryDependencies.length === 0
  const repositoryTopologyMessage =
    localWorkspaceRepositories.length === 0
      ? 'Registra al menos un workspace:// local antes de preparar cambios de código. github:// aporta contexto, no código editable.'
      : pendingRepositories.length > 0
        ? `${pendingRepositories.length} repositorio${pendingRepositories.length === 1 ? '' : 's'} requieren sincronización.`
        : unsafeWorkspaceCheckpoints.length > 0
          ? `${unsafeWorkspaceCheckpoints.length} workspace${unsafeWorkspaceCheckpoints.length === 1 ? '' : 's'} requiere${unsafeWorkspaceCheckpoints.length === 1 ? '' : 'n'} un checkpoint limpio y actualizado antes de llamar al agente.`
          : effectivePrimaryCount !== 1
            ? 'Define exactamente un repositorio principal para los worktrees y la publicación.'
            : missingRepositoryDependencies.length > 0
              ? `${missingRepositoryDependencies.length} dependencia${missingRepositoryDependencies.length === 1 ? '' : 's'} no está registrada en este proyecto.`
              : 'La topología está lista para congelarse en una tarea nueva.'
  const activity = [
    ...contexts.map((source) => ({
      id: `context-${source.id}`,
      at: source.synced_at,
      title: 'Contexto sincronizado',
      detail: `${source.name}${source.revision ? ` · ${source.revision}` : ''}`,
      tone: 'indigo' as const,
    })),
    ...workItems.map((workItem) => ({
      id: `work-${workItem.id}`,
      at: workItem.updated_at,
      title: stateLabel[workItem.state] ?? workItem.state,
      detail: workItem.title,
      tone: workItem.state === 'released' ? ('emerald' as const) : ('amber' as const),
    })),
    ...workItems.flatMap((workItem) =>
      (workItem.gates ?? []).map((gate) => ({
        id: `gate-${gate.id}`,
        at: gate.decided_at,
        title: `Gate de ${gate.kind}`,
        detail: `${gate.decision === 'approved' ? 'Aprobado' : 'Cambios solicitados'} · ${workItem.title}`,
        tone: gate.decision === 'approved' ? ('emerald' as const) : ('rose' as const),
      }))
    ),
  ].sort((left, right) => new Date(right.at ?? 0).getTime() - new Date(left.at ?? 0).getTime())
  const visibleActivity = activity.slice(0, 3)
  const hiddenActivityCount = Math.max(0, activity.length - visibleActivity.length)
  const activeWorkItems = workItems.filter((workItem) => !completedStates.has(workItem.state))
  const blockingWorkItems = workItems.filter(workItemNeedsAttention)
  const reviewWorkItems = workItems.filter(
    (workItem) => isReviewState(workItem.state) && !hasCancellationRequest(workItem.automation_tasks ?? [])
  )
  const decisionWorkItems = [
    ...blockingWorkItems,
    ...reviewWorkItems.filter((workItem) => !blockingWorkItems.some((blocked) => blocked.id === workItem.id)),
  ]
  const activeWorkItem = prioritizedWorkItem(workItems)
  const openRequests = requests.filter((request) => request.status === 'open')
  const visibleRequests = requests.slice(0, 2)
  const hiddenRequestCount = Math.max(0, requests.length - visibleRequests.length)
  const visibleWorkItems = [...activeWorkItems, ...workItems.filter((workItem) => completedStates.has(workItem.state))].slice(0, 2)
  const hiddenWorkItemCount = Math.max(0, workItems.length - visibleWorkItems.length)
  // The cockpit pulse belongs to the whole result, not only to the currently
  // highlighted task. Parallel agent work must remain visible at this level.
  const stoppingWorkItems = workItems.filter((workItem) => hasCancellationRequest(workItem.automation_tasks ?? []))
  const projectRunningTasks = workItems
    .filter((workItem) => !hasCancellationRequest(workItem.automation_tasks ?? []))
    .flatMap((workItem) => workItem.automation_tasks ?? [])
    .filter((task) => task.status === 'running')
  const activeWorkItemIsStopping = Boolean(activeWorkItem && hasCancellationRequest(activeWorkItem.automation_tasks ?? []))
  const activeWorkItemRunningTasks = activeWorkItemIsStopping
    ? []
    : (activeWorkItem?.automation_tasks ?? []).filter((task) => task.status === 'running')
  const activePlanReady =
    activeWorkItem?.state === 'planning' &&
    (activeWorkItem.automation_tasks ?? []).some((task) => task.operation === 'delivery.plan' && task.status === 'completed')
  const lastActivity = activity[0]
  const activePhaseIndex = activeWorkItem ? workItemPhase(activeWorkItem.state) : 0
  const activePhase = activeWorkItem ? deliveryPhases[activePhaseIndex] : undefined
  const interventionCount = decisionWorkItems.length + openRequests.length
  const primaryIntervention = decisionWorkItems[0]
  const remainingInterventionCount = Math.max(0, interventionCount - 1)
  const projectPulse =
    projectRunningTasks.length > 0
      ? `${projectRunningTasks.length} ejecución${projectRunningTasks.length === 1 ? '' : 'es'} en curso`
      : stoppingWorkItems.length > 0
        ? `${stoppingWorkItems.length} ejecución${stoppingWorkItems.length === 1 ? '' : 'es'} cerrándose`
      : decisionWorkItems.some(workItemNeedsAttention)
        ? 'Una ejecución necesita atención'
      : activePlanReady
        ? 'Propuesta preparada para su gate'
      : activeWorkItem
        ? `Seguimiento de ${workItemOperationalLabel(activeWorkItem)}`
        : 'Sin ejecuciones en curso'
  const streamUnavailable = projectStream.status === 'offline' || projectStream.status === 'error'
  const streamReconnecting = projectStream.status === 'reconnecting' || projectStream.status === 'connecting'
  return (
    <PageTransition>
      <main className="mx-auto max-w-[96rem] px-4 py-5 pb-28 sm:px-6 sm:py-7 lg:px-8 lg:pb-10">
        <Link
          href="/automation/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-ink"
        >
          <ArrowLeftIcon className="size-4" />
          Resultados
        </Link>
        <PageHeader
          eyebrow={item.client?.name ?? 'Cliente'}
          title={item.name}
          icon={FolderOpenIcon}
          className="gap-3 pb-4 sm:gap-3 [&_h1]:mt-2 [&_h1]:text-xl/7 sm:[&_h1]:text-2xl/8"
        />
        {item.summary && (
          <details className="group mt-3 inline-block max-w-2xl text-sm text-ink-secondary">
            <summary className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink-secondary transition hover:border-(--tenant-accent)/35 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) marker:hidden">
              Ver contexto del resultado
              <ChevronDownIcon className="size-3.5 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <p className="mt-2 max-w-2xl rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm/6 text-ink-secondary">
              {item.summary}
            </p>
          </details>
        )}
        <section className="premium-surface mt-5 overflow-hidden rounded-[1.75rem]" aria-label="Cockpit del resultado">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative flex size-3 shrink-0" aria-hidden="true">
                <span
                  className={`absolute inline-flex size-full rounded-full opacity-50 ${streamUnavailable ? 'bg-rose-400' : streamReconnecting ? 'animate-ping motion-reduce:animate-none bg-amber-400' : projectRunningTasks.length > 0 ? 'animate-ping motion-reduce:animate-none bg-indigo-400' : stoppingWorkItems.length > 0 ? 'bg-ink-muted/50' : 'bg-emerald-400'}`}
                />
                <span className={`relative inline-flex size-3 rounded-full ${streamUnavailable ? 'bg-rose-500' : streamReconnecting ? 'bg-amber-500' : projectRunningTasks.length > 0 ? 'bg-indigo-500' : stoppingWorkItems.length > 0 ? 'bg-ink-muted/60' : 'bg-emerald-500'}`} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[.14em] text-ink-muted uppercase">Pulso del resultado</p>
                <p className="truncate text-sm font-semibold text-ink">
                {streamReconnecting
                    ? 'Reconectando al agente'
                    : streamUnavailable
                      ? 'El pulso se actualizará al reconectar'
                      : projectPulse}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={streamUnavailable ? 'rose' : streamReconnecting ? 'amber' : projectRunningTasks.length > 0 ? 'indigo' : stoppingWorkItems.length > 0 ? 'zinc' : decisionWorkItems.some(workItemNeedsAttention) ? 'rose' : decisionWorkItems.length > 0 ? 'amber' : 'emerald'}>
                {streamReconnecting
                  ? 'Reconectando'
                  : streamUnavailable
                    ? 'Sin conexión'
                    : projectRunningTasks.length > 0
                      ? 'En vivo'
                      : stoppingWorkItems.length > 0
                        ? 'Cierre en curso'
                      : decisionWorkItems.length > 0
                        ? 'Atención'
                        : 'Al día'}
              </Badge>
              <button
                type="button"
                onClick={showProjectOperations}
                aria-expanded={operationsOpen}
                aria-controls="project-operations"
                className="min-h-11 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink-secondary transition hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
              >
                Mantenimiento
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[.14em] text-ink-muted uppercase">Resultado actual</p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {activeWorkItem ? activePhase ? `${activePhase.label} · paso ${activePhaseIndex + 1} de ${deliveryPhases.length}` : 'Flujo activo' : 'El primer flujo aparecerá aquí.'}
                  </p>
                </div>
                {activeWorkItem && <Badge color={workItemOperationalTone(activeWorkItem)}>{workItemOperationalLabel(activeWorkItem)}</Badge>}
              </div>

              {activeWorkItem ? (
                <Link
                  href={`/automation/work-items/${activeWorkItem.id}?view=${!hasCancellationRequest(activeWorkItem.automation_tasks ?? []) && (isReviewState(activeWorkItem.state) || workItemNeedsAttention(activeWorkItem)) ? 'control' : 'overview'}`}
                  className="group mt-4 block rounded-2xl border border-border-subtle bg-surface-raised p-4 transition duration-200 hover:border-(--tenant-accent)/45 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
                >
                  <div className="flex gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                      <SparklesIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink group-hover:text-(--tenant-accent)">{activeWorkItem.title}</span>
                          <span className="mt-1 block text-sm leading-5 text-ink-secondary">
                            {hasCancellationRequest(activeWorkItem.automation_tasks ?? [])
                              ? 'El agente está cerrando esta ejecución de forma segura.'
                              : isReviewState(activeWorkItem.state)
                              ? 'Gate humano listo.'
                              : workItemNeedsAttention(activeWorkItem)
                                ? 'Requiere intervención.'
                                : activePlanReady
                                  ? 'El gate comprobará la propuesta antes de continuar.'
                                  : 'El agente avanza de forma autónoma.'}
                          </span>
                        </span>
                        <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-(--tenant-accent)" />
                      </span>
                    </span>
                  </div>

                  <div className="mt-5" aria-label="Progreso del flujo">
                    <div className="grid min-w-0 grid-cols-4 gap-1.5 sm:gap-2">
                      {deliveryPhases.map((phase, index) => {
                        const currentPhase = workItemPhase(activeWorkItem.state)
                        const passed = activeWorkItem.state === 'released' || index < currentPhase
                        const current = index === currentPhase && activeWorkItem.state !== 'released'
                        const isStopping = hasCancellationRequest(activeWorkItem.automation_tasks ?? [])
                        const isDecision = current && isReviewState(activeWorkItem.state) && !isStopping
                        const stageState = passed ? 'completado' : isStopping && current ? 'cerrando de forma segura' : isDecision ? 'requiere decisión' : current ? 'en curso' : 'pendiente'
                        return (
                          <div
                            key={phase.key}
                            className="relative min-w-0"
                            aria-label={`${phase.label}: ${stageState}`}
                          >
                            {index > 0 && (
                              <span
                                className={`absolute top-3 right-[calc(50%+1.1rem)] h-px w-[calc(100%-1.4rem)] ${passed ? 'bg-emerald-400' : 'bg-border-subtle'}`}
                                aria-hidden="true"
                              />
                            )}
                            <span
                              className={`relative mx-auto flex size-6 items-center justify-center rounded-full border text-[10px] font-bold ${passed ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : isStopping && current ? 'border-border-subtle bg-surface-soft text-ink-muted' : isDecision ? 'border-amber-300 bg-amber-50 text-amber-700' : current ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-border-subtle bg-surface-raised text-ink-muted'}`}
                            >
                              {passed ? <CheckCircleIcon className="size-3" /> : index + 1}
                            </span>
                            <span className="mt-2 block truncate text-center text-[10px] font-medium text-ink-secondary sm:text-[11px]">{phase.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <span className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle pt-3 text-xs text-ink-muted">
                    <span className={`size-1.5 rounded-full ${activeWorkItemRunningTasks.length > 0 ? 'bg-indigo-500 delivery-signal' : activePlanReady ? 'bg-emerald-500' : taskPulseTone((activeWorkItem.automation_tasks ?? []).at(-1)?.status ?? 'queued')}`} />
                    <span>{activeWorkItemRunningTasks.length > 0 ? `${activeWorkItemRunningTasks.length} en ejecución` : workItemOperationalLabel(activeWorkItem)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeWorkItem.evidence?.length ?? 0} evidencia{(activeWorkItem.evidence?.length ?? 0) === 1 ? '' : 's'}</span>
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={openProjectIntent}
                  className="group mt-4 flex min-h-32 w-full items-center gap-4 rounded-2xl border border-dashed border-(--tenant-accent)/30 bg-(--tenant-accent)/[0.035] px-5 text-left transition hover:border-(--tenant-accent)/55 hover:bg-(--tenant-accent)/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-(--tenant-accent)/10 text-(--tenant-accent) transition-transform group-hover:scale-105 motion-reduce:transform-none"><SparklesIcon className="size-5" /></span>
                  <span className="min-w-0"><span className="block text-sm font-semibold text-ink">Describe el resultado que necesitas</span><span className="mt-1 block text-xs leading-5 text-ink-muted">El agente preparará el primer plan y te pedirá aprobación sólo si hace falta.</span></span>
                  <ArrowRightIcon className="ml-auto size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-(--tenant-accent) motion-reduce:transform-none" />
                </button>
              )}
            </section>

            {interventionCount > 0 && (
            <aside className={`rounded-2xl border p-4 sm:p-5 ${primaryIntervention && workItemNeedsAttention(primaryIntervention) ? 'border-rose-500/20 bg-rose-500/[0.04]' : 'border-amber-500/20 bg-amber-500/[0.04]'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[.14em] text-ink-muted uppercase">Intervención requerida</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{primaryIntervention && workItemNeedsAttention(primaryIntervention) ? 'El flujo necesita ayuda' : interventionCount === 1 ? 'Una decisión lista' : `${interventionCount} por resolver`}</p>
                </div>
                <span className={`flex size-8 items-center justify-center rounded-xl text-xs font-bold ${primaryIntervention && workItemNeedsAttention(primaryIntervention) ? 'bg-rose-500/10 text-rose-700' : 'bg-amber-500/10 text-amber-700'}`}>
                  {interventionCount}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {primaryIntervention && (
                  <Link
                    href={`/automation/work-items/${primaryIntervention.id}?view=control`}
                    className={`block rounded-xl border border-border-subtle bg-surface-soft px-3 py-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 ${workItemNeedsAttention(primaryIntervention) ? 'hover:border-rose-300 hover:bg-rose-50/60 focus-visible:outline-rose-400' : 'hover:border-amber-300 hover:bg-amber-50/60 focus-visible:outline-amber-400'}`}
                  >
                    <span className="block truncate text-xs font-semibold text-ink">{primaryIntervention.title}</span>
                    <span className={`mt-1 block text-[11px] ${workItemOperationalTone(primaryIntervention) === 'rose' ? 'text-rose-700' : workItemOperationalTone(primaryIntervention) === 'zinc' ? 'text-ink-muted' : 'text-amber-700'}`}>{workItemOperationalLabel(primaryIntervention)} · Abrir gate</span>
                  </Link>
                )}
                {decisionWorkItems.length === 0 && openRequests[0] && (
                  <button
                    type="button"
                    disabled={submitting === 'task'}
                    onClick={() => void preparePlan(openRequests[0])}
                    className="w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2.5 text-left transition hover:border-(--tenant-accent)/35 hover:bg-surface-interactive disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="block text-xs font-semibold text-ink">{submitting === 'task' ? 'Preparando propuesta…' : 'Preparar siguiente plan'}</span>
                    <span className="mt-1 block truncate text-[11px] text-ink-muted">{openRequests[0].title}</span>
                  </button>
                )}
                {remainingInterventionCount > 0 && (
                  <button
                    type="button"
                    onClick={showRemainingInterventions}
                    className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-semibold text-(--tenant-accent) transition hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
                  >
                    Ver {remainingInterventionCount} acción{remainingInterventionCount === 1 ? '' : 'es'} restante{remainingInterventionCount === 1 ? '' : 's'}
                    <ArrowRightIcon className="size-3.5" />
                  </button>
                )}
              </div>
            </aside>
            )}
          </div>

          <details
            open={memoryOpen}
            onToggle={(event) => setMemoryOpen(event.currentTarget.open)}
            className="border-t border-border-subtle"
          >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-5">
              <span>Memoria del agente</span>
              <span className="text-xs font-normal text-ink-muted">
                {contexts.filter((source) => source.status === 'ready').length}/{contexts.length} fuentes listas
              </span>
            </summary>
            {memoryOpen && (
              <div className="grid gap-3 border-t border-border-subtle px-4 py-4 text-sm sm:grid-cols-3 sm:px-5">
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">Fuentes listas</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {contexts.filter((source) => source.status === 'ready').length} de {contexts.length} fuentes disponibles
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">Último movimiento</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">
                    {lastActivity ? `${lastActivity.title} · ${lastActivity.detail}` : 'Todavía no hay actividad registrada.'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">Guardrails</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {budget.data?.enforced ? `${usdFromMicros(budget.data.remaining_microusd)} disponibles` : 'Presupuesto sin límite'} · {publicationReadiness.data?.state === 'ready' ? 'publicación habilitable' : 'entrega local'}
                  </p>
                </div>
              </div>
            )}
          </details>
        </section>

        {message && (
          <p role="status" className="mt-4 rounded-2xl border border-border-subtle bg-surface-soft px-4 py-3 text-xs leading-5 text-ink-secondary">
            {message}
          </p>
        )}

        <details
          id="project-operations"
          open={operationsOpen}
          onToggle={(event) => setOperationsOpen(event.currentTarget.open)}
          className="group mt-5"
        >
          <summary ref={operationsSummaryRef} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm font-semibold text-ink marker:hidden transition hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) sm:px-5">
            <span>Mantenimiento del resultado</span>
            <span className="flex items-center gap-2 text-xs font-normal text-ink-muted">
              Bajo demanda
              <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </span>
          </summary>
          {operationsOpen && <div className="mt-4 space-y-5">
        <details className="premium-surface group overflow-hidden rounded-[1.75rem]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
            <span className="min-w-0">
              <span className="block text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Mantenimiento</span>
              <span className="mt-1 block truncate text-sm font-semibold text-ink">Contexto, presupuesto y publicación</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-ink-muted">
              {contexts.filter((source) => source.status === 'ready').length}/{contexts.length} fuentes
              <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </span>
          </summary>
          <div className="border-t border-border-subtle p-4 sm:p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[.15em] text-(--tenant-accent) uppercase">
                Memoria del resultado
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                Todo lo que el agente puede usar queda a la vista.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
                El contexto se congela para cada tarea. Así puedes entender qué información informó una decisión sin
                repetirla ni mezclarla con otros clientes.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary">
                  {contexts.length} fuentes disponibles
                </span>
                <span className="rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary">
                  {localWorkspaceRepositories.length} workspaces con código
                </span>
                <span className="rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary">
                  {classifiedRepositories.length}/{repositories.length} superficies clasificadas
                </span>
                <span className="rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary">
                  {repositoriesWithArchitectureSignals.length}/{localWorkspaceRepositories.length} inventarios
                  observados
                </span>
                {remoteMetadataRepositories.length > 0 && (
                  <span className="rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary">
                    {remoteMetadataRepositories.length} referencia{remoteMetadataRepositories.length === 1 ? '' : 's'}{' '}
                    remota{remoteMetadataRepositories.length === 1 ? '' : 's'}
                  </span>
                )}
                <span className="rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-secondary">
                  {members.length} personas con acceso
                </span>
                <Badge color={repositoryTopologyReady ? 'emerald' : 'amber'}>
                  {repositoryTopologyReady ? 'Topología lista' : 'Topología por revisar'}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
                <p className="text-xs text-ink-muted">Trabajo en curso</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                  {workItems.filter((workItem) => workItem.state !== 'released').length}
                </p>
                <p className="mt-1 text-xs text-ink-muted">tareas activas</p>
              </div>
              <a
                href={
                  requests.some((request) => request.status === 'open') || workItems.length > 0
                    ? '#delivery-work-gates'
                    : '#delivery-intent'
                }
                className="group rounded-2xl border border-border-subtle bg-surface-raised p-4 transition hover:border-(--tenant-accent)/40 hover:bg-surface-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
              >
                <p className="text-xs text-ink-muted">Siguiente paso</p>
                <p className="mt-2 text-sm leading-5 font-semibold text-ink group-hover:text-(--tenant-accent)">
                  {requests.some((request) => request.status === 'open')
                    ? 'Revisar el plan propuesto'
                    : workItems.length
                      ? 'Abrir trabajo activo'
                      : 'Describir una necesidad'}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {requests.some((request) => request.status === 'open') || workItems.length > 0
                    ? 'Ir al trabajo con gates'
                    : 'Abrir solicitud con gate humano'}
                </p>
              </a>
              <div className="col-span-2 rounded-2xl border border-border-subtle bg-surface-raised p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-muted">Presupuesto IA del mes</p>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-ink">
                      {budget.data?.enforced
                        ? `${usdFromMicros(budget.data.allocated_microusd)} asignados de ${usdFromMicros(budget.data.monthly_budget_microusd)}`
                        : `${usdFromMicros(budget.data?.spent_microusd)} · sin límite`}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                      {budget.data?.enforced
                        ? `${usdFromMicros(budget.data.spent_microusd)} reales + ${usdFromMicros(budget.data.reserved_microusd)} reservados · ${usdFromMicros(budget.data.remaining_microusd)} disponibles.`
                        : 'Activa un límite para que la plataforma detenga nuevas llamadas al alcanzarlo.'}
                    </p>
                  </div>
                  <Badge color={budget.data?.enforced ? 'indigo' : 'zinc'}>
                    {budget.data?.enforced ? 'Controlado' : 'Sin límite'}
                  </Badge>
                </div>
                <details className="mt-3 border-t border-border-subtle pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">
                    Configurar política de presupuesto
                  </summary>
                  <form onSubmit={updateBudget} className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                    <label className="text-xs font-medium text-ink-secondary">
                      Límite mensual (USD)
                      <input
                        name="monthlyBudgetUSD"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={budget.data ? budget.data.monthly_budget_microusd / 1_000_000 : 0}
                        className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink"
                      />
                    </label>
                    <label className="text-xs font-medium text-ink-secondary">
                      Alerta (%)
                      <input
                        name="alertPercent"
                        type="number"
                        min="50"
                        max="100"
                        step="1"
                        defaultValue={budget.data?.alert_percent ?? 80}
                        className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink"
                      />
                    </label>
                    <Button
                      color="indigo"
                      type="submit"
                      disabled={submitting === 'budget'}
                      className="w-full sm:w-auto"
                    >
                      {submitting === 'budget' ? 'Guardando…' : 'Guardar'}
                    </Button>
                  </form>
                  <p className="mt-2 text-xs leading-5 text-ink-muted">
                    El agente no puede cambiar este límite. Usa 0 para desactivarlo; una ejecución ya iniciada conserva
                    su evidencia y coste real.
                  </p>
                </details>
              </div>
              <section
                className="col-span-2 rounded-2xl border border-border-subtle bg-surface-raised p-4"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-muted">Publicación remota</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {publicationReadiness.data?.state === 'ready'
                        ? 'Lista para un grant humano acotado'
                        : 'La entrega permanece local'}
                    </p>
                  </div>
                  <Badge
                    color={
                      publicationReadiness.data?.state === 'ready'
                        ? 'emerald'
                        : publicationReadiness.data?.state === 'invalid'
                          ? 'rose'
                          : 'amber'
                    }
                  >
                    {publicationReadiness.isLoading
                      ? 'Comprobando'
                      : publicationReadiness.data?.state === 'ready'
                        ? 'GitHub App lista'
                        : publicationReadiness.data?.state === 'invalid'
                          ? 'Configuración inválida'
                          : 'Sólo local'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  {publicationReadiness.data?.message ??
                    'Comprobando la integración de publicación sin exponer credenciales…'}
                </p>
                {publicationReadiness.data?.state !== 'ready' &&
                  (publicationReadiness.data?.requirements?.length ?? 0) > 0 && (
                    <details className="mt-3 border-t border-border-subtle pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">
                        Ver qué falta para habilitar PRs
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-ink-muted">
                        {publicationReadiness.data?.requirements?.map((requirement, index) => (
                          <li key={`${requirement}-${index}`}>• {requirement}</li>
                        ))}
                      </ul>
                    </details>
                  )}
              </section>
            </div>
          </div>
          </div>
        </details>

        <details className="premium-surface group mt-5 overflow-hidden rounded-[1.75rem]">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
            <span className="min-w-0">
              <span className="block text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Consumo del resultado</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
                {usdFromMicros(costs.data?.summary.total_cost_microusd)}
                <span className="text-xs font-normal text-ink-muted">· {(costs.data?.summary.executions ?? 0).toLocaleString('es-MX')} llamadas</span>
              </span>
            </span>
            <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink-secondary transition group-hover:bg-surface-soft">
              <span className="group-open:hidden">Ver detalle</span>
              <span className="hidden group-open:inline">Ocultar</span>
              <ChevronDownIcon className="size-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </span>
          </summary>
          <div className="border-t border-border-subtle">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <p className="text-xs leading-5 text-ink-muted">Coste trazable por fase y tarea.</p>
              <Link href="/automation/costs" className="inline-flex min-h-11 items-center rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft">
                Abrir uso y costos
              </Link>
            </div>
          <div className="grid divide-y divide-border-subtle lg:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
            <div className="p-5 sm:p-6">
              <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
                {usdFromMicros(costs.data?.summary.total_cost_microusd)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {(costs.data?.summary.executions ?? 0).toLocaleString('es-MX')} llamadas ·{' '}
                {(costs.data?.summary.work_items ?? 0).toLocaleString('es-MX')} tareas
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                {(costs.data?.summary.total_tokens ?? 0).toLocaleString('es-MX')} tokens
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-muted">
                {(costs.data?.summary.input_tokens ?? 0).toLocaleString('es-MX')} entrada ·{' '}
                {(costs.data?.summary.output_tokens ?? 0).toLocaleString('es-MX')} salida ·{' '}
                {(costs.data?.summary.cached_input_tokens ?? 0).toLocaleString('es-MX')} caché
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {(costs.data?.summary.cache_write_tokens ?? 0).toLocaleString('es-MX')} caché escrita ·{' '}
                {(costs.data?.summary.reasoning_tokens ?? 0).toLocaleString('es-MX')} razonamiento
              </p>
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-xs font-semibold text-ink-secondary">Por fase</p>
              {(costs.data?.by_step ?? []).length === 0 ? (
                <p className="mt-3 text-xs text-ink-muted">Todavía no hay ejecuciones costeadas.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {costs.data?.by_step.slice(0, 5).map((step) => (
                    <li key={`${step.execution_kind}-${step.tool ?? 'agent'}-${step.key}`} className="text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-ink-secondary">
                          {step.execution_kind === 'tool' ? `${step.tool || 'Herramienta'} · ` : 'Agente · '}
                          {costPhaseLabel(step.key)} · {step.executions} llamadas
                        </span>
                        <span className="shrink-0 font-semibold text-ink tabular-nums">
                          {usdFromMicros(step.total_cost_microusd)}
                        </span>
                      </div>
                      <p className="mt-1 text-ink-muted">
                        {step.input_tokens.toLocaleString('es-MX')} entrada ·{' '}
                        {step.output_tokens.toLocaleString('es-MX')} salida ·{' '}
                        {step.cached_input_tokens.toLocaleString('es-MX')} caché
                        {step.cache_write_tokens > 0
                          ? ` · ${step.cache_write_tokens.toLocaleString('es-MX')} escrita`
                          : ''}
                        {step.reasoning_tokens > 0
                          ? ` · ${step.reasoning_tokens.toLocaleString('es-MX')} razonamiento`
                          : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-xs font-semibold text-ink-secondary">Por tarea</p>
              {(costs.data?.by_work_item ?? []).length === 0 ? (
                <p className="mt-3 text-xs text-ink-muted">El coste aparecerá cuando el agente ejecute una fase.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {costs.data?.by_work_item.slice(0, 4).map((workItem) => (
                    <li key={workItem.work_item_id} className="text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/automation/work-items/${workItem.work_item_id}`}
                          className="min-w-0 truncate text-ink-secondary hover:text-(--tenant-accent)"
                        >
                          {workItem.work_item_title}
                        </Link>
                        <span className="shrink-0 font-semibold text-ink tabular-nums">
                          {usdFromMicros(workItem.total_cost_microusd)}
                        </span>
                      </div>
                      <p className="mt-1 text-ink-muted">
                        {workItem.executions} llamadas · {workItem.input_tokens.toLocaleString('es-MX')} entrada ·{' '}
                        {workItem.output_tokens.toLocaleString('es-MX')} salida ·{' '}
                        {workItem.cached_input_tokens.toLocaleString('es-MX')} caché
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          </div>
        </details>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <section className="order-2 space-y-5 xl:order-none">
            <section id="delivery-work-gates" className="premium-surface overflow-hidden rounded-3xl">
              <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Solicitudes</p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">Qué necesita el resultado</h2>
                </div>
                <Badge color="indigo">{requests.length}</Badge>
              </div>
              {requests.length === 0 ? (
                <p className="p-5 text-sm text-ink-muted">
                  Aún no hay solicitudes. Captura la necesidad antes de convertirla en tarea.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {visibleRequests.map((request) => (
                    <li key={request.id} className="px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-ink">{request.title}</p>
                            <Badge
                              color={request.priority === 'urgent' || request.priority === 'high' ? 'rose' : 'indigo'}
                            >
                              {request.priority}
                            </Badge>
                            <Badge color={request.status === 'open' ? 'amber' : 'emerald'}>{request.status}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-ink-secondary">{request.expected_outcome}</p>
                        </div>
                        {request.status === 'open' && (
                          <Button
                            color="indigo"
                            type="button"
                            disabled={submitting === 'task'}
                            onClick={() => void preparePlan(request)}
                            className="shrink-0"
                          >
                            <SparklesIcon data-slot="icon" />
                            {submitting === 'task' ? 'Preparando…' : 'Proponer plan'}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {hiddenRequestCount > 0 && (
                <details className="group border-t border-border-subtle">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-xs font-semibold text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
                    Ver {hiddenRequestCount} solicitud{hiddenRequestCount === 1 ? '' : 'es'} más
                    <ChevronDownIcon className="size-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </summary>
                  <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                    {requests.slice(2).map((request) => (
                      <li key={request.id} className="px-5 py-4 sm:px-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{request.title}</p><Badge color={request.priority === 'urgent' || request.priority === 'high' ? 'rose' : 'indigo'}>{request.priority}</Badge><Badge color={request.status === 'open' ? 'amber' : 'emerald'}>{request.status}</Badge></div>
                            <p className="mt-1 text-sm text-ink-secondary">{request.expected_outcome}</p>
                          </div>
                          {request.status === 'open' && <Button color="indigo" type="button" disabled={submitting === 'task'} onClick={() => void preparePlan(request)} className="shrink-0"><SparklesIcon data-slot="icon" />{submitting === 'task' ? 'Preparando…' : 'Proponer plan'}</Button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
            <details className="group premium-surface overflow-hidden rounded-3xl">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
                <span>
                  <span className="block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Contexto del resultado</span>
                  <span className="mt-1 block text-lg font-semibold text-ink">Memoria y superficies del agente</span>
                </span>
                <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink-secondary transition group-hover:bg-surface-soft">
                  <span className="group-open:hidden">{contexts.length} fuente{contexts.length === 1 ? '' : 's'}</span>
                  <span className="hidden group-open:inline">Cerrar</span>
                  <ChevronDownIcon className="size-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </span>
              </summary>
              <div className="border-t border-border-subtle p-5 sm:p-6">
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Registra referencias, no secretos ni archivos completos. Para código local usa{' '}
                <code className="rounded bg-surface-soft px-1.5 py-0.5">workspace://id</code>.
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-muted">
                Un workspace local fija su SHA actual al registrarse. Un repositorio <code>github://owner/repo</code>{' '}
                sin revisión queda pendiente hasta sincronizarlo con la GitHub App.
              </p>
              <RepositoryOnboardingPanel projectId={projectId} onContextPublished={() => project.mutate()} />
              <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">
                      Topología de repositorios
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {repositories.length} registrados · {localWorkspaceRepositories.length} con código ·{' '}
                      {effectivePrimaryCount} principal
                      {effectivePrimaryCount === 1 ? '' : 'es'} ·{' '}
                      {Math.max(0, repositories.length - effectivePrimaryCount)} de apoyo
                    </p>
                  </div>
                  <Badge color={repositoryTopologyReady ? 'emerald' : 'amber'}>
                    {repositoryTopologyReady ? 'Lista para congelar' : 'Requiere revisión'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">{repositoryTopologyMessage}</p>
              </div>
              {repositories.length > 0 && (
                <section className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Mapa operativo</p>
                      <p className="mt-1 text-sm font-semibold text-ink">Las piezas del producto y sus contratos</p>
                    </div>
                    <p className="max-w-sm text-xs leading-5 text-ink-muted">
                      El tipo explica la superficie; las dependencias indican qué debe considerarse antes de cambiar una
                      pieza.
                    </p>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleRepositories.map((source) => {
                      const dependencies = Array.isArray(source.metadata?.depends_on_repositories)
                        ? source.metadata.depends_on_repositories.filter(
                            (value): value is string => typeof value === 'string'
                          )
                        : []
                      const harness = workspaceQAContractLabels(source)
                      const remoteSource = remoteRepositorySourceContext(source)
                      const runtimeReadiness = runtimeReadinessForWorkspace(runtime.data, source)
                      return (
                        <article
                          key={`map-${source.id}`}
                          className="rounded-xl border border-border-subtle bg-surface-soft p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">{source.name}</p>
                              <p className="mt-1 truncate font-mono text-[10px] text-ink-muted">{source.reference}</p>
                            </div>
                            <Badge color={source.metadata?.repository_role === 'primary' ? 'indigo' : 'zinc'}>
                              {source.metadata?.repository_role === 'primary' ? 'Principal' : 'Apoyo'}
                            </Badge>
                          </div>
                          <p className="mt-3 text-xs font-medium text-sky-800">
                            {repositoryKindLabel(source.metadata?.repository_kind)}
                          </p>
                          {source.metadata?.repository_kind === 'unclassified' && isWorkspaceRepository(source) && (
                            <p className="mt-1 text-[10px] leading-4 text-amber-800">
                              Falta una decisión humana de clasificación antes de planear cambios entre superficies.
                            </p>
                          )}
                          <WorkspaceArchitectureSignals source={source} compact />
                          <div className="mt-3 border-t border-border-subtle pt-3">
                            <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-muted uppercase">
                              Depende de
                            </p>
                            {dependencies.length === 0 ? (
                              <p className="mt-1 text-xs text-ink-muted">Sin dependencias declaradas.</p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {dependencies.map((reference) => (
                                  <span
                                    key={reference}
                                    className="max-w-full truncate rounded-full bg-surface-raised px-2 py-1 text-[10px] text-ink-secondary"
                                  >
                                    {repositoryNameByReference.get(reference) ?? reference}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {isWorkspaceRepository(source) && (
                              <span className="rounded-full bg-emerald-500/[0.08] px-2 py-1 text-[10px] font-medium text-emerald-800">
                                Workspace local
                              </span>
                            )}
                            {isWorkspaceRepository(source) && runtimeReadiness && (
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-medium ${runtimeReadiness.ready ? 'bg-emerald-500/[0.08] text-emerald-800' : 'bg-rose-500/[0.08] text-rose-800'}`}
                              >
                                {runtimeReadiness.ready ? 'Worker listo' : 'Preflight pendiente'}
                              </span>
                            )}
                            {isWorkspaceRepository(source) && !runtimeReadiness && (
                              <span className="rounded-full bg-amber-500/[0.08] px-2 py-1 text-[10px] font-medium text-amber-800">
                                Sin señal del worker
                              </span>
                            )}
                            {remoteSource && (
                              <span className="rounded-full bg-sky-500/[0.08] px-2 py-1 text-[10px] font-medium text-sky-800">
                                Contexto remoto acotado
                              </span>
                            )}
                            {harness.includes('Stagehand + IA') && (
                              <span className="rounded-full bg-indigo-500/[0.08] px-2 py-1 text-[10px] font-medium text-indigo-800">
                                QA visual
                              </span>
                            )}
                            {runtimeReadiness?.visual_qa_ready && (
                              <span className="rounded-full bg-violet-500/[0.08] px-2 py-1 text-[10px] font-medium text-violet-800">
                                QA visual preparado
                              </span>
                            )}
                            {harness.length === 0 && (
                              <span className="rounded-full bg-surface-raised px-2 py-1 text-[10px] text-ink-muted">
                                Harness por definir
                              </span>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  {repositories.length > visibleRepositories.length && (
                    <button
                      type="button"
                      onClick={() => setRepositoryMapOpen(true)}
                      className="flex min-h-11 w-full items-center justify-center border-t border-border-subtle px-4 text-xs font-semibold text-(--tenant-accent) transition hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)"
                    >
                      Ver {repositories.length - visibleRepositories.length} repositorio{repositories.length - visibleRepositories.length === 1 ? '' : 's'} más
                    </button>
                  )}
                  {repositoryMapOpen && repositories.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setRepositoryMapOpen(false)}
                      className="flex min-h-11 w-full items-center justify-center border-t border-border-subtle px-4 text-xs font-semibold text-ink-secondary transition hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)"
                    >
                      Mostrar resumen
                    </button>
                  )}
                </section>
              )}
              <div className="mt-5 space-y-3">
                {contexts.length === 0 ? (
                  <p className="rounded-2xl bg-surface-soft p-4 text-sm text-ink-muted">
                    Aún no hay fuentes; no se puede iniciar una tarea de agente.
                  </p>
                ) : (
                  contexts.map((source) => (
                    <div key={source.id} className="rounded-2xl border border-border-subtle bg-surface-soft p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color="indigo">{source.kind}</Badge>
                        <p className="font-semibold text-ink">{source.name}</p>
                        <Badge color={source.status === 'ready' ? 'emerald' : 'amber'}>
                          {source.status === 'pending_sync' ? 'Pendiente de sincronizar' : source.status}
                        </Badge>
                        {isWorkspaceRepository(source) && <Badge color="emerald">Código local disponible</Badge>}
                        {isRemoteMetadataRepository(source) && (
                          <Badge color="zinc">
                            {remoteRepositoryMapFileCount(source) > 0
                              ? `Mapa remoto · ${remoteRepositoryMapFileCount(source)} archivos`
                              : 'Contexto remoto · sin código'}
                          </Badge>
                        )}
                        {remoteRepositorySourceContext(source) && (
                          <Badge color="sky">
                            Codigo remoto acotado · {remoteRepositorySourceContext(source)?.excerpts.length} extractos
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 font-mono text-xs break-all text-ink-secondary">{source.reference}</p>
                      {remoteRepositorySourceContext(source) && (
                        <div className="mt-3 rounded-xl border border-sky-500/15 bg-sky-500/[0.035] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-sky-900">Orientacion de codigo remota</p>
                            <span className="text-[10px] font-medium text-sky-800">
                              Solo lectura · commit congelado
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-sky-950/75">
                            El agente puede considerar estos archivos al planear; para modificarlos debe registrarse un
                            workspace local y pasar sus gates.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {remoteRepositorySourceContext(source)?.excerpts.map((path) => (
                              <span
                                key={path}
                                className="max-w-full truncate rounded-md bg-surface-raised px-2 py-1 font-mono text-[10px] text-ink-secondary"
                              >
                                {path}
                              </span>
                            ))}
                          </div>
                          {(remoteRepositorySourceContext(source)?.redactedValues ?? 0) > 0 && (
                            <p className="mt-2 text-[10px] text-sky-800">
                              {remoteRepositorySourceContext(source)?.redactedValues} valores sensibles redactados antes
                              de inferencia.
                            </p>
                          )}
                        </div>
                      )}
                      {source.kind === 'repository' && typeof source.metadata?.repository_role === 'string' && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge color={source.metadata.repository_role === 'primary' ? 'indigo' : 'zinc'}>
                            {source.metadata.repository_role === 'primary'
                              ? 'Repositorio principal'
                              : 'Repositorio de apoyo'}
                          </Badge>
                          <Badge color={source.metadata.repository_kind === 'unclassified' ? 'amber' : 'sky'}>
                            {repositoryKindLabel(source.metadata.repository_kind)}
                          </Badge>
                          {typeof source.metadata.repository_responsibility === 'string' &&
                            source.metadata.repository_responsibility && (
                              <span className="rounded-full bg-surface-raised px-2 py-1 text-[11px] text-ink-secondary">
                                {source.metadata.repository_responsibility}
                              </span>
                            )}
                        </div>
                      )}
                      {source.kind === 'repository' &&
                        Array.isArray(source.metadata?.depends_on_repositories) &&
                        source.metadata.depends_on_repositories.length > 0 && (
                          <p className="mt-2 text-xs leading-5 text-ink-muted">
                            Depende de:{' '}
                            {source.metadata.depends_on_repositories
                              .filter((value): value is string => typeof value === 'string')
                              .join(', ')}
                          </p>
                        )}
                      {source.kind === 'repository' && (
                        <details className="mt-3 border-t border-border-subtle pt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">
                            Editar mapa y responsabilidades
                          </summary>
                          <form
                            onSubmit={(event) => void updateRepositoryArchitecture(event, source)}
                            className="mt-3 grid gap-3"
                          >
                            <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2">
                              <p className="text-xs font-semibold text-sky-950">
                                Clasifica con evidencia, no con una suposición.
                              </p>
                              <p className="mt-1 text-xs leading-5 text-sky-900/80">
                                El tipo y la responsabilidad los decide una persona; las señales siguientes proceden del
                                inventario seguro del workspace y no cambian el checkout.
                              </p>
                              <WorkspaceArchitectureSignals source={source} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-xs font-medium text-ink-secondary">
                                Rol de ejecución
                                <select
                                  name="repositoryRole"
                                  defaultValue={
                                    source.metadata?.repository_role === 'primary'
                                      ? 'primary'
                                      : repositories.length === 1
                                        ? 'primary'
                                        : 'supporting'
                                  }
                                  className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink"
                                >
                                  <option value="primary">Principal</option>
                                  <option value="supporting">Apoyo</option>
                                </select>
                              </label>
                              <label className="text-xs font-medium text-ink-secondary">
                                Superficie
                                <select
                                  name="repositoryKind"
                                  defaultValue={
                                    typeof source.metadata?.repository_kind === 'string'
                                      ? source.metadata.repository_kind
                                      : 'unclassified'
                                  }
                                  className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink"
                                >
                                  {repositoryKinds.map((kind) => (
                                    <option key={kind.value} value={kind.value}>
                                      {kind.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <label className="text-xs font-medium text-ink-secondary">
                              Responsabilidad
                              <textarea
                                name="repositoryResponsibility"
                                defaultValue={
                                  typeof source.metadata?.repository_responsibility === 'string'
                                    ? source.metadata.repository_responsibility
                                    : ''
                                }
                                maxLength={2000}
                                rows={2}
                                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-ink"
                                placeholder="Ej. contratos de API y reglas de negocio."
                              />
                            </label>
                            <label className="text-xs font-medium text-ink-secondary">
                              Depende de <span className="font-normal text-ink-muted">(una referencia por línea)</span>
                              <textarea
                                name="dependsOnRepositories"
                                defaultValue={
                                  Array.isArray(source.metadata?.depends_on_repositories)
                                    ? source.metadata.depends_on_repositories
                                        .filter((value): value is string => typeof value === 'string')
                                        .join('\n')
                                    : ''
                                }
                                rows={2}
                                className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 font-mono text-xs text-ink"
                                placeholder="workspace://itbem-events-backend"
                              />
                            </label>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs leading-5 text-ink-muted">
                                No cambia SHA, ramas, permisos ni snapshots de tareas ya creadas.
                              </p>
                              <Button color="indigo" type="submit" disabled={submitting === 'architecture'}>
                                {submitting === 'architecture' ? 'Guardando…' : 'Guardar arquitectura'}
                              </Button>
                            </div>
                          </form>
                        </details>
                      )}
                      {source.kind === 'repository' &&
                        Array.isArray(source.metadata?.workspace_capabilities) &&
                        source.metadata.workspace_capabilities.length > 0 && (
                          <div className="mt-3 border-t border-border-subtle pt-3">
                            <p className="text-xs font-semibold text-ink-secondary">
                              Capacidades del agente en este workspace
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {source.metadata.workspace_capabilities
                                .filter((value): value is string => typeof value === 'string')
                                .map((capability) => {
                                  const presentation = workspaceCapabilityPresentation(capability)
                                  return (
                                    <span
                                      key={capability}
                                      title={capability}
                                      className={`rounded-full px-2 py-1 text-[10px] font-medium ${presentation.tone === 'controlled' ? 'bg-amber-500/[0.09] text-amber-900' : 'bg-surface-raised text-ink-secondary'}`}
                                    >
                                      {presentation.label}
                                    </span>
                                  )
                                })}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-ink-muted">
                              La lectura y el worktree son locales y acotados. Commit, publicación y PR nunca habilitan
                              merge ni deploy; requieren el gate humano y un permiso temporal exacto.
                            </p>
                          </div>
                        )}
                      {isWorkspaceRepository(source) && workspaceQAContractLabels(source).length > 0 && (
                        <div className="mt-3 border-t border-border-subtle pt-3">
                          <p className="text-xs font-semibold text-ink-secondary">Harness de verificación disponible</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {workspaceQAContractLabels(source).map((label) => (
                              <span
                                key={label}
                                className="rounded-full bg-emerald-500/[0.08] px-2 py-1 text-[10px] font-medium text-emerald-800"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-ink-muted">
                            El plan debe usar estas capacidades reales; los comandos y sus argumentos permanecen
                            privados en el runner local.
                          </p>
                        </div>
                      )}
                      {typeof source.metadata?.excerpt === 'string' && source.metadata.excerpt && (
                        <p className="mt-3 border-t border-border-subtle pt-3 text-xs leading-5 text-ink-secondary">
                          {source.metadata.excerpt}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-ink-muted">
                        Revisión:{' '}
                        {source.revision ||
                          (source.status === 'pending_sync' ? 'esperando sincronización remota' : 'sin especificar')}
                      </p>
                      {isRemoteMetadataRepository(source) && remoteRepositoryMapFileCount(source) > 0 && (
                        <p className="mt-2 text-xs leading-5 text-ink-muted">
                          Inventario versionado disponible para el plan. El agente conoce la estructura, pero no puede
                          modificar este repositorio hasta que exista un workspace local registrado.
                        </p>
                      )}
                      {source.kind === 'repository' && source.metadata?.local_workspace_dirty === true && (
                        <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-2.5 py-2 text-xs leading-5 text-amber-900">
                          Hay {localChangeCount(source) ?? 'algunos'} cambio
                          {(localChangeCount(source) ?? 2) === 1 ? '' : 's'} local
                          {(localChangeCount(source) ?? 2) === 1 ? '' : 'es'} sin commit. El checkpoint conserva el SHA
                          base; confirma, guarda o aparta ese trabajo antes de pedir una ejecución Delivery.
                        </p>
                      )}
                      {isWorkspaceRepository(source) && knownRemoteAhead(source) > 0 && (
                        <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-2.5 py-2 text-xs leading-5 text-amber-900">
                          La rama de seguimiento tiene {knownRemoteAhead(source)} commit
                          {knownRemoteAhead(source) === 1 ? '' : 's'} conocidos por incorporar. Delivery se detiene
                          antes de llamar al agente; sincroniza manualmente con la identidad humana correcta y actualiza
                          el checkpoint.
                        </p>
                      )}
                      {source.kind === 'repository' && source.reference.startsWith('workspace://') && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
                          <p className="text-xs leading-5 text-ink-muted">
                            Lee únicamente el SHA, rama, estado local y capacidades configuradas; no modifica el
                            repositorio.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {workspaceCanFetchRemote(source) && (
                              <button
                                type="button"
                                onClick={() => void fetchLocalRemoteRefs(source.id)}
                                disabled={submitting === 'fetch-remote'}
                                className="min-h-9 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink transition hover:bg-surface-interactive disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {submitting === 'fetch-remote' ? 'Consultando remoto…' : 'Actualizar referencias'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void refreshLocalContext(source.id)}
                              disabled={submitting === 'refresh'}
                              className="min-h-9 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink transition hover:bg-surface-interactive disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {submitting === 'refresh' ? 'Actualizando…' : 'Actualizar checkpoint'}
                            </button>
                          </div>
                        </div>
                      )}
                      {source.kind === 'repository' && source.reference.startsWith('github://') && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
                          <p className="text-xs leading-5 text-ink-muted">
                            Lectura remota con GitHub App; conserva identidad, rama y SHA. El agente no recibe código ni
                            puede marcar este repositorio para cambios hasta que exista un workspace:// local.
                          </p>
                          <button
                            type="button"
                            onClick={() => void refreshRemoteContext(source.id)}
                            disabled={submitting === 'refresh'}
                            className="min-h-9 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink transition hover:bg-surface-interactive disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {submitting === 'refresh' ? 'Actualizando…' : 'Actualizar revisión'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              </div>
            </details>
            <section className="grid gap-5 lg:grid-cols-2">
              <section className="premium-surface rounded-3xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
                      Gobierno del resultado
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-ink">Personas y fuentes de decisión</h2>
                  </div>
                  <Badge color="indigo">{members.length} miembros</Badge>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-surface-soft p-3">
                    <p className="text-xs text-ink-muted">Repositorios</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{repositories.length}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-soft p-3">
                    <p className="text-xs text-ink-muted">Ambientes</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{environments.length}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-soft p-3">
                    <p className="text-xs text-ink-muted">Decisiones</p>
                    <p className="mt-1 text-xl font-semibold text-ink">{decisions.length}</p>
                  </div>
                </div>
                <form
                  onSubmit={saveMember}
                  className="mt-5 rounded-2xl border border-border-subtle bg-surface-soft p-4"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="min-w-48 flex-1 text-sm font-medium text-ink">
                      Asignar por correo
                      <input
                        required
                        type="email"
                        value={member.email}
                        onChange={(event) => setMember({ ...member, email: event.target.value })}
                        placeholder="persona@empresa.com"
                        className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm"
                      />
                    </label>
                    <label className="min-w-40 text-sm font-medium text-ink">
                      Rol
                      <select
                        value={member.role}
                        onChange={(event) => setMember({ ...member, role: event.target.value })}
                        className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm"
                      >
                        <option value="viewer">Solo lectura</option>
                        <option value="requester">Solicitudes</option>
                        <option value="reviewer">Revisión de plan/código</option>
                        <option value="qa_reviewer">Revisión QA</option>
                        <option value="delivery_manager">Gestión de Delivery</option>
                        <option value="owner">Propietario</option>
                      </select>
                    </label>
                    <Button color="indigo" type="submit" disabled={submitting === 'member'}>
                      {submitting === 'member' ? 'Actualizando…' : 'Asignar acceso'}
                    </Button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink-muted">
                    Sólo administradores globales pueden cambiar este gobierno. El rol determina qué gates puede ver o
                    decidir la persona.
                  </p>
                </form>
                {members.length === 0 ? (
                  <p className="mt-5 rounded-2xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted">
                    Aún no hay miembros explícitos. Los administradores globales conservan control de esta operación.
                  </p>
                ) : (
                  <ul className="mt-5 divide-y divide-border-subtle rounded-2xl border border-border-subtle">
                    {members.map((member) => (
                      <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">{member.role.replaceAll('_', ' ')}</span>
                          <span className="block truncate font-mono text-xs text-ink-muted" title={member.cognito_sub}>
                            {compactIdentity(member.cognito_sub)}
                          </span>
                        </span>
                        <Badge color={member.role === 'owner' ? 'emerald' : 'indigo'}>
                          {member.role === 'owner' ? 'Control total' : 'Asignado'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="premium-surface rounded-3xl p-5 sm:p-6">
                <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Actividad</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">Cambios y decisiones trazables</h2>
                {activity.length === 0 ? (
                  <p className="mt-5 rounded-2xl bg-surface-soft p-4 text-sm text-ink-muted">
                    La actividad aparecerá al registrar contexto, trabajo o gates humanos.
                  </p>
                ) : (
                  <>
                  <ol className="mt-5 space-y-4">
                    {visibleActivity.map((entry) => (
                      <li key={entry.id} className="flex gap-3">
                        <span
                          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${entry.tone === 'emerald' ? 'bg-emerald-500' : entry.tone === 'rose' ? 'bg-rose-500' : entry.tone === 'amber' ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">{entry.title}</span>
                          <span className="block text-sm text-ink-secondary">{entry.detail}</span>
                          <span className="mt-0.5 block text-xs text-ink-muted">{displayDate(entry.at)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  {hiddenActivityCount > 0 && (
                    <details className="group mt-4 border-t border-border-subtle pt-3">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent)">
                        Ver {hiddenActivityCount} movimiento{hiddenActivityCount === 1 ? '' : 's'} anterior{hiddenActivityCount === 1 ? '' : 'es'}
                        <ChevronDownIcon className="size-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                      </summary>
                      <ol className="mt-3 space-y-4 border-t border-border-subtle pt-4">
                        {activity.slice(3).map((entry) => (
                          <li key={entry.id} className="flex gap-3">
                            <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${entry.tone === 'emerald' ? 'bg-emerald-500' : entry.tone === 'rose' ? 'bg-rose-500' : entry.tone === 'amber' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
                            <span className="min-w-0"><span className="block text-sm font-medium text-ink">{entry.title}</span><span className="block text-sm text-ink-secondary">{entry.detail}</span><span className="mt-0.5 block text-xs text-ink-muted">{displayDate(entry.at)}</span></span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  </>
                )}
              </section>
            </section>
            <section className="premium-surface overflow-hidden rounded-3xl">
              <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Tareas</p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">Trabajo con gates</h2>
                </div>
                <Badge color="indigo">{workItems.length}</Badge>
              </div>
              {workItems.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-muted">
                  Todavía no hay tareas. Cada una debe tener un resultado y criterios de aceptación concretos.
                </div>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {visibleWorkItems.map((workItem) => (
                    <li key={workItem.id}>
                      <Link
                        href={`/automation/work-items/${workItem.id}`}
                        className="group flex gap-4 px-5 py-5 hover:bg-surface-soft sm:px-6"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
                          <CheckCircleIcon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{workItem.title}</span>
                            <Badge color={workItem.state === 'released' ? 'emerald' : 'amber'}>
                              {stateLabel[workItem.state] ?? workItem.state}
                            </Badge>
                          </span>
                          <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">
                            {workItem.expected_outcome}
                          </span>
                        </span>
                        <ArrowRightIcon className="mt-2 size-5 text-ink-muted group-hover:text-ink" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {hiddenWorkItemCount > 0 && (
                <details className="group border-t border-border-subtle">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-xs font-semibold text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) sm:px-6">
                    Ver {hiddenWorkItemCount} tarea{hiddenWorkItemCount === 1 ? '' : 's'} anterior{hiddenWorkItemCount === 1 ? '' : 'es'}
                    <ChevronDownIcon className="size-4 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </summary>
                  <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                    {workItems.filter((workItem) => !visibleWorkItems.some((visible) => visible.id === workItem.id)).map((workItem) => (
                      <li key={workItem.id}>
                        <Link href={`/automation/work-items/${workItem.id}`} className="group flex gap-4 px-5 py-5 hover:bg-surface-soft sm:px-6">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><CheckCircleIcon className="size-5" /></span>
                          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{workItem.title}</span><Badge color={workItem.state === 'released' ? 'emerald' : 'amber'}>{stateLabel[workItem.state] ?? workItem.state}</Badge></span><span className="mt-1 line-clamp-2 block text-sm text-ink-muted">{workItem.expected_outcome}</span></span>
                          <ArrowRightIcon className="mt-2 size-5 text-ink-muted group-hover:text-ink" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </section>
          <aside className="order-1 space-y-5 xl:order-none">
            <section className="app-hero-surface rounded-3xl p-5 sm:p-6">
              <p className="text-xs font-semibold tracking-[0.14em] text-(--tenant-accent) uppercase">
                Empezar con intención
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">¿Qué necesitas lograr?</h2>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                Describe el resultado en tus palabras. El sistema conserva tu solicitud, propone su estructura y te pide
                aprobación antes de ejecutar.
              </p>
              <label className="sr-only" htmlFor="delivery-intent">
                Necesidad del proyecto
              </label>
              <Button
                color="indigo"
                type="button"
                onClick={openProjectIntent}
                className="mt-4 w-full"
              >
                <PlusIcon data-slot="icon" />
                Crear solicitud
              </Button>
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                La IA no infiere permisos, alcance final ni despliegues: los propone y espera el gate humano.
              </p>
            </section>
            {requests.some((request) => request.status === 'open') && (
              <section className="premium-surface rounded-3xl p-5">
                <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Siguiente decisión</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">Pedir propuesta de plan</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  El agente usará únicamente las fuentes listas del proyecto y se detendrá al entregar el plan para tu
                  revisión.
                </p>
                <Button
                  color="indigo"
                  type="button"
                  disabled={submitting === 'task'}
                  onClick={() => void preparePlan(requests.find((request) => request.status === 'open')!)}
                  className="mt-4 w-full"
                >
                  <DocumentPlusIcon data-slot="icon" />
                  {submitting === 'task' ? 'Preparando plan…' : 'Pedir plan al agente'}
                </Button>
              </section>
            )}
            <details className="premium-surface rounded-3xl">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink marker:hidden sm:px-6">
                Configuración y captura avanzada{' '}
                <span className="ml-2 font-normal text-ink-muted">fuentes, campos detallados y tareas manuales</span>
              </summary>
              <div className="space-y-5 border-t border-border-subtle p-5">
                <form onSubmit={createRequest} className="premium-surface rounded-3xl p-5">
                  <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Nueva solicitud</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    La petición humana se conserva antes de dividir el trabajo.
                  </p>
                  <label className="mt-4 block text-sm font-medium text-ink">
                    Título
                    <input
                      required
                      value={request.title}
                      onChange={(event) => setRequest({ ...request, title: event.target.value })}
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Prioridad
                    <select
                      value={request.priority}
                      onChange={(event) => setRequest({ ...request, priority: event.target.value })}
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    >
                      <option value="low">Baja</option>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Necesidad
                    <textarea
                      value={request.body}
                      onChange={(event) => setRequest({ ...request, body: event.target.value })}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Resultado esperado
                    <textarea
                      required
                      value={request.expectedOutcome}
                      onChange={(event) => setRequest({ ...request, expectedOutcome: event.target.value })}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Restricciones <span className="font-normal text-ink-muted">(una por línea)</span>
                    <textarea
                      value={request.constraints}
                      onChange={(event) => setRequest({ ...request, constraints: event.target.value })}
                      rows={2}
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <Button color="indigo" type="submit" disabled={submitting === 'request'} className="mt-4 w-full">
                    {submitting === 'request' ? 'Guardando…' : 'Registrar solicitud'}
                  </Button>
                </form>
                <form onSubmit={addContext} className="premium-surface rounded-3xl p-5">
                  <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Añadir contexto</p>
                  <label className="mt-4 block text-sm font-medium text-ink">
                    Tipo
                    <select
                      value={context.kind}
                      onChange={(event) => setContext({ ...context, kind: event.target.value })}
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    >
                      {contextKinds.map((kind) => (
                        <option key={kind}>{kind}</option>
                      ))}
                    </select>
                  </label>
                  {context.kind === 'repository' && (
                    <label className="mt-3 block text-sm font-medium text-ink">
                      Rol en el cambio
                      <select
                        value={context.repositoryRole}
                        onChange={(event) => setContext({ ...context, repositoryRole: event.target.value })}
                        className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                      >
                        <option value="primary">Principal: puede recibir el worktree aislado</option>
                        <option value="supporting">De apoyo: sólo contexto y dependencias</option>
                      </select>
                      <span className="mt-1 block text-xs leading-5 font-normal text-ink-muted">
                        Un proyecto puede tener varios repositorios; cada tarea que implemente cambios requiere
                        exactamente uno principal.
                      </span>
                    </label>
                  )}
                  {context.kind === 'repository' && (
                    <label className="mt-3 block text-sm font-medium text-ink">
                      Superficie operativa
                      <select
                        value={context.repositoryKind}
                        onChange={(event) => setContext({ ...context, repositoryKind: event.target.value })}
                        className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                      >
                        {repositoryKinds.map((kind) => (
                          <option key={kind.value} value={kind.value}>
                            {kind.label}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs leading-5 font-normal text-ink-muted">
                        Ayuda al agente a cubrir los contratos entre frontend, API, workers, Lambdas e infraestructura
                        sin adivinar su arquitectura.
                      </span>
                    </label>
                  )}
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Nombre
                    <input
                      required
                      value={context.name}
                      onChange={(event) => setContext({ ...context, name: event.target.value })}
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Referencia
                    <input
                      required
                      value={context.reference}
                      onChange={(event) => setContext({ ...context, reference: event.target.value })}
                      placeholder="workspace://itbem-events-backend o github://Itbem-Corp/repo"
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 font-mono text-xs"
                    />
                    {context.kind === 'repository' && context.reference.startsWith('github://') && (
                      <span className="mt-2 block rounded-xl border border-sky-500/15 bg-sky-500/[0.05] px-3 py-2 text-xs leading-5 font-normal text-ink-secondary">
                        Esta referencia suma contexto remoto versionado. Para implementar o publicar cambios registra
                        también el checkout local como <code>workspace://id</code>.
                      </span>
                    )}
                    {context.kind === 'repository' && context.reference.startsWith('workspace://') && (
                      <span className="mt-2 block text-xs leading-5 font-normal text-ink-muted">
                        Este workspace puede aportar código acotado, worktrees aislados y validaciones configuradas. La
                        publicación sigue requiriendo revisión humana y GitHub App.
                      </span>
                    )}
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Revisión
                    <input
                      value={context.revision}
                      onChange={(event) => setContext({ ...context, revision: event.target.value })}
                      placeholder="commit, versión o fecha"
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    />
                  </label>
                  {context.kind === 'repository' && (
                    <>
                      <label className="mt-3 block text-sm font-medium text-ink">
                        Responsabilidad del repositorio <span className="font-normal text-ink-muted">(opcional)</span>
                        <textarea
                          value={context.repositoryResponsibility}
                          onChange={(event) => setContext({ ...context, repositoryResponsibility: event.target.value })}
                          maxLength={2000}
                          rows={2}
                          placeholder="Ej. API pública, reglas de negocio y contratos compartidos."
                          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="mt-3 block text-sm font-medium text-ink">
                        Depende de repositorios{' '}
                        <span className="font-normal text-ink-muted">(workspace://, uno por línea)</span>
                        <textarea
                          value={context.dependsOnRepositories}
                          onChange={(event) => setContext({ ...context, dependsOnRepositories: event.target.value })}
                          rows={2}
                          placeholder="workspace://itbem-dashboard"
                          className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 font-mono text-xs"
                        />
                        <span className="mt-1 block text-xs leading-5 font-normal text-ink-muted">
                          Sólo puedes referenciar repositorios ya registrados en este proyecto.
                        </span>
                      </label>
                    </>
                  )}
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Extracto para el agente{' '}
                    <span className="font-normal text-ink-muted">(opcional, máximo 12,000 caracteres)</span>
                    <textarea
                      value={context.excerpt}
                      onChange={(event) => setContext({ ...context, excerpt: event.target.value })}
                      maxLength={12000}
                      rows={4}
                      placeholder="Decisión, conversación reciente o condiciones concretas que el agente debe considerar. No incluyas credenciales."
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <Button color="indigo" type="submit" disabled={submitting === 'context'} className="mt-4 w-full">
                    <DocumentPlusIcon data-slot="icon" />
                    {submitting === 'context' ? 'Guardando…' : 'Guardar fuente'}
                  </Button>
                </form>
                <form onSubmit={createTask} className="premium-surface rounded-3xl p-5">
                  <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Nueva tarea</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Selecciona sólo el contexto mínimo que el agente necesita; quedará congelado al crearla.
                  </p>
                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium text-ink">
                      Contexto usado <span className="text-rose-600">*</span>
                    </legend>
                    <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border-subtle bg-surface-soft p-2">
                      {contexts.map((source) => {
                        const checked = task.contextSourceIds.includes(source.id)
                        const ready = source.status === 'ready'
                        return (
                          <label
                            key={source.id}
                            className={`flex items-start gap-2 rounded-lg p-2 text-xs ${ready ? 'cursor-pointer hover:bg-surface-raised' : 'cursor-not-allowed opacity-55'}`}
                          >
                            <input
                              type="checkbox"
                              disabled={!ready}
                              checked={checked}
                              onChange={() =>
                                setTask({
                                  ...task,
                                  contextSourceIds: checked
                                    ? task.contextSourceIds.filter((id) => id !== source.id)
                                    : [...task.contextSourceIds, source.id],
                                })
                              }
                              className="mt-0.5"
                            />
                            <span>
                              <span className="font-semibold text-ink">{source.name}</span>
                              <span className="mt-0.5 block font-mono text-[10px] text-ink-muted">
                                {ready ? source.revision || source.kind : 'sin revisión verificable'}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                  {workItems.length > 0 && (
                    <fieldset className="mt-4">
                      <legend className="text-sm font-medium text-ink">
                        Dependencias <span className="font-normal text-ink-muted">(opcional)</span>
                      </legend>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        La tarea no podrá entrar a revisión de plan hasta que estas entregas estén liberadas.
                      </p>
                      <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-xl border border-border-subtle bg-surface-soft p-2">
                        {workItems.map((workItem) => {
                          const checked = task.dependsOnWorkItemIds.includes(workItem.id)
                          return (
                            <label
                              key={workItem.id}
                              className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-xs hover:bg-surface-raised"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setTask({
                                    ...task,
                                    dependsOnWorkItemIds: checked
                                      ? task.dependsOnWorkItemIds.filter((id) => id !== workItem.id)
                                      : [...task.dependsOnWorkItemIds, workItem.id],
                                  })
                                }
                                className="mt-0.5"
                              />
                              <span>
                                <span className="font-semibold text-ink">{workItem.title}</span>
                                <span className="mt-0.5 block text-[10px] text-ink-muted">
                                  {stateLabel[workItem.state] ?? workItem.state}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  )}
                  <label className="mt-4 block text-sm font-medium text-ink">
                    Solicitud de origen <span className="font-normal text-ink-muted">(opcional)</span>
                    <select
                      value={task.requestId}
                      onChange={(event) => setTask({ ...task, requestId: event.target.value })}
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    >
                      <option value="">Trabajo directo / sin solicitud</option>
                      {requests
                        .filter((request) => request.status === 'open')
                        .map((request) => (
                          <option key={request.id} value={request.id}>
                            {request.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Título
                    <input
                      required
                      value={task.title}
                      onChange={(event) => setTask({ ...task, title: event.target.value })}
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Contexto de la solicitud
                    <textarea
                      value={task.description}
                      onChange={(event) => setTask({ ...task, description: event.target.value })}
                      rows={3}
                      placeholder="Qué motivó el trabajo, restricciones o información relevante"
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Resultado esperado
                    <textarea
                      required
                      value={task.expectedOutcome}
                      onChange={(event) => setTask({ ...task, expectedOutcome: event.target.value })}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Alcance incluido <span className="font-normal text-ink-muted">(uno por línea)</span>
                    <textarea
                      value={task.includedScope}
                      onChange={(event) => setTask({ ...task, includedScope: event.target.value })}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Fuera de alcance <span className="font-normal text-ink-muted">(uno por línea)</span>
                    <textarea
                      value={task.excludedScope}
                      onChange={(event) => setTask({ ...task, excludedScope: event.target.value })}
                      rows={3}
                      placeholder="Lo que esta tarea no debe cambiar"
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Criterios de aceptación <span className="font-normal text-ink-muted">(uno por línea)</span>
                    <textarea
                      value={task.acceptance}
                      onChange={(event) => setTask({ ...task, acceptance: event.target.value })}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-ink">
                    Límite de IA para esta tarea <span className="font-normal text-ink-muted">(USD, opcional)</span>
                    <input
                      type="number"
                      min="0"
                      max="100000"
                      step="0.01"
                      value={task.budgetUsd}
                      onChange={(event) => setTask({ ...task, budgetUsd: event.target.value })}
                      placeholder="Sin límite adicional"
                      className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm"
                    />
                    <span className="mt-1 block text-xs leading-5 text-ink-muted">
                      Si lo defines, el agente no podrá reservar una llamada que rebase este tope, aunque el proyecto
                      todavía tenga saldo mensual.
                    </span>
                  </label>
                  <Button
                    color="indigo"
                    type="submit"
                    disabled={submitting === 'task' || task.contextSourceIds.length === 0}
                    className="mt-4 w-full"
                  >
                    <PlusIcon data-slot="icon" />
                    {submitting === 'task' ? 'Creando…' : 'Crear tarea'}
                  </Button>
                </form>
              </div>
            </details>
            {message && (
              <p
                role="status"
                className="rounded-2xl border border-border-subtle bg-surface-soft p-3 text-xs leading-5 text-ink-secondary"
              >
                {message}
              </p>
            )}
          </aside>
        </div>
          </div>}
        </details>
        <Dialog open={intentOpen} onClose={setIntentOpen} size="md">
          <DialogTitle>Iniciar un resultado</DialogTitle>
          <DialogBody>
            <p className="text-sm leading-6 text-ink-secondary">Describe el resultado. El agente lo convierte en una propuesta acotada y se detiene en el gate correcto.</p>
            <form onSubmit={captureIntent} className="mt-5">
              <label className="text-sm font-semibold text-ink" htmlFor="delivery-intent-dialog">Resultado que necesitas</label>
              <textarea
                id="delivery-intent-dialog"
                required
                ref={intentFieldRef}
                autoFocus
                value={quickIntent}
                onChange={(event) => setQuickIntent(event.target.value)}
                rows={5}
                maxLength={12000}
                placeholder="Ej. Necesito que el dashboard permita revisar una entrega en móvil, con evidencia clara."
                className="mt-2 w-full resize-y rounded-2xl border border-border-subtle bg-surface-soft px-3 py-3 text-sm leading-6 text-ink outline-none focus:border-(--tenant-accent)"
              />
              <DialogActions>
                <Button plain type="button" onClick={() => setIntentOpen(false)}>Cancelar</Button>
                <Button color="indigo" type="submit" disabled={submitting === 'request' || !quickIntent.trim()}>
                  <PlusIcon data-slot="icon" />
                  {submitting === 'request' ? 'Guardando…' : 'Crear solicitud'}
                </Button>
              </DialogActions>
            </form>
          </DialogBody>
        </Dialog>
      </main>
    </PageTransition>
  )
}
