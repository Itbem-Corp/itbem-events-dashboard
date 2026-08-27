'use client'

import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import {
  automationExecutionInputPath,
  automationExecutionResultPath,
  automationTaskArtifactPath,
  automationTaskInputPath,
  automationTaskResultPath,
  automationToolExecutionReportPath,
} from '@/lib/api-paths'
import { verifyArtifactIntegrity } from '@/lib/automation-artifact-integrity'
import { ArrowDownTrayIcon, ArrowPathIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useEffect, useRef, useState } from 'react'
import {
  deliveryExecutionResult,
  deliveryPublicationResult,
  deliveryQAReport,
  deliveryReleaseDraft,
  type DeliveryCheck,
  type DeliveryReleaseDraft,
} from './delivery-result-data'

type Artifact = { name: string; content_type?: string; size_bytes?: number; sha256?: string }
type RepositoryImpact = {
  name: string
  reference: string
  revision: string
  role: 'primary' | 'supporting'
  impact: 'changes' | 'consulted' | 'untouched'
  notes: string
}
type QAExecutionMatrixEntry = {
  repository_ref: string
  run_validation: boolean
  run_qa: boolean
  run_stagehand: boolean
  collect_evidence: boolean
}
type BrowserQAProposal = {
  mode: 'read_only' | 'approved_navigation' | 'approved_test_flow'
  cases: Array<{
    id: string
    title: string
    steps: Array<{
      kind: string
      path?: string
      selector?: string
      text?: string
      expected_path?: string
      value_env?: string
    }>
  }>
  requiresHumanRevision: boolean
}
type ProductDirection = {
  name: string
  user_outcome: string
  smallest_slice: string
  trade_off: string
  risk: string
  success_signal: string
}
type ProductIdeationBrief = {
  summary: string
  directions: ProductDirection[]
  recommendation: { direction: string; rationale: string; first_experiment: string }
  open_questions?: string[]
}
type CodeReviewFinding = {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  title: string
  file: string
  side: 'head' | 'base'
  line_start: number
  line_end: number
  evidence: string
  recommendation: string
  confidence: number
}
type CodeReview = {
  summary: string
  verdict: 'approve' | 'comment' | 'request_changes' | 'blocked'
  review_scope: string[]
  findings: CodeReviewFinding[]
  test_plan: string[]
  coverage_gaps: string[]
}
type DeliveryPlan = {
  summary: string
  estimate: string
  goal_interpretation?: string
  confidence?: number
  autonomy_boundary?: string
  context_reviewed: string[]
  assumptions: string[]
  implementation_steps: string[]
  files_impacted: string[]
  risks: string[]
  qa_plan: string[]
  evidence_plan: string[]
  acceptance_criteria: string[]
  repository_impact: RepositoryImpact[]
  qa_execution_matrix?: QAExecutionMatrixEntry[]
  questions: string[]
  context_gaps?: string[]
  human_decisions?: string[]
  rollback_plan?: string[]
}
type AgentOutput = {
  content?: string
  validation_error?: string
  structured_result?: unknown
  artifacts?: { artifacts?: Artifact[]; [key: string]: unknown }
}

type ProviderOutcome = {
  finish_reason?: string
  input_sensitive?: boolean
  output_sensitive?: boolean
  status_code?: number
}

type ExecutionLedgerEntry = {
  provider_outcome?: ProviderOutcome
}

const planSections: Array<{
  key:
    | 'context_reviewed'
    | 'assumptions'
    | 'implementation_steps'
    | 'files_impacted'
    | 'risks'
    | 'qa_plan'
    | 'evidence_plan'
    | 'acceptance_criteria'
    | 'questions'
  label: string
}> = [
  { key: 'context_reviewed', label: 'Contexto revisado' },
  { key: 'assumptions', label: 'Suposiciones' },
  { key: 'implementation_steps', label: 'Pasos de implementación' },
  { key: 'files_impacted', label: 'Archivos impactados' },
  { key: 'risks', label: 'Riesgos' },
  { key: 'qa_plan', label: 'Plan de QA' },
  { key: 'evidence_plan', label: 'Evidencia esperada' },
  { key: 'acceptance_criteria', label: 'Criterios de aceptación' },
  { key: 'questions', label: 'Preguntas pendientes' },
]

const advancedPlanSections = [
  { key: 'context_gaps', label: 'Información que falta' },
  { key: 'human_decisions', label: 'Decisiones que quedan en manos del equipo' },
  { key: 'rollback_plan', label: 'Cómo revertir con seguridad' },
] as const

const impactLabel: Record<RepositoryImpact['impact'], string> = {
  changes: 'Cambios propuestos',
  consulted: 'Consultado',
  untouched: 'Sin cambios',
}

function isRepositoryImpact(value: unknown): value is RepositoryImpact[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const item = entry as Partial<RepositoryImpact>
      return (
        typeof item.name === 'string' &&
        typeof item.reference === 'string' &&
        typeof item.revision === 'string' &&
        (item.role === 'primary' || item.role === 'supporting') &&
        (item.impact === 'changes' || item.impact === 'consulted' || item.impact === 'untouched') &&
        typeof item.notes === 'string'
      )
    })
  )
}

function isQAExecutionMatrix(value: unknown): value is QAExecutionMatrixEntry[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const item = entry as Partial<QAExecutionMatrixEntry>
      return (
        typeof item.repository_ref === 'string' &&
        typeof item.run_validation === 'boolean' &&
        typeof item.run_qa === 'boolean' &&
        typeof item.run_stagehand === 'boolean' &&
        typeof item.collect_evidence === 'boolean'
      )
    })
  )
}

function isProductIdeationBrief(value: unknown): value is ProductIdeationBrief {
  if (!value || typeof value !== 'object') return false
  const brief = value as Partial<ProductIdeationBrief>
  if (typeof brief.summary !== 'string' || !Array.isArray(brief.directions) || !brief.recommendation) return false
  const recommendation = brief.recommendation
  return (
    typeof recommendation.direction === 'string' &&
    typeof recommendation.rationale === 'string' &&
    typeof recommendation.first_experiment === 'string' &&
    brief.directions.every(
      (direction) =>
        direction &&
        typeof direction.name === 'string' &&
        typeof direction.user_outcome === 'string' &&
        typeof direction.smallest_slice === 'string' &&
        typeof direction.trade_off === 'string' &&
        typeof direction.risk === 'string' &&
        typeof direction.success_signal === 'string'
    ) &&
    (brief.open_questions === undefined || brief.open_questions.every((question) => typeof question === 'string'))
  )
}

function isCodeReview(value: unknown): value is CodeReview {
  if (!value || typeof value !== 'object') return false
  const review = value as Partial<CodeReview>
  return (
    typeof review.summary === 'string' &&
    (review.verdict === 'approve' || review.verdict === 'comment' || review.verdict === 'request_changes' || review.verdict === 'blocked') &&
    Array.isArray(review.review_scope) && review.review_scope.every((item) => typeof item === 'string') &&
    Array.isArray(review.test_plan) && review.test_plan.every((item) => typeof item === 'string') &&
    Array.isArray(review.coverage_gaps) && review.coverage_gaps.every((item) => typeof item === 'string') &&
    Array.isArray(review.findings) && review.findings.every((finding) => {
      if (!finding || typeof finding !== 'object') return false
      const item = finding as Partial<CodeReviewFinding>
      return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.file === 'string' &&
        (item.severity === 'critical' || item.severity === 'high' || item.severity === 'medium' || item.severity === 'low') &&
        (item.side === 'head' || item.side === 'base') && typeof item.line_start === 'number' && typeof item.line_end === 'number' &&
        typeof item.evidence === 'string' && typeof item.recommendation === 'string' && typeof item.confidence === 'number'
    })
  )
}

const reviewVerdictLabel: Record<CodeReview['verdict'], string> = {
  approve: 'Sin bloqueos detectados', comment: 'Comentarios no bloqueantes', request_changes: 'Cambios requeridos', blocked: 'Revisión bloqueada',
}
const reviewVerdictTone: Record<CodeReview['verdict'], string> = {
  approve: 'border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-800', comment: 'border-sky-500/25 bg-sky-500/[0.05] text-sky-800',
  request_changes: 'border-rose-500/25 bg-rose-500/[0.05] text-rose-800', blocked: 'border-amber-500/25 bg-amber-500/[0.055] text-amber-800',
}

function isDeliveryPlan(value: unknown): value is DeliveryPlan {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DeliveryPlan>
  return (
    typeof candidate.summary === 'string' &&
    typeof candidate.estimate === 'string' &&
    isRepositoryImpact(candidate.repository_impact) &&
    (candidate.qa_execution_matrix === undefined || isQAExecutionMatrix(candidate.qa_execution_matrix)) &&
    planSections.every(
      ({ key }) => Array.isArray(candidate[key]) && candidate[key].every((item) => typeof item === 'string')
    )
  )
}

function browserQAProposal(plan: DeliveryPlan): BrowserQAProposal | null {
  const source = plan as DeliveryPlan & Record<string, unknown>
  const rawCases = source.browser_qa_cases
  const rawMode = source.browser_qa_mode
  const review = objectValue(source.browser_qa_review)
  const requiresHumanRevision = review?.status === 'requires_human_revision'
  if (!Array.isArray(rawCases) && !requiresHumanRevision) return null
  const mode = rawMode === 'approved_navigation' || rawMode === 'approved_test_flow' ? rawMode : 'read_only'
  const cases = Array.isArray(rawCases)
    ? rawCases.flatMap((rawCase) => {
        const testCase = objectValue(rawCase)
        const id = typeof testCase?.id === 'string' ? testCase.id : ''
        const title = typeof testCase?.title === 'string' ? testCase.title : ''
        const steps = Array.isArray(testCase?.steps)
          ? testCase.steps.flatMap((rawStep) => {
              const step = objectValue(rawStep)
              const kind = typeof step?.kind === 'string' ? step.kind : ''
              if (!step || !kind) return []
              return [
                {
                  kind,
                  ...(typeof step.path === 'string' ? { path: step.path } : {}),
                  ...(typeof step.selector === 'string' ? { selector: step.selector } : {}),
                  ...(typeof step.text === 'string' ? { text: step.text } : {}),
                  ...(typeof step.expected_path === 'string' ? { expected_path: step.expected_path } : {}),
                  ...(typeof step.value_env === 'string' ? { value_env: step.value_env } : {}),
                },
              ]
            })
          : []
        return id && title && steps.length > 0 ? [{ id, title, steps }] : []
      })
    : []
  return { mode, cases, requiresHumanRevision }
}

function browserQAModeLabel(mode: BrowserQAProposal['mode']) {
  if (mode === 'approved_test_flow') return 'Flujo de prueba aislado'
  if (mode === 'approved_navigation') return 'Navegación aprobada'
  return 'Sólo lectura'
}

function browserStepSummary(step: BrowserQAProposal['cases'][number]['steps'][number]) {
  return step.path ?? step.expected_path ?? step.selector ?? step.text ?? step.value_env ?? 'Paso registrado'
}

type RequestAuditSummary = {
  operation?: string
  model?: string
  messages?: number
  maxTokens?: number
  exactWirePayload: boolean
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function executionRequestSummary(value: unknown): RequestAuditSummary | null {
  const audit = objectValue(value)
  if (!audit) return null
  const request = objectValue(audit.request)
  if (!request) return null
  const wirePayload = objectValue(request.wire_payload)
  const payload = wirePayload ?? request
  const messages = Array.isArray(payload.messages) ? payload.messages.length : undefined
  const maxTokens = numericValue(payload.max_completion_tokens) ?? numericValue(payload.max_tokens)
  const model = typeof payload.model === 'string' ? payload.model : undefined
  const operation = typeof audit.operation === 'string' ? audit.operation : undefined
  if (!operation && !model && messages === undefined && maxTokens === undefined) return null
  return { operation, model, messages, maxTokens, exactWirePayload: wirePayload !== null }
}

function providerOutcome(value: unknown): ProviderOutcome | null {
  const source = objectValue(value)
  if (!source) return null
  const finishReason =
    typeof source.finish_reason === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(source.finish_reason)
      ? source.finish_reason
      : undefined
  const inputSensitive = source.input_sensitive === true
  const outputSensitive = source.output_sensitive === true
  const statusCode = numericValue(source.status_code)
  const normalizedStatus =
    statusCode !== undefined && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 999
      ? statusCode
      : undefined
  if (!finishReason && !inputSensitive && !outputSensitive && normalizedStatus === undefined) return null
  return {
    ...(finishReason ? { finish_reason: finishReason } : {}),
    ...(inputSensitive ? { input_sensitive: true } : {}),
    ...(outputSensitive ? { output_sensitive: true } : {}),
    ...(normalizedStatus !== undefined ? { status_code: normalizedStatus } : {}),
  }
}

function ProviderOutcomeSummary({ outcome }: { outcome: ProviderOutcome | null }) {
  if (!outcome) return null
  const sensitivity = outcome.input_sensitive || outcome.output_sensitive
  return (
    <section
      className={`mt-4 rounded-xl border p-3 ${sensitivity || (outcome.status_code !== undefined && outcome.status_code >= 400) ? 'border-amber-500/25 bg-amber-500/[0.045]' : 'border-border-subtle bg-surface-raised'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink">Desenlace del proveedor</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Metadatos mínimos de la inferencia; no contienen prompt, response ni razonamiento.
          </p>
        </div>
        {outcome.status_code !== undefined && (
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${outcome.status_code < 400 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}
          >
            HTTP {outcome.status_code}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {outcome.finish_reason && (
          <span className="rounded-full bg-indigo-500/10 px-2 py-1 font-semibold text-indigo-700">
            Finalizó: {outcome.finish_reason}
          </span>
        )}
        {outcome.input_sensitive && (
          <span className="rounded-full bg-amber-500/10 px-2 py-1 font-semibold text-amber-800">
            Entrada marcada sensible
          </span>
        )}
        {outcome.output_sensitive && (
          <span className="rounded-full bg-amber-500/10 px-2 py-1 font-semibold text-amber-800">
            Salida marcada sensible
          </span>
        )}
      </div>
    </section>
  )
}

// Private-object endpoints deliberately return a short-lived storage URL to
// the authenticated API client. Never put that URL in React state or the DOM:
// it could be copied from an inspector even though the object remains private.
// The UI resolves it immediately to a same-session blob URL and, for current
// QA artifacts, verifies the immutable worker digest before rendering it.
async function privateArtifactObjectURL(taskId: string, artifact: Artifact): Promise<string> {
  const name = artifact.name
  const descriptor = await api.get(automationTaskArtifactPath(taskId, name))
  const downloadURL = readApiData<{ download_url: string }>(descriptor.data).download_url
  if (!downloadURL) throw new Error('private artifact URL is unavailable')
  const response = await fetch(downloadURL, { cache: 'no-store', credentials: 'omit' })
  if (!response.ok) throw new Error(`private artifact download failed (${response.status})`)
  const content = await response.arrayBuffer()
  await verifyArtifactIntegrity(content, artifact.sha256)
  return URL.createObjectURL(
    new Blob([content], {
      type: artifact.content_type || response.headers.get('content-type') || 'application/octet-stream',
    })
  )
}

function downloadPrivateJSON(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function ExecutionChecks({ checks, emptyLabel }: { checks: DeliveryCheck[]; emptyLabel: string }) {
  if (!checks.length) return <p className="mt-2 text-xs text-ink-muted">{emptyLabel}</p>
  return (
    <ul className="mt-3 divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-soft">
      {checks.map((entry, index) => (
        <li key={`${entry.label}-${index}`} className="px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium text-ink">
              {entry.phase === 'validation' ? 'Validacion: ' : entry.phase === 'qa' ? 'QA: ' : ''}
              {entry.label}
            </span>
            <span className={entry.passed ? 'shrink-0 text-emerald-700' : 'shrink-0 text-rose-700'}>
              {entry.passed ? 'Correcto' : 'Revisar'}
            </span>
          </div>
          {entry.output && (
            <pre className="mt-2 max-h-28 overflow-auto text-[11px] leading-4 whitespace-pre-wrap text-ink-secondary">
              {entry.output}
            </pre>
          )}
        </li>
      ))}
    </ul>
  )
}

function RuntimeEvidenceList({ title, entries }: { title: string; entries: string[] }) {
  return (
    <article className="rounded-lg border border-rose-500/20 bg-rose-500/[0.035] p-2.5">
      <p className="text-[11px] font-semibold text-rose-800">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {entries.map((entry, index) => (
          <li key={`${entry}-${index}`} className="font-mono text-[10px] leading-4 break-all text-rose-800">
            {entry}
          </li>
        ))}
      </ul>
    </article>
  )
}

type DeliveryResultPanelProps = {
  taskId: string
  executionId?: string
  executionKind?: 'agent' | 'tool'
  execution?: ExecutionLedgerEntry
  diagnostic?: boolean
  diagnosticSummary?: { title: string; detail: string }
  onClose: () => void
  onUseReleaseDraft?: (draft: DeliveryReleaseDraft) => void
}

function AgentDeliveryResultPanel({
  taskId,
  executionId,
  execution: selectedExecution,
  diagnostic = false,
  diagnosticSummary,
  onClose,
  onUseReleaseDraft,
}: DeliveryResultPanelProps) {
  const [output, setOutput] = useState<AgentOutput | null>(null)
  const [input, setInput] = useState<unknown>(null)
  const [inputLoading, setInputLoading] = useState(false)
  const [inputAttempted, setInputAttempted] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [artifactIssues, setArtifactIssues] = useState<string[]>([])
  const [artifactLoading, setArtifactLoading] = useState(false)
  const artifactURLsRef = useRef<Record<string, string>>({})

  useEffect(() => {
    let active = true
    async function load() {
      setOutput(null)
      setInput(null)
      setInputLoading(false)
      setInputAttempted(false)
      Object.values(artifactURLsRef.current).forEach((url) => URL.revokeObjectURL(url))
      artifactURLsRef.current = {}
      setUrls({})
      setError('')
      setArtifactIssues([])
      setArtifactLoading(false)
      try {
        const response = await api.get(
          executionId ? automationExecutionResultPath(executionId) : automationTaskResultPath(taskId)
        )
        const value = readApiData<AgentOutput>(response.data)
        if (active) {
          setOutput(value)
        }
      } catch {
        if (active) setError(diagnostic
          ? 'Esta ejecución no dejó un resultado privado. Consulta las trazas disponibles para entender por qué se detuvo.'
          : 'No pudimos cargar este resultado privado.')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [diagnostic, executionId, taskId])

  useEffect(() => () => {
    Object.values(artifactURLsRef.current).forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const artifacts = output?.artifacts?.artifacts ?? []
  const requestAudit = executionRequestSummary(input)
  const plan = isDeliveryPlan(output?.structured_result) ? output.structured_result : null
  const productBrief = isProductIdeationBrief(output?.structured_result) ? output.structured_result : null
  const codeReview = isCodeReview(output?.structured_result) ? output.structured_result : null
  const releaseDraft = deliveryReleaseDraft(output?.structured_result)
  const execution = deliveryExecutionResult(output?.artifacts)
  const implementation = execution.implementation
  const publication = deliveryPublicationResult(output?.structured_result)
  const qaReport = deliveryQAReport(output?.structured_result)
  const selectedProviderOutcome = providerOutcome(selectedExecution?.provider_outcome)
  const providerNeedsReview = Boolean(
    selectedProviderOutcome && (
      selectedProviderOutcome.input_sensitive ||
      selectedProviderOutcome.output_sensitive ||
      (selectedProviderOutcome.status_code !== undefined && selectedProviderOutcome.status_code >= 400)
    )
  )
  const plannedBrowserQA = plan ? browserQAProposal(plan) : null
  const stagehandPlanned = Boolean(plan?.qa_execution_matrix?.some((entry) => entry.run_stagehand))
  async function loadInput() {
    if (inputLoading || inputAttempted) return
    setInputLoading(true)
    try {
      const inputResponse = await api.get(
        executionId ? automationExecutionInputPath(executionId) : automationTaskInputPath(taskId)
      )
      setInput(readApiData<unknown>(inputResponse.data))
    } catch {
      // A legacy execution can retain its result without retaining a request object.
    } finally {
      setInputAttempted(true)
      setInputLoading(false)
    }
  }
  async function loadArtifacts() {
    if (!output || artifactLoading) return
    // Evidence can include several large screenshots. Resolve a small batch at
    // a time so opening an inspection does not monopolize the network or delay
    // the rest of the delivery console.
    const pending = (output.artifacts?.artifacts ?? [])
      .filter((artifact) => !artifactURLsRef.current[artifact.name])
      .slice(0, 3)
    if (pending.length === 0) return
    setArtifactLoading(true)
    const attempts = await Promise.allSettled(
      pending.map(async (artifact) => [artifact.name, await privateArtifactObjectURL(taskId, artifact)] as const)
    )
    const nextURLs: Record<string, string> = {}
    const issues = attempts.flatMap((attempt, index) => {
      if (attempt.status === 'fulfilled') {
        nextURLs[attempt.value[0]] = attempt.value[1]
        return []
      }
      return [`${pending[index]?.name || 'artefacto sin nombre'}: no superó la comprobación de integridad o no pudo descargarse.`]
    })
    Object.assign(artifactURLsRef.current, nextURLs)
    setUrls({ ...artifactURLsRef.current })
    if (issues.length) setArtifactIssues((current) => [...current, ...issues])
    setArtifactLoading(false)
  }
  const unloadedArtifactCount = artifacts.filter((artifact) => !urls[artifact.name]).length
  return (
    <section className="mt-4 rounded-2xl border border-(--tenant-accent)/25 bg-(--tenant-accent)/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
            {executionId ? 'Llamada privada' : diagnostic ? 'Revisión del intento' : 'Resultado privado'}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-ink">
            {executionId ? 'Resultado de esta llamada' : diagnostic ? 'Qué ocurrió y cómo continuar' : 'Resultado, evidencia y próximos pasos'}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar resultado"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) sm:size-9"
        >
          <XMarkIcon className="size-5" />
        </button>
      </div>
      {diagnostic && diagnosticSummary && (
        <article className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.055] p-3.5">
          <p className="text-sm font-semibold text-ink">{diagnosticSummary.title}</p>
          <p className="mt-1 text-xs leading-5 text-ink-secondary">{diagnosticSummary.detail}</p>
        </article>
      )}
      {executionId && output && (
        <details className="mt-3 rounded-xl border border-border-subtle bg-surface-raised">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-semibold text-ink-secondary">
            Exportar request o response privado
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-border-subtle p-3">
          {input !== null && (
            <button
              type="button"
              onClick={() => downloadPrivateJSON(`itbem-execution-${executionId}-request.json`, input)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-2.5 text-xs font-semibold text-ink transition hover:bg-surface-soft sm:min-h-8"
            >
              <ArrowDownTrayIcon className="size-3.5" />
              Request completo
            </button>
          )}
          {output && (
            <button
              type="button"
              onClick={() => downloadPrivateJSON(`itbem-execution-${executionId}-response.json`, output)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-2.5 text-xs font-semibold text-ink transition hover:bg-surface-soft sm:min-h-8"
            >
              <ArrowDownTrayIcon className="size-3.5" />
              Response completo
            </button>
          )}
          </div>
        </details>
      )}
      {!output && !error && (
        <p role="status" aria-live="polite" aria-busy="true" className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" />
          Cargando resultado privado…
        </p>
      )}
      {error && (
        <article className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-3.5">
          <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
            {diagnostic ? 'Este intento se detuvo sin dejar un resultado para revisar' : 'No pudimos abrir este resultado'}
          </p>
          <p className="mt-1 text-xs leading-5 text-rose-800/80 dark:text-rose-200/80">
            {diagnostic
              ? 'El flujo no cambió de etapa. Corrige el bloqueo indicado en la ejecución y deja que el agente continúe desde el siguiente intento.'
              : error}
          </p>
        </article>
      )}
      {output && (
        <>
          {artifactIssues.length > 0 && (
            <article className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/[0.045] p-3">
              <p className="text-sm font-semibold text-rose-800">Parte de la evidencia visual fue retenida</p>
              <p className="mt-1 text-xs leading-5 text-rose-800">
                El resultado privado permanece disponible, pero estos archivos no se muestran hasta que su integridad
                pueda verificarse.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-rose-800">
                {artifactIssues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            </article>
          )}
          {output.validation_error && (
            <article className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-amber-800 uppercase">Respuesta retenida</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                El agente respondió, pero el contrato no permitió convertirlo en un gate aprobable.
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-secondary">{output.validation_error}</p>
              <p className="mt-2 text-xs leading-5 text-ink-muted">
                Puedes revisar el request y el contenido privado abajo. Esta ejecución conserva sus tokens y coste, pero
                no cambia el estado de la entrega.
              </p>
            </article>
          )}
          {output && (
            <details open={Boolean(output.validation_error) || providerNeedsReview} onToggle={(event) => { if (event.currentTarget.open) void loadInput() }} className="mt-4 rounded-xl border border-border-subtle bg-surface-raised">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) marker:hidden [&::-webkit-details-marker]:hidden">
                <span>Auditoría de la llamada</span>
                {requestAudit?.model ? <span className="max-w-32 truncate rounded-lg bg-surface-soft px-2 py-1 text-[11px] text-ink-secondary" title={requestAudit.model}>{requestAudit.model}</span> : null}
              </summary>
              <div className="border-t border-border-subtle p-3">
              {!input && !inputAttempted && (
                <button type="button" onClick={() => void loadInput()} disabled={inputLoading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:opacity-60">
                  {inputLoading ? <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
                  {inputLoading ? 'Cargando auditoría…' : 'Cargar auditoría privada'}
                </button>
              )}
              {!input && inputAttempted && <p className="text-xs text-ink-muted">No hay request privado disponible para esta ejecución.</p>}
              {input !== null && <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-ink">Payload privado de la llamada</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Se conserva sin headers ni secretos. Esta evidencia pertenece únicamente a esta ejecución.
                  </p>
                </div>
                {requestAudit?.exactWirePayload && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    Payload efectivo
                  </span>
                )}
              </div>
              {requestAudit && (
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  {requestAudit.operation && (
                    <div className="rounded-lg bg-surface-soft px-2.5 py-2">
                      <dt className="text-ink-muted">Operación</dt>
                      <dd className="mt-0.5 font-semibold text-ink">{requestAudit.operation}</dd>
                    </div>
                  )}
                  {requestAudit.model && (
                    <div className="rounded-lg bg-surface-soft px-2.5 py-2">
                      <dt className="text-ink-muted">Modelo</dt>
                      <dd className="mt-0.5 truncate font-semibold text-ink" title={requestAudit.model}>
                        {requestAudit.model}
                      </dd>
                    </div>
                  )}
                  {requestAudit.messages !== undefined && (
                    <div className="rounded-lg bg-surface-soft px-2.5 py-2">
                      <dt className="text-ink-muted">Mensajes</dt>
                      <dd className="mt-0.5 font-semibold text-ink tabular-nums">{requestAudit.messages}</dd>
                    </div>
                  )}
                  {requestAudit.maxTokens !== undefined && (
                    <div className="rounded-lg bg-surface-soft px-2.5 py-2">
                      <dt className="text-ink-muted">Límite de salida</dt>
                      <dd className="mt-0.5 font-semibold text-ink tabular-nums">
                        {requestAudit.maxTokens.toLocaleString('es-MX')}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <details className="mt-3 rounded-lg border border-border-subtle bg-surface-soft p-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink">Ver JSON privado completo</summary>
                <pre className="mt-3 max-h-80 overflow-auto text-xs leading-5 whitespace-pre-wrap text-ink-secondary">
                  {JSON.stringify(input, null, 2)}
                </pre>
              </details>
              </>}
              </div>
            </details>
          )}
          {selectedProviderOutcome && <details open={providerNeedsReview} className="mt-4 rounded-xl border border-border-subtle bg-surface-raised"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) marker:hidden [&::-webkit-details-marker]:hidden"><span>Estado del proveedor</span><span className="text-ink-muted">Ver</span></summary><div className="border-t border-border-subtle px-3 pb-3"><ProviderOutcomeSummary outcome={selectedProviderOutcome} /></div></details>}
          {codeReview && (
            <section className="mt-4 space-y-3" aria-label="Resultado de revisión de código">
              <article className={`rounded-xl border p-4 ${reviewVerdictTone[codeReview.verdict]}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold tracking-[0.12em] uppercase">Revisión de código</p>
                  <span className="rounded-full bg-surface-raised px-2 py-1 text-[11px] font-semibold text-ink">{reviewVerdictLabel[codeReview.verdict]}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink">{codeReview.summary}</p>
                {codeReview.review_scope.length > 0 && <p className="mt-2 text-xs text-ink-secondary">Alcance: {codeReview.review_scope.join(' · ')}</p>}
              </article>
              {codeReview.findings.length > 0 && <div className="space-y-2">{codeReview.findings.map((finding) => (
                <article key={finding.id} className="rounded-xl border border-border-subtle bg-surface-raised p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-ink">{finding.title}</p><p className="mt-1 font-mono text-[11px] text-ink-muted">{finding.file}:{finding.line_start}{finding.line_end !== finding.line_start ? `–${finding.line_end}` : ''} · {finding.side === 'base' ? 'línea eliminada' : 'línea añadida'}</p></div><span className="rounded-full bg-surface-soft px-2 py-1 text-[11px] font-semibold text-ink-secondary">{finding.severity} · {Math.round(finding.confidence * 100)}%</span></div>
                  <p className="mt-2 text-xs leading-5 text-ink-secondary">{finding.evidence}</p><p className="mt-2 rounded-lg bg-surface-soft px-2.5 py-2 text-xs leading-5 text-ink-secondary"><span className="font-semibold text-ink">Siguiente acción: </span>{finding.recommendation}</p>
                </article>
              ))}</div>}
              {codeReview.test_plan.length > 0 && <article className="rounded-xl border border-border-subtle bg-surface-raised p-3"><p className="text-xs font-semibold text-ink">Validar antes de continuar</p><ul className="mt-2 space-y-1 text-xs leading-5 text-ink-secondary">{codeReview.test_plan.map((step) => <li key={step}>• {step}</li>)}</ul></article>}
              {codeReview.coverage_gaps.length > 0 && <article className="rounded-xl border border-amber-500/25 bg-amber-500/[0.045] p-3"><p className="text-xs font-semibold text-amber-800">Evidencia pendiente</p><ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800">{codeReview.coverage_gaps.map((gap) => <li key={gap}>• {gap}</li>)}</ul></article>}
            </section>
          )}
          {productBrief ? (
            <section className="mt-4 space-y-3">
              <article className="rounded-xl border border-violet-500/25 bg-violet-500/[0.045] p-4">
                <p className="text-xs font-semibold tracking-[0.12em] text-violet-700 uppercase">Brief de producto</p>
                <p className="mt-2 text-sm leading-6 text-ink">{productBrief.summary}</p>
              </article>
              <article className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.045] p-4">
                <p className="text-xs font-semibold tracking-[0.12em] text-emerald-700 uppercase">
                  Recomendación del agente
                </p>
                <h4 className="mt-2 text-sm font-semibold text-ink">{productBrief.recommendation.direction}</h4>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">{productBrief.recommendation.rationale}</p>
                <p className="mt-3 rounded-lg border border-emerald-500/15 bg-surface-raised px-3 py-2 text-xs leading-5 text-ink-secondary">
                  <span className="font-semibold text-ink">Primer experimento: </span>
                  {productBrief.recommendation.first_experiment}
                </p>
              </article>
              <details className="group overflow-hidden rounded-xl border border-border-subtle bg-surface-raised">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>Comparar {productBrief.directions.length} rutas alternativas</span>
                  <span className="text-ink-muted"><span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Ocultar</span></span>
                </summary>
                <div className="grid gap-3 border-t border-border-subtle p-3 lg:grid-cols-3">
                  {productBrief.directions.map((direction) => (
                    <article key={direction.name} className="rounded-xl border border-border-subtle bg-surface-soft p-3">
                      <p className="text-sm font-semibold text-ink">{direction.name}</p>
                      <dl className="mt-3 space-y-2 text-xs leading-5 text-ink-secondary">
                        <div><dt className="font-semibold text-ink">Resultado</dt><dd>{direction.user_outcome}</dd></div>
                        <div><dt className="font-semibold text-ink">Primer corte</dt><dd>{direction.smallest_slice}</dd></div>
                        <div><dt className="font-semibold text-ink">Trade-off</dt><dd>{direction.trade_off}</dd></div>
                        <div><dt className="font-semibold text-ink">Riesgo</dt><dd>{direction.risk}</dd></div>
                        <div><dt className="font-semibold text-ink">Señal de éxito</dt><dd>{direction.success_signal}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              </details>
              {productBrief.open_questions?.length ? (
                <article className="rounded-xl border border-amber-500/20 bg-amber-500/[0.035] p-4">
                  <p className="text-xs font-semibold text-amber-800">Preguntas antes de decidir</p>
                  <ul className="mt-2 space-y-1.5 text-xs leading-5 text-ink-secondary">
                    {productBrief.open_questions.map((question) => (
                      <li key={question}>• {question}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
              <p className="text-xs leading-5 text-ink-muted">
                Este brief orienta una decisión humana; no crea una tarea ni modifica un proyecto por sí solo.
              </p>
            </section>
          ) : publication ? (
            <article className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.045] p-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-emerald-700 uppercase">
                Publicación controlada
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {publication.branchPublished ? 'La rama autorizada fue publicada.' : 'La rama no fue publicada.'}
              </p>
              <div className="mt-3 grid gap-2 text-xs leading-5 text-ink-secondary sm:grid-cols-2">
                {publication.workspace && (
                  <p>
                    <span className="text-ink-muted">Workspace: </span>
                    {publication.workspace}
                  </p>
                )}
                {publication.remoteRepository && (
                  <p>
                    <span className="text-ink-muted">Repositorio: </span>
                    {publication.remoteRepository}
                  </p>
                )}
                {publication.branch && (
                  <p>
                    <span className="text-ink-muted">Rama: </span>
                    {publication.branch}
                  </p>
                )}
                {publication.commitSHA && (
                  <p>
                    <span className="text-ink-muted">Commit: </span>
                    {publication.commitSHA.slice(0, 12)}
                  </p>
                )}
                {publication.baseSHA && (
                  <p>
                    <span className="text-ink-muted">Base revisada: </span>
                    {publication.baseSHA.slice(0, 12)}
                  </p>
                )}
                <p>
                  <span className="text-ink-muted">Commit local: </span>
                  {publication.commitCreated ? 'creado' : 'ya existente'}
                </p>
              </div>
              {publication.pullRequestURL ? (
                <a
                  href={publication.pullRequestURL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-xs font-semibold text-(--tenant-accent) hover:underline"
                >
                  Abrir pull request {publication.pullRequestCreated ? 'creado' : 'existente'}
                </a>
              ) : (
                <p className="mt-4 text-xs leading-5 text-ink-muted">
                  El grant no incluyó creación de pull request. La rama queda publicada para el flujo humano autorizado.
                </p>
              )}
              {publication.deployment && (
                <p className="mt-3 text-xs leading-5 text-ink-muted">{publication.deployment}</p>
              )}
            </article>
          ) : releaseDraft ? (
            <article className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.045] p-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-emerald-700 uppercase">Borrador de entrega</p>
              <h4 className="mt-2 text-sm font-semibold text-ink">{releaseDraft.executive.whatChanged}</h4>
              <p className="mt-2 text-xs leading-5 text-ink-secondary">{releaseDraft.executive.why}</p>
              <div className="mt-3 grid gap-3 text-xs leading-5 text-ink-secondary sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-ink">Cómo validarlo</p>
                  <p className="mt-1">{releaseDraft.executive.howToTest}</p>
                </div>
                <div>
                  <p className="font-semibold text-ink">Riesgos y seguimiento</p>
                  <ul className="mt-1 space-y-1">
                    {releaseDraft.executive.risks.map((risk) => (
                      <li key={risk}>• {risk}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-border-subtle bg-surface-raised p-3 text-xs leading-5 text-ink-secondary">
                <p className="font-semibold text-ink">Evidencia citada</p>
                <ul className="mt-1 space-y-1">
                  {releaseDraft.technical.evidence.map((entry) => (
                    <li key={entry}>• {entry}</li>
                  ))}
                </ul>
              </div>
              {onUseReleaseDraft && (
                <button
                  type="button"
                  onClick={() => onUseReleaseDraft(releaseDraft)}
                  className="mt-4 min-h-10 rounded-xl bg-(--tenant-accent) px-3 text-xs font-semibold text-white shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
                >
                  Llevar borrador a la entrega
                </button>
              )}
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                Sólo rellena el formulario para revisión. No prepara ni libera la entrega por sí solo.
              </p>
            </article>
          ) : plan ? (
            <div className="mt-4 space-y-3">
              <article className="rounded-xl border border-(--tenant-accent)/20 bg-surface-raised p-4">
                <p className="text-xs font-semibold tracking-[0.12em] text-(--tenant-accent) uppercase">
                  Resumen propuesto
                </p>
                <p className="mt-2 text-sm leading-6 text-ink">{plan.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-full bg-surface-soft px-2.5 py-1 text-ink-secondary">
                    Estimación: {plan.estimate}
                  </span>
                  {typeof plan.confidence === 'number' && (
                    <span className="rounded-full bg-(--tenant-accent)/10 px-2.5 py-1 text-(--tenant-accent)">
                      Confianza: {Math.round(plan.confidence * 100)}%
                    </span>
                  )}
                </div>
              </article>
              {(plan.goal_interpretation || plan.autonomy_boundary) && (
                <article className="rounded-xl border border-sky-500/20 bg-sky-500/[0.035] p-4">
                  <p className="text-xs font-semibold tracking-[0.12em] text-sky-700 uppercase">Criterio del agente</p>
                  <div className="mt-3 grid gap-3 text-xs leading-5 text-ink-secondary sm:grid-cols-2">
                    {plan.goal_interpretation && (
                      <div>
                        <p className="font-semibold text-ink">Cómo entendió el objetivo</p>
                        <p className="mt-1">{plan.goal_interpretation}</p>
                      </div>
                    )}
                    {plan.autonomy_boundary && (
                      <div>
                        <p className="font-semibold text-ink">Límite de autonomía</p>
                        <p className="mt-1">{plan.autonomy_boundary}</p>
                      </div>
                    )}
                  </div>
                </article>
              )}
              <article className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">
                      Impacto por repositorio
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                      Matriz congelada para que la revisión sepa qué se toca y qué sólo se consulta.
                    </p>
                  </div>
                  <span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink-secondary">
                    {plan.repository_impact.length} repositorios
                  </span>
                </div>
                {plan.repository_impact.length ? (
                  <div className="mt-3 grid gap-2">
                    {plan.repository_impact.map((repository) => (
                      <div
                        key={repository.reference}
                        className="rounded-xl border border-border-subtle bg-surface-soft px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">{repository.name}</p>
                          <span className="rounded-full bg-(--tenant-accent)/10 px-2 py-0.5 text-[11px] font-semibold text-(--tenant-accent)">
                            {impactLabel[repository.impact]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs break-all text-ink-secondary">{repository.reference}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {repository.role === 'primary' ? 'Repositorio principal' : 'Repositorio de apoyo'} · revisión{' '}
                          {repository.revision}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-ink-secondary">{repository.notes}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-ink-muted">
                    El agente no declaró repositorios; el plan no debe aprobarse.
                  </p>
                )}
              </article>
              {plan.qa_execution_matrix && (
                <article className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">
                        Contrato de ejecucion QA
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        El agente propone; este contrato no se ejecuta hasta aprobar el plan.
                      </p>
                    </div>
                    <span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink-secondary">
                      {plan.qa_execution_matrix.length} repositorios
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {plan.qa_execution_matrix.map((entry) => {
                      const repository = plan.repository_impact.find((item) => item.reference === entry.repository_ref)
                      const capabilities = [
                        [entry.run_validation, 'Validacion'],
                        [entry.run_qa, 'QA del repo'],
                        [entry.run_stagehand, 'E2E en navegador'],
                        [entry.collect_evidence, 'Evidencia'],
                      ] as const
                      return (
                        <div
                          key={entry.repository_ref}
                          className="rounded-xl border border-border-subtle bg-surface-soft px-3 py-3"
                        >
                          <p className="text-sm font-semibold text-ink">{repository?.name ?? entry.repository_ref}</p>
                          <p className="mt-1 text-xs break-all text-ink-muted">{entry.repository_ref}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {capabilities.map(([enabled, label]) => (
                              <span
                                key={label}
                                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${enabled ? 'bg-emerald-500/10 text-emerald-700' : 'bg-surface-raised text-ink-muted'}`}
                              >
                                {enabled ? 'Incluye' : 'No incluye'}: {label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </article>
              )}
              {(plannedBrowserQA || stagehandPlanned) && (
                <article
                  className={`rounded-xl border p-4 ${plannedBrowserQA?.requiresHumanRevision || (stagehandPlanned && !plannedBrowserQA?.cases.length) ? 'border-amber-500/25 bg-amber-500/[0.045]' : 'border-border-subtle bg-surface-raised'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">
                        Recorridos de navegador
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        Recorridos de navegador que quedan congelados con el plan y se ejecutan después del gate de
                        código.
                      </p>
                    </div>
                    {plannedBrowserQA?.cases.length ? (
                      <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                        {plannedBrowserQA.cases.length} caso{plannedBrowserQA.cases.length === 1 ? '' : 's'} ·{' '}
                        {browserQAModeLabel(plannedBrowserQA.mode)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                        Definición pendiente
                      </span>
                    )}
                  </div>
                  {plannedBrowserQA?.requiresHumanRevision || (stagehandPlanned && !plannedBrowserQA?.cases.length) ? (
                    <p className="mt-3 rounded-lg border border-amber-500/20 bg-surface-raised px-3 py-2 text-xs leading-5 text-amber-900">
                      Este plan necesita al menos un caso E2E concreto antes de poder versionarse para el gate humano.
                      Indicar pruebas E2E sin recorridos no es suficiente.
                    </p>
                  ) : (
                    plannedBrowserQA && (
                      <div className="mt-3 grid gap-2">
                        {plannedBrowserQA.cases.map((testCase) => (
                          <div
                            key={testCase.id}
                            className="rounded-xl border border-border-subtle bg-surface-soft px-3 py-3"
                          >
                            <p className="text-sm font-semibold text-ink">{testCase.title}</p>
                            <p className="mt-1 font-mono text-[11px] text-ink-muted">{testCase.id}</p>
                            <ol className="mt-3 space-y-1.5 text-xs text-ink-secondary">
                              {testCase.steps.map((step, index) => (
                                <li key={`${testCase.id}-${index}`}>
                                  <span className="font-medium text-ink">
                                    {index + 1}. {step.kind}
                                  </span>{' '}
                                  · {browserStepSummary(step)}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </article>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {planSections.map(({ key, label }) => (
                  <article key={key} className="rounded-xl border border-border-subtle bg-surface-raised p-3">
                    <h4 className="text-xs font-semibold text-ink">{label}</h4>
                    {plan[key].length ? (
                      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-ink-secondary">
                        {plan[key].map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-ink-muted">Sin elementos registrados.</p>
                    )}
                  </article>
                ))}
                {advancedPlanSections.map(({ key, label }) => {
                  const entries = plan[key]
                  if (!entries) return null
                  return (
                    <article
                      key={key}
                      className={`rounded-xl border p-3 ${key === 'context_gaps' || key === 'human_decisions' ? 'border-amber-500/20 bg-amber-500/[0.035]' : 'border-border-subtle bg-surface-raised'}`}
                    >
                      <h4 className="text-xs font-semibold text-ink">{label}</h4>
                      {entries.length ? (
                        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-ink-secondary">
                          {entries.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-ink-muted">Sin elementos registrados.</p>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          ) : execution.implementation || execution.qa ? (
            <div className="mt-4 space-y-3">
              {implementation && (
                <article className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold tracking-[0.12em] text-(--tenant-accent) uppercase">
                      Implementación aislada
                    </p>
                    {implementation.changeSets.length > 0 && (
                      <span className="rounded-full bg-(--tenant-accent)/10 px-2.5 py-1 text-[11px] font-semibold text-(--tenant-accent)">
                        {implementation.changeSets.length} repositorios preparados
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {implementation.summary || 'Cambio preparado para revisión humana.'}
                  </p>
                  {implementation.repositoryExecutionOrder.length > 1 && (
                    <div className="mt-3 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-xs leading-5 text-ink-secondary">
                      <span className="font-semibold text-ink">Orden de ejecución por dependencias: </span>
                      {implementation.repositoryExecutionOrder.join(' → ')}
                    </div>
                  )}
                  <div className={implementation.changeSets.length > 0 ? 'mt-4 grid gap-3 lg:grid-cols-2' : 'mt-4'}>
                    {(implementation.changeSets.length > 0 ? implementation.changeSets : [implementation]).map(
                      (changeSet, index) => (
                        <section
                          key={`${changeSet.workspace ?? 'workspace'}-${changeSet.branch ?? index}`}
                          className={
                            implementation.changeSets.length > 0
                              ? 'rounded-xl border border-border-subtle bg-surface-soft p-3'
                              : ''
                          }
                        >
                          <div className="grid gap-2 text-xs text-ink-secondary sm:grid-cols-2">
                            {changeSet.worktree && (
                              <p className="break-all">
                                <span className="text-ink-muted">Worktree: </span>
                                {changeSet.worktree}
                              </p>
                            )}
                            {changeSet.branch && (
                              <p>
                                <span className="text-ink-muted">Rama: </span>
                                {changeSet.branch}
                              </p>
                            )}
                            {changeSet.workspace && (
                              <p className="break-all">
                                <span className="text-ink-muted">Repositorio: </span>
                                {changeSet.workspace}
                              </p>
                            )}
                            {changeSet.githubRepository && (
                              <p className="break-all">
                                <span className="text-ink-muted">GitHub: </span>
                                {changeSet.githubRepository}
                              </p>
                            )}
                            {changeSet.diffCheckPassed !== undefined && (
                              <p>
                                <span className="text-ink-muted">Diff: </span>
                                {changeSet.diffCheckPassed ? 'sin errores de espacio' : 'requiere revisión'}
                              </p>
                            )}
                          </div>
                          <h4 className="mt-4 text-xs font-semibold text-ink">Validaciones ejecutadas</h4>
                          <ExecutionChecks
                            checks={changeSet.validations}
                            emptyLabel="No se registraron validaciones locales."
                          />
                          {changeSet.diffStat && (
                            <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-surface-soft p-3 text-xs leading-5 whitespace-pre-wrap text-ink-secondary">
                              {changeSet.diffStat}
                            </pre>
                          )}
                        </section>
                      )
                    )}
                  </div>
                  {implementation.deployment && (
                    <p className="mt-3 text-xs leading-5 text-ink-muted">{implementation.deployment}</p>
                  )}
                </article>
              )}
              {execution.qa && (
                <article className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                  <p className="text-xs font-semibold tracking-[0.12em] text-(--tenant-accent) uppercase">
                    QA automatizado
                  </p>
                  {qaReport && (
                    <section
                      className={`mt-3 rounded-xl border p-3 text-xs ${qaReport.verdict === 'passed' ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : qaReport.verdict === 'failed' ? 'border-rose-500/25 bg-rose-500/[0.05]' : 'border-amber-500/25 bg-amber-500/[0.05]'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-ink">Lectura estructurada del agente</p>
                        <span
                          className={
                            qaReport.verdict === 'passed'
                              ? 'text-emerald-700'
                              : qaReport.verdict === 'failed'
                                ? 'text-rose-700'
                                : 'text-amber-700'
                          }
                        >
                          {qaReport.verdict === 'passed'
                            ? 'Sin bloqueos declarados'
                            : qaReport.verdict === 'failed'
                              ? 'Defectos o fallos detectados'
                              : 'Requiere seguimiento'}
                        </span>
                      </div>
                      <p className="mt-2 leading-5 text-ink-secondary">{qaReport.summary}</p>
                      <ul className="mt-3 space-y-2">
                        {qaReport.checks.map((check) => (
                          <li
                            key={`${check.name}-${check.status}`}
                            className="rounded-lg bg-surface-raised/70 px-2.5 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-ink">{check.name}</span>
                              <span
                                className={
                                  check.status === 'passed'
                                    ? 'text-emerald-700'
                                    : check.status === 'failed'
                                      ? 'text-rose-700'
                                      : 'text-amber-700'
                                }
                              >
                                {check.status === 'passed'
                                  ? 'Correcto'
                                  : check.status === 'failed'
                                    ? 'Falló'
                                    : 'No ejecutado'}
                              </span>
                            </div>
                            <p className="mt-1 leading-5 text-ink-secondary">{check.detail}</p>
                          </li>
                        ))}
                      </ul>
                      {(qaReport.defects.length > 0 ||
                        qaReport.coverageGaps.length > 0 ||
                        qaReport.recommendedActions.length > 0) && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {[
                            ['Defectos', qaReport.defects],
                            ['Cobertura pendiente', qaReport.coverageGaps],
                            ['Siguientes acciones', qaReport.recommendedActions],
                          ].map(([title, entries]) => (
                            <div key={title as string}>
                              <p className="font-semibold text-ink">{title as string}</p>
                              {(entries as string[]).length ? (
                                <ul className="mt-1 space-y-1 leading-5 text-ink-secondary">
                                  {(entries as string[]).map((entry) => (
                                    <li key={entry}>• {entry}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-ink-muted">Sin elementos.</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 leading-5 text-ink-muted">
                        Este informe no aprueba QA ni reemplaza las pruebas y capturas verificadas abajo.
                      </p>
                    </section>
                  )}
                  <div className="mt-3 rounded-xl border border-border-subtle bg-surface-soft p-3 text-xs">
                    {execution.qa.preview ? (
                      <p className={execution.qa.preview.passed ? 'text-emerald-700' : 'text-rose-700'}>
                        {execution.qa.preview.passed ? 'Preview accesible' : 'Preview no accesible'}
                        {execution.qa.preview.status ? ` · HTTP ${execution.qa.preview.status}` : ''}
                        {execution.qa.preview.url ? ` · ${execution.qa.preview.url}` : ''}
                        {execution.qa.preview.error ? ` · ${execution.qa.preview.error}` : ''}
                      </p>
                    ) : (
                      <p className="text-ink-muted">No se registró la comprobación de preview.</p>
                    )}
                    {(execution.qa.workspace || execution.qa.testedDirectory) && (
                      <p className="mt-2 text-ink-secondary">
                        {execution.qa.workspace}
                        {execution.qa.workspace && execution.qa.testedDirectory ? ' · ' : ''}
                        {execution.qa.testedDirectory}
                      </p>
                    )}
                  </div>
                  {execution.qa.repositoryRuns.length > 0 ? (
                    <section className="mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold text-ink">Validación por repositorio</h4>
                        <span className="rounded-full bg-(--tenant-accent)/10 px-2.5 py-1 text-[11px] font-semibold text-(--tenant-accent)">
                          {execution.qa.repositoryRuns.length} repositorios revisados
                        </span>
                      </div>
                      {execution.qa.repositoryExecutionOrder.length > 1 && (
                        <p className="mt-2 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-xs leading-5 text-ink-secondary">
                          <span className="font-semibold text-ink">Orden QA por dependencias: </span>
                          {execution.qa.repositoryExecutionOrder.join(' → ')}
                        </p>
                      )}
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {execution.qa.repositoryRuns.map((run, index) => (
                          <article
                            key={`${run.workspace ?? 'workspace'}-${run.branch ?? index}`}
                            className="rounded-xl border border-border-subtle bg-surface-soft p-3"
                          >
                            <p className="text-xs font-semibold break-all text-ink">
                              {run.workspace ?? 'Repositorio registrado'}
                            </p>
                            {(run.branch || run.testedDirectory) && (
                              <p className="mt-1 text-xs leading-5 text-ink-muted">
                                {run.branch ?? 'Rama registrada'}
                                {run.branch && run.testedDirectory ? ' · ' : ''}
                                {run.testedDirectory}
                              </p>
                            )}
                            {run.executionContract && (
                              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                                {[
                                  [run.executionContract.runValidation, 'Validacion'],
                                  [run.executionContract.runQA, 'QA'],
                                  [run.executionContract.runStagehand, 'E2E en navegador'],
                                  [run.executionContract.collectEvidence, 'Evidencia'],
                                ].map(([enabled, label]) => (
                                  <span
                                    key={label as string}
                                    className={`rounded-full px-2 py-1 ${enabled ? 'bg-emerald-500/10 text-emerald-700' : 'bg-surface-raised text-ink-muted'}`}
                                  >
                                    {enabled ? 'Incluido' : 'No incluido'}: {label as string}
                                  </span>
                                ))}
                              </div>
                            )}
                            <ExecutionChecks
                              checks={run.commands}
                              emptyLabel="No se configuraron comandos de QA para este repositorio."
                            />
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <>
                      <h4 className="mt-4 text-xs font-semibold text-ink">Pruebas y comandos</h4>
                      <ExecutionChecks
                        checks={execution.qa.commands}
                        emptyLabel="No se configuraron comandos de QA para este workspace."
                      />
                    </>
                  )}
                  {execution.qa.semantic?.report && (
                    <section className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
                        <div>
                          <p className="text-xs font-semibold text-ink">QA de navegador con IA</p>
                          <p className="mt-1 text-xs leading-5 text-ink-muted">
                            Casos aprobados, evidencia visual y lectura semántica privada.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${execution.qa.semantic.passed ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}
                          >
                            {execution.qa.semantic.passed ? 'Ejecución registrada' : 'Ejecución con fallos'}
                          </span>
                          {execution.qa.semantic.report.semanticStatus && (
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${execution.qa.semantic.report.semanticStatus === 'structured' ? 'bg-indigo-500/10 text-indigo-700' : 'bg-amber-500/10 text-amber-700'}`}
                            >
                              {execution.qa.semantic.report.semanticStatus === 'structured'
                                ? 'Lectura estructurada'
                                : 'Lectura semántica degradada'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        {execution.qa.semantic.report.summary && (
                          <p className="text-sm leading-6 text-ink-secondary">{execution.qa.semantic.report.summary}</p>
                        )}
                        {execution.qa.semantic.report.browserRuntime &&
                          (() => {
                            const runtime = execution.qa.semantic.report.browserRuntime
                            const networkObserved = runtime.observedNetworkSources.length > 0
                            const cleanRuntime =
                              runtime.consoleErrors.length === 0 && runtime.failedRequests.length === 0
                            return (
                              <div className="mt-4 rounded-xl border border-border-subtle bg-surface-raised p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-semibold text-ink">Salud del navegador</p>
                                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                                      Telemetria que sustenta el gate de QA; no es una afirmacion del agente.
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${networkObserved && cleanRuntime ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}
                                  >
                                    {networkObserved && cleanRuntime
                                      ? 'Red verificada'
                                      : !networkObserved
                                        ? 'Sin telemetria de red'
                                        : 'Incidencias detectadas'}
                                  </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                                  {runtime.observedNetworkSources.map((source) => (
                                    <span
                                      key={source}
                                      className="rounded-full bg-sky-500/10 px-2 py-1 font-medium text-sky-800"
                                    >
                                      {source === 'performance_timing'
                                        ? 'Chromium Performance Timing'
                                        : source === 'response_event'
                                          ? 'Evento de respuesta'
                                          : source}
                                    </span>
                                  ))}
                                  {runtime.observedNetworkSources.length === 0 && (
                                    <span className="rounded-full bg-rose-500/10 px-2 py-1 font-medium text-rose-700">
                                      No se puede confirmar la red
                                    </span>
                                  )}
                                </div>
                                {(runtime.consoleErrors.length > 0 || runtime.failedRequests.length > 0) && (
                                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                                    {runtime.consoleErrors.length > 0 && (
                                      <RuntimeEvidenceList title="Errores de consola" entries={runtime.consoleErrors} />
                                    )}
                                    {runtime.failedRequests.length > 0 && (
                                      <RuntimeEvidenceList
                                        title="Solicitudes fallidas"
                                        entries={runtime.failedRequests}
                                      />
                                    )}
                                  </div>
                                )}
                                {runtime.unavailableObservers.length > 0 && (
                                  <p className="mt-3 text-[11px] leading-5 text-ink-muted">
                                    Observadores no disponibles: {runtime.unavailableObservers.join(', ')}. El reporte
                                    conserva la fuente de red que si pudo verificarse.
                                  </p>
                                )}
                              </div>
                            )
                          })()}
                        {execution.qa.semantic.report.browserE2E ? (
                          <div className="mt-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <p className="font-semibold text-ink">Casos E2E aprobados</p>
                              <span
                                className={
                                  execution.qa.semantic.report.browserE2E.passed ? 'text-emerald-700' : 'text-rose-700'
                                }
                              >
                                {execution.qa.semantic.report.browserE2E.passed
                                  ? 'Todos los pasos ejecutados'
                                  : 'Hay pasos que requieren revisión'}
                                {execution.qa.semantic.report.browserE2E.mode
                                  ? ` · ${execution.qa.semantic.report.browserE2E.mode === 'approved_navigation' ? 'navegación aprobada' : execution.qa.semantic.report.browserE2E.mode === 'approved_test_flow' ? 'flujo de prueba aislado' : 'solo lectura'}`
                                  : ''}
                              </span>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                              {execution.qa.semantic.report.browserE2E.cases.map((testCase) => (
                                <article
                                  key={testCase.id}
                                  className="rounded-xl border border-border-subtle bg-surface-raised p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-semibold text-ink">{testCase.title}</p>
                                      <p className="mt-1 font-mono text-[11px] text-ink-muted">{testCase.id}</p>
                                    </div>
                                    <span
                                      className={
                                        testCase.passed
                                          ? 'text-xs font-semibold text-emerald-700'
                                          : 'text-xs font-semibold text-rose-700'
                                      }
                                    >
                                      {testCase.passed ? 'Correcto' : 'Falló'}
                                    </span>
                                  </div>
                                  <ol className="mt-3 space-y-2">
                                    {testCase.steps.map((step) => (
                                      <li key={step.id} className="rounded-lg bg-surface-soft px-2.5 py-2 text-xs">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="font-medium text-ink">{step.kind}</span>
                                          <span className={step.passed ? 'text-emerald-700' : 'text-rose-700'}>
                                            {step.passed ? 'pasó' : 'falló'}
                                          </span>
                                        </div>
                                        {step.detail && <p className="mt-1 leading-5 text-ink-muted">{step.detail}</p>}
                                        {step.url && (
                                          <p className="mt-1 truncate font-mono text-[10px] text-ink-muted">
                                            {step.url}
                                          </p>
                                        )}
                                      </li>
                                    ))}
                                  </ol>
                                  {(testCase.beforeScreenshot || testCase.screenshot) && (
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                      {testCase.beforeScreenshot && (
                                        <p className="rounded-lg border border-border-subtle bg-surface-soft px-2.5 py-2 text-[11px] text-ink-muted">
                                          <span className="font-semibold text-ink-secondary">Antes</span>
                                          <br />
                                          {testCase.beforeScreenshot}
                                        </p>
                                      )}
                                      {testCase.screenshot && (
                                        <p className="rounded-lg border border-border-subtle bg-surface-soft px-2.5 py-2 text-[11px] text-ink-muted">
                                          <span className="font-semibold text-ink-secondary">Después</span>
                                          <br />
                                          {testCase.screenshot}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {testCase.evidenceError && (
                                    <p className="mt-3 text-[11px] leading-5 text-rose-700">
                                      Evidencia incompleta: {testCase.evidenceError}
                                    </p>
                                  )}
                                </article>
                              ))}
                            </div>
                            <p className="text-xs leading-5 text-ink-muted">
                              Las capturas y el reporte privado aparecen abajo. Esta evidencia no abre ni reemplaza el
                              gate humano de QA.
                            </p>
                          </div>
                        ) : (
                          <p className="mt-3 text-xs leading-5 text-ink-muted">
                            No hubo casos E2E declarados para esta ejecución; revisa la captura y el informe semántico
                            antes del gate.
                          </p>
                        )}
                      </div>
                    </section>
                  )}
                  {(execution.qa.screenshots.length > 0 || execution.qa.screenshot) && (
                    <div className="mt-3 rounded-xl border border-border-subtle bg-surface-soft p-3 text-xs text-ink-secondary">
                      <p className="font-semibold text-ink">Capturas responsivas</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(execution.qa.screenshots.length > 0
                          ? execution.qa.screenshots
                          : [execution.qa.screenshot!]
                        ).map((screenshot) => (
                          <span
                            key={screenshot.label}
                            className={`rounded-lg px-2 py-1 ${screenshot.passed ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}
                          >
                            {screenshot.label} · {screenshot.passed ? 'generada' : 'no disponible'}
                          </span>
                        ))}
                      </div>
                      {(execution.qa.screenshots.length > 0
                        ? execution.qa.screenshots
                        : [execution.qa.screenshot!]
                      ).some((screenshot) => screenshot.output) && (
                        <p className="mt-2 text-ink-muted">Abre las capturas privadas en la galería de evidencia.</p>
                      )}
                    </div>
                  )}
                </article>
              )}
              {output.content && (
                <details className="rounded-xl border border-border-subtle bg-surface-raised p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-ink">
                    Informe textual del agente
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto text-xs leading-5 whitespace-pre-wrap text-ink-secondary">
                    {output.content}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-surface-raised p-3 text-xs leading-5 whitespace-pre-wrap text-ink-secondary">
              {output.content || 'El agente no incluyó contenido textual.'}
            </pre>
          )}
          {artifacts.length > 0 && (
            <details className="mt-4 rounded-xl border border-border-subtle bg-surface-raised">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-ink-secondary">
                <span>Evidencia visual y archivos</span>
                <span className="text-ink-muted">{artifacts.length}</span>
              </summary>
              <div className="border-t border-border-subtle p-3">
              {Object.keys(urls).length === 0 && (
                <button
                  type="button"
                  onClick={() => void loadArtifacts()}
                  disabled={artifactLoading}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:opacity-60"
                >
                  {artifactLoading ? <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <PhotoIcon className="size-3.5" />}
                  {artifactLoading ? 'Cargando evidencia…' : 'Cargar evidencia privada'}
                </button>
              )}
              {Object.keys(urls).length > 0 && unloadedArtifactCount > 0 && (
                <button
                  type="button"
                  onClick={() => void loadArtifacts()}
                  disabled={artifactLoading}
                  className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink transition hover:bg-surface-soft disabled:opacity-60"
                >
                  {artifactLoading ? <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <PhotoIcon className="size-3.5" />}
                  {artifactLoading ? 'Cargando evidencia…' : `Cargar ${Math.min(3, unloadedArtifactCount)} más`}
                </button>
              )}
              {Object.keys(urls).length > 0 && <div className="grid gap-3 sm:grid-cols-2">
                {artifacts.map((artifact) => {
                  const url = urls[artifact.name]
                  const image = artifact.content_type?.startsWith('image/')
                  if (!url) return null
                  return (
                    <a
                      key={artifact.name}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised p-2 hover:border-(--tenant-accent)/40"
                    >
                      {image && url ? (
                        <img
                          src={url}
                          alt={`Evidencia: ${artifact.name}`}
                          className="aspect-video w-full rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex aspect-video items-center justify-center rounded-lg bg-surface-soft text-ink-muted">
                          <PhotoIcon className="size-7" />
                        </span>
                      )}
                      <span className="mt-2 block truncate text-xs font-medium text-ink">{artifact.name}</span>
                    </a>
                  )
                })}
              </div>}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function ToolExecutionReportPanel({
  executionId,
  onClose,
}: Required<Pick<DeliveryResultPanelProps, 'executionId' | 'onClose'>>) {
  const [report, setReport] = useState<unknown>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setReport(null)
      setError('')
      try {
        const response = await api.get(automationToolExecutionReportPath(executionId))
        const value = readApiData<unknown>(response.data)
        if (active) {
          setReport(value)
        }
      } catch {
        if (active) setError('No pudimos cargar el reporte privado de esta herramienta.')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [executionId])

  const root = objectValue(report)
  const request = objectValue(root?.request)
  const response = root ? Object.fromEntries(Object.entries(root).filter(([key]) => key !== 'request')) : null
  const verdict = typeof root?.verdict === 'string' ? root.verdict : undefined
  const summary = typeof root?.summary === 'string' ? root.summary : undefined
  const extraction = objectValue(root?.extraction)
  const browserE2E = objectValue(root?.browser_e2e)
  const browserCases = Array.isArray(browserE2E?.cases) ? browserE2E.cases.length : 0
  const browserRuntime = objectValue(root?.browser_runtime)
  const runtimeList = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).slice(0, 12)
      : []
  const runtimeConsoleErrors = runtimeList(browserRuntime?.console_errors)
  const runtimeFailedRequests = runtimeList(browserRuntime?.failed_requests)
  const runtimeNetworkSources = runtimeList(browserRuntime?.observed_network_sources)
  const runtimeUnavailableObservers = runtimeList(browserRuntime?.unavailable_observers)
  const calls = (Array.isArray(root?.calls) ? root.calls : []).flatMap((rawCall) => {
    const call = objectValue(rawCall)
    const usage = objectValue(call?.usage)
    const callProviderOutcome = providerOutcome(usage?._itbem_provider)
    const callKey = typeof call?.call_key === 'string' ? call.call_key : ''
    const callStatus = call?.call_status === 'failed' ? 'failed' : 'completed'
    const provider = typeof call?.provider === 'string' ? call.provider : ''
    const model = typeof call?.model === 'string' ? call.model : ''
    if (!call || !callKey || !provider || !model || !usage) return []
    return [
      {
        callKey,
        callStatus,
        provider,
        model,
        inputTokens: numericValue(usage.input_tokens) ?? 0,
        outputTokens: numericValue(usage.output_tokens) ?? 0,
        cachedInputTokens: numericValue(usage.cached_input_tokens) ?? 0,
        cacheWriteTokens: numericValue(usage.cache_write_tokens) ?? 0,
        reasoningTokens: numericValue(usage.reasoning_tokens) ?? 0,
        totalTokens: numericValue(usage.total_tokens) ?? 0,
        request: call.request,
        response: call.response,
        providerOutcome: callProviderOutcome,
      },
    ]
  })

  return (
    <section className="mt-4 rounded-2xl border border-(--tenant-accent)/25 bg-(--tenant-accent)/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Herramienta privada</p>
          <h3 className="mt-1 text-sm font-semibold text-ink">Reporte, request y response de la herramienta</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar reporte"
          className="rounded-lg p-1 text-ink-muted hover:bg-surface-interactive"
        >
          <XMarkIcon className="size-5" />
        </button>
      </div>
      {Boolean(report) && (
        <button
          type="button"
          onClick={() => downloadPrivateJSON(`itbem-tool-execution-${executionId}-report.json`, report)}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-2.5 text-xs font-semibold text-ink transition hover:bg-surface-soft sm:min-h-8"
        >
          <ArrowDownTrayIcon className="size-3.5" />
          Descargar reporte
        </button>
      )}
      {!report && !error && (
        <p role="status" aria-live="polite" aria-busy="true" className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" />
          Cargando reporte privado…
        </p>
      )}
      {error && <p className="mt-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {root && (
        <div className="mt-4 space-y-3">
          <section className="rounded-xl border border-border-subtle bg-surface-raised p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink">Ejecución de herramienta</p>
              {verdict && (
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${verdict === 'passed' ? 'bg-emerald-500/10 text-emerald-700' : verdict === 'failed' ? 'bg-rose-500/10 text-rose-700' : 'bg-amber-500/10 text-amber-700'}`}
                >
                  {verdict}
                </span>
              )}
            </div>
            {summary && <p className="mt-2 text-sm leading-6 text-ink-secondary">{summary}</p>}
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              {typeof root.tool === 'string' && (
                <div className="rounded-lg bg-surface-soft px-2.5 py-2">
                  <dt className="text-ink-muted">Tool</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{root.tool}</dd>
                </div>
              )}
              {typeof root.provider === 'string' && (
                <div className="rounded-lg bg-surface-soft px-2.5 py-2">
                  <dt className="text-ink-muted">Proveedor</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{root.provider}</dd>
                </div>
              )}
              {typeof root.model === 'string' && (
                <div className="rounded-lg bg-surface-soft px-2.5 py-2">
                  <dt className="text-ink-muted">Modelo</dt>
                  <dd className="mt-0.5 truncate font-semibold text-ink" title={root.model}>
                    {root.model}
                  </dd>
                </div>
              )}
            </dl>
            {extraction && (
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                Formato semántico:{' '}
                {typeof extraction.semantic_status === 'string'
                  ? extraction.semantic_status
                  : typeof extraction.status === 'string'
                    ? extraction.status
                    : 'no declarado'}
                {browserCases ? ` · ${browserCases} caso${browserCases === 1 ? '' : 's'} E2E` : ''}
              </p>
            )}
          </section>
          {browserRuntime && (
            <section className="rounded-xl border border-border-subtle bg-surface-raised p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-ink">Salud del navegador</p>
                  <p className="mt-1 text-xs text-ink-muted">Senales observadas por el navegador durante la prueba.</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${runtimeNetworkSources.length > 0 && runtimeConsoleErrors.length === 0 && runtimeFailedRequests.length === 0 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}
                >
                  {runtimeNetworkSources.length === 0
                    ? 'Sin telemetria de red'
                    : runtimeConsoleErrors.length || runtimeFailedRequests.length
                      ? 'Incidencias detectadas'
                      : 'Red verificada'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {runtimeNetworkSources.map((source) => (
                  <span key={source} className="rounded-full bg-sky-500/10 px-2 py-1 font-medium text-sky-800">
                    {source === 'performance_timing'
                      ? 'Chromium Performance Timing'
                      : source === 'response_event'
                        ? 'Evento de respuesta'
                        : source}
                  </span>
                ))}
                {runtimeNetworkSources.length === 0 && (
                  <span className="rounded-full bg-rose-500/10 px-2 py-1 font-medium text-rose-700">
                    No se puede confirmar la red
                  </span>
                )}
              </div>
              {(runtimeConsoleErrors.length > 0 || runtimeFailedRequests.length > 0) && (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {runtimeConsoleErrors.length > 0 && (
                    <RuntimeEvidenceList title="Errores de consola" entries={runtimeConsoleErrors} />
                  )}
                  {runtimeFailedRequests.length > 0 && (
                    <RuntimeEvidenceList title="Solicitudes fallidas" entries={runtimeFailedRequests} />
                  )}
                </div>
              )}
              {runtimeUnavailableObservers.length > 0 && (
                <p className="mt-3 text-[11px] leading-5 text-ink-muted">
                  Observadores no disponibles: {runtimeUnavailableObservers.join(', ')}.
                </p>
              )}
            </section>
          )}
          {calls.length > 0 && (
            <section className="rounded-xl border border-border-subtle bg-surface-raised p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-ink">Llamadas de IA registradas</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Cada fila es una inferencia costeable; no es un total estimado del QA.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                  {calls.length} llamada{calls.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {calls.map((call) => (
                  <li key={call.callKey} className="px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{call.callKey}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${call.callStatus === 'completed' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}
                        >
                          {call.callStatus === 'completed' ? 'Completada' : 'Fallida'}
                        </span>
                        <span className="font-semibold text-ink tabular-nums">
                          {call.totalTokens.toLocaleString('es-MX')} tokens
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 truncate text-ink-muted" title={`${call.provider} · ${call.model}`}>
                      {call.provider} · {call.model}
                    </p>
                    <p className="mt-1 text-ink-muted">
                      {call.inputTokens.toLocaleString('es-MX')} entrada · {call.outputTokens.toLocaleString('es-MX')}{' '}
                      salida · {call.cachedInputTokens.toLocaleString('es-MX')} caché
                      {call.cacheWriteTokens > 0 ? ` · ${call.cacheWriteTokens.toLocaleString('es-MX')} escritura` : ''}
                      {call.reasoningTokens > 0
                        ? ` · ${call.reasoningTokens.toLocaleString('es-MX')} razonamiento`
                        : ''}
                    </p>
                    <ProviderOutcomeSummary outcome={call.providerOutcome} />
                    <details className="mt-2 rounded-md border border-border-subtle bg-surface-soft px-2 py-1.5">
                      <summary className="cursor-pointer font-semibold text-ink">
                        Request y response de esta llamada
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-4 whitespace-pre-wrap text-ink-secondary">
                        {JSON.stringify({ request: call.request, response: call.response }, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <details className="rounded-xl border border-border-subtle bg-surface-raised p-3">
            <summary className="cursor-pointer text-xs font-semibold text-ink">
              Request privado utilizado por la herramienta
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto text-xs leading-5 whitespace-pre-wrap text-ink-secondary">
              {JSON.stringify(request ?? {}, null, 2)}
            </pre>
          </details>
          <details className="rounded-xl border border-border-subtle bg-surface-raised p-3">
            <summary className="cursor-pointer text-xs font-semibold text-ink">Response y evidencia privada</summary>
            <pre className="mt-3 max-h-80 overflow-auto text-xs leading-5 whitespace-pre-wrap text-ink-secondary">
              {JSON.stringify(response ?? {}, null, 2)}
            </pre>
          </details>
          <p className="text-xs leading-5 text-ink-muted">
            Este inspector requiere acceso a la tarea relacionada y no sustituye ningún gate humano.
          </p>
        </div>
      )}
    </section>
  )
}

export function DeliveryResultPanel(props: DeliveryResultPanelProps) {
  if (props.executionKind === 'tool' && props.executionId) {
    return <ToolExecutionReportPanel executionId={props.executionId} onClose={props.onClose} />
  }
  return <AgentDeliveryResultPanel {...props} />
}
