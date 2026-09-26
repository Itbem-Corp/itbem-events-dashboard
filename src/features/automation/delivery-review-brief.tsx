'use client'

import useSWR from 'swr'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { automationTaskResultPath } from '@/lib/api-paths'
import { deliveryExecutionResult, deliveryQAReport, deliveryReleaseDraft } from './delivery-result-data'
import { DeliveryWorkUsage } from './delivery-work-overview'
import type { DeliveryWorkItem } from './delivery-types'

const operationByState: Record<string, string> = { planning: 'delivery.plan', plan_review: 'delivery.plan', implementation: 'delivery.implementation', code_review: 'delivery.implementation', qa_review: 'delivery.qa', release_review: 'delivery.summary' }
type Result = { structured_result?: unknown; artifacts?: unknown }
const fetchResult = async (path: string) => readApiData<Result>((await api.get(path)).data)

type PlanRepository = {
  name: string
  reference: string
  revision: string
  role: 'primary' | 'supporting'
  impact: 'changes' | 'consulted' | 'untouched'
  notes: string
}

type PlanBrief = {
  summary: string
  estimate: string
  confidence?: number
  goalInterpretation?: string
  autonomyBoundary?: string
  repositoryImpact: PlanRepository[]
  implementationSteps: string[]
  acceptanceCriteria: string[]
  contextReviewed: string[]
  assumptions: string[]
  filesImpacted: string[]
  risks: string[]
  qaPlan: string[]
  evidencePlan: string[]
  questions: string[]
  contextGaps: string[]
  humanDecisions: string[]
  rollbackPlan: string[]
}

const planListFields = [
  'context_reviewed', 'assumptions', 'implementation_steps', 'files_impacted', 'risks',
  'qa_plan', 'evidence_plan', 'acceptance_criteria', 'questions',
] as const

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined
}

function optionalStringList(value: unknown): string[] | undefined {
  if (value === undefined) return []
  return stringList(value)
}

function deliveryPlanBrief(value: unknown): PlanBrief | undefined {
  const plan = objectValue(value)
  if (!plan || typeof plan.summary !== 'string' || !plan.summary.trim() || typeof plan.estimate !== 'string' || !plan.estimate.trim()) return undefined
  if (!Array.isArray(plan.repository_impact)) return undefined
  const requiredLists = Object.fromEntries(planListFields.map((field) => [field, stringList(plan[field])])) as Record<(typeof planListFields)[number], string[] | undefined>
  if (planListFields.some((field) => !requiredLists[field])) return undefined
  const repositoryImpact: PlanRepository[] = []
  for (const value of plan.repository_impact) {
    const repository = objectValue(value)
    if (!repository || typeof repository.name !== 'string' || typeof repository.reference !== 'string' || typeof repository.revision !== 'string' || typeof repository.notes !== 'string') return undefined
    if ((repository.role !== 'primary' && repository.role !== 'supporting') || (repository.impact !== 'changes' && repository.impact !== 'consulted' && repository.impact !== 'untouched')) return undefined
    repositoryImpact.push({
      name: repository.name,
      reference: repository.reference,
      revision: repository.revision,
      role: repository.role,
      impact: repository.impact,
      notes: repository.notes,
    })
  }
  if (plan.confidence !== undefined && (typeof plan.confidence !== 'number' || !Number.isFinite(plan.confidence) || plan.confidence < 0 || plan.confidence > 1)) return undefined
  const contextGaps = optionalStringList(plan.context_gaps)
  const humanDecisions = optionalStringList(plan.human_decisions)
  const rollbackPlan = optionalStringList(plan.rollback_plan)
  if (!contextGaps || !humanDecisions || !rollbackPlan) return undefined
  const optionalText = (field: string) => typeof plan[field] === 'string' ? plan[field] as string : undefined
  return {
    summary: plan.summary.trim(),
    estimate: plan.estimate.trim(),
    confidence: plan.confidence as number | undefined,
    goalInterpretation: optionalText('goal_interpretation'),
    autonomyBoundary: optionalText('autonomy_boundary'),
    repositoryImpact,
    implementationSteps: requiredLists.implementation_steps!,
    acceptanceCriteria: requiredLists.acceptance_criteria!,
    contextReviewed: requiredLists.context_reviewed!,
    assumptions: requiredLists.assumptions!,
    filesImpacted: requiredLists.files_impacted!,
    risks: requiredLists.risks!,
    qaPlan: requiredLists.qa_plan!,
    evidencePlan: requiredLists.evidence_plan!,
    questions: requiredLists.questions!,
    contextGaps,
    humanDecisions,
    rollbackPlan,
  }
}

const repositoryImpactLabel: Record<PlanRepository['impact'], string> = {
  changes: 'Cambios propuestos',
  consulted: 'Se consultará',
  untouched: 'Sin cambios',
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return <section>
    <h4 className="text-xs font-semibold text-ink">{title}</h4>
    <ul className="mt-1.5 space-y-1.5 text-xs leading-5 text-ink-secondary">
      {items.map((entry, index) => <li key={`${title}-${index}`} className="flex gap-2"><span aria-hidden="true" className="text-ink-muted">•</span><span>{entry}</span></li>)}
    </ul>
  </section>
}

function DeliveryPlanQuickRead({
  references,
  steps,
  openPoints,
}: {
  references: number
  steps: number
  openPoints: number
}) {
  return <article aria-label="Lectura rápida del plan" className="rounded-2xl border border-(--tenant-accent)/20 bg-(--tenant-accent)/[0.035] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold tracking-[0.14em] text-(--tenant-accent) uppercase">Lectura rápida</p>
        <p className="mt-1 text-xs leading-5 text-ink-secondary">Ubica primero las decisiones pendientes; después revisa el alcance y la secuencia propuesta.</p>
      </div>
      <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">Propuesta · sin aprobar</span>
    </div>
    <dl className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl bg-surface-raised px-3 py-2"><dt className="text-[10px] text-ink-muted">Referencias registradas</dt><dd className="mt-0.5 text-base font-semibold tabular-nums text-ink">{references}</dd></div>
      <div className="rounded-xl bg-surface-raised px-3 py-2"><dt className="text-[10px] text-ink-muted">Pasos propuestos</dt><dd className="mt-0.5 text-base font-semibold tabular-nums text-ink">{steps}</dd></div>
      <div className="rounded-xl bg-surface-raised px-3 py-2"><dt className="text-[10px] text-ink-muted">Puntos abiertos</dt><dd className="mt-0.5 text-base font-semibold tabular-nums text-ink">{openPoints}</dd></div>
    </dl>
    <nav aria-label="Ir a una sección del plan" className="mt-3 flex flex-wrap gap-2">
      {openPoints > 0 && <a href="#plan-review-open-points" className="inline-flex min-h-9 items-center rounded-lg bg-surface-raised px-3 text-xs font-semibold text-(--tenant-accent) hover:bg-surface-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">Revisar {openPoints} {openPoints === 1 ? 'punto abierto' : 'puntos abiertos'}</a>}
      <a href="#plan-review-repositories" className="inline-flex min-h-9 items-center rounded-lg bg-surface-raised px-3 text-xs font-semibold text-(--tenant-accent) hover:bg-surface-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">Ver referencias</a>
      <a href="#plan-review-steps" className="inline-flex min-h-9 items-center rounded-lg bg-surface-raised px-3 text-xs font-semibold text-(--tenant-accent) hover:bg-surface-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">Ver la ruta</a>
    </nav>
  </article>
}

export function DeliveryReviewBrief({ item, onInspect, onOpenUsage }: { item: DeliveryWorkItem; onInspect: (id: string) => void; onOpenUsage?: () => void }) {
  const task = [...(item.automation_tasks ?? [])]
    .filter(task => task.operation === operationByState[item.state])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  const result = useSWR(task?.status === 'completed' ? automationTaskResultPath(task.id) : null, fetchResult)
  const execution = deliveryExecutionResult(result.data?.artifacts)
  const qa = deliveryQAReport(result.data?.structured_result)
  const release = deliveryReleaseDraft(result.data?.structured_result)
  const structured = result.data?.structured_result
  const plan = task?.operation === 'delivery.plan' && task.status === 'completed' ? deliveryPlanBrief(structured) : undefined
  const openPlanPointCount = plan ? plan.contextGaps.length + plan.humanDecisions.length + plan.questions.length : 0
  const summary = execution.implementation?.summary ?? qa?.summary ?? release?.executive.whatChanged ??
    (structured && typeof structured === 'object' && 'summary' in structured && typeof structured.summary === 'string' ? structured.summary : undefined)
  const implementation = execution.implementation
  const changes = implementation?.changeSets.length ? implementation.changeSets : implementation ? [implementation] : []
  const qaRuns = execution.qa?.repositoryRuns.length ? execution.qa.repositoryRuns : execution.qa ? [execution.qa] : []
  return <section aria-label="Resultado para revisar" className="rounded-3xl border border-border-subtle bg-surface-raised p-5 sm:p-6">
    <h2 className="text-lg font-semibold text-ink">{plan ? 'Plan para revisar' : 'Qué entregó el agente'}</h2>
    {result.isLoading ? <p role="status" className="mt-3 text-sm text-ink-secondary">Cargando el resultado privado…</p> : result.error ?
      <div role="alert" className="mt-3 text-sm text-ink-secondary">No pudimos cargar el resultado. No asumas que está verificado. <button type="button" onClick={() => void result.mutate()} className="min-h-11 underline">Reintentar lectura</button></div> :
      plan ? <div className="mt-4 space-y-4" aria-label="Plan estructurado propuesto">
        <article className="rounded-2xl border border-(--tenant-accent)/20 bg-(--tenant-accent)/[0.035] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-(--tenant-accent) uppercase">Propuesta del agente · sin aprobar</p>
              <h3 className="mt-1 text-sm font-semibold text-ink">Qué propone este plan</h3>
            </div>
            <span className="rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-[11px] font-semibold text-ink-secondary">Pendiente de tu decisión</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink">{plan.summary}</p>
          <dl className="mt-3 flex flex-wrap gap-2 text-xs">
            <div className="rounded-xl bg-surface-raised px-3 py-2"><dt className="text-[10px] font-semibold text-ink-muted">Estimación</dt><dd className="mt-0.5 font-medium text-ink-secondary">{plan.estimate}</dd></div>
            {typeof plan.confidence === 'number' && <div className="rounded-xl bg-surface-raised px-3 py-2"><dt className="text-[10px] font-semibold text-ink-muted">Confianza estimada</dt><dd className="mt-0.5 font-medium text-ink-secondary">{Math.round(plan.confidence * 100)}%</dd></div>}
          </dl>
          {(plan.goalInterpretation || plan.autonomyBoundary) && <div className="mt-3 grid gap-3 border-t border-border-subtle pt-3 sm:grid-cols-2">
            {plan.goalInterpretation && <div><h4 className="text-xs font-semibold text-ink">Cómo entendió el objetivo</h4><p className="mt-1 text-xs leading-5 text-ink-secondary">{plan.goalInterpretation}</p></div>}
            {plan.autonomyBoundary && <div><h4 className="text-xs font-semibold text-ink">Límite de autonomía</h4><p className="mt-1 text-xs leading-5 text-ink-secondary">{plan.autonomyBoundary}</p></div>}
          </div>}
          <p className="mt-3 text-[11px] leading-5 text-ink-muted">Es una propuesta escrita por el agente. La evidencia comprobable y tu decisión aparecen por separado.</p>
        </article>

        <DeliveryPlanQuickRead references={plan.repositoryImpact.length} steps={plan.implementationSteps.length} openPoints={openPlanPointCount} />

        {openPlanPointCount > 0 && <article id="plan-review-open-points" tabIndex={-1} aria-label="Puntos abiertos del plan" className="scroll-mt-24 rounded-2xl border border-amber-500/25 bg-amber-500/[0.045] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-amber-800 uppercase">Antes de decidir</p>
              <h3 className="mt-1 text-sm font-semibold text-ink">Puntos que siguen abiertos</h3>
              <p className="mt-1 text-xs leading-5 text-ink-secondary">El agente los reportó para revisión. El dashboard no los resuelve ni los considera aprobados.</p>
            </div>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-900">{openPlanPointCount} {openPlanPointCount === 1 ? 'punto' : 'puntos'}</span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <PlanList title="Decisiones del equipo" items={plan.humanDecisions} />
            <PlanList title="Información por completar" items={plan.contextGaps} />
            <PlanList title="Preguntas abiertas" items={plan.questions} />
          </div>
        </article>}

        <section id="plan-review-repositories" tabIndex={-1} aria-label="Repositorios y alcance" className="scroll-mt-24 rounded-2xl border border-border-subtle p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold text-ink">Repositorios y alcance</h3><p className="mt-0.5 text-xs text-ink-muted">Qué toca el plan y qué sólo consulta.</p></div>
            <span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-ink-secondary">{plan.repositoryImpact.length} {plan.repositoryImpact.length === 1 ? 'repositorio' : 'repositorios'}</span>
          </div>
          {plan.repositoryImpact.length ? <ul className="mt-3 grid gap-2">
            {plan.repositoryImpact.map((repository, index) => <li key={`${repository.reference}-${index}`} className="rounded-xl bg-surface-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-ink">{repository.name}</h4>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${repository.impact === 'changes' ? 'bg-(--tenant-accent)/10 text-(--tenant-accent)' : 'bg-surface-raised text-ink-secondary'}`}>{repositoryImpactLabel[repository.impact]}</span>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-ink-muted">{repository.reference}</p>
              <p className="mt-1 text-[11px] text-ink-secondary">{repository.role === 'primary' ? 'Principal' : 'De apoyo'} · revisión <span title={repository.revision}>{repository.revision.slice(0, 12)}</span></p>
              <p className="mt-2 text-xs leading-5 text-ink-secondary">{repository.notes}</p>
            </li>)}
          </ul> : <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3 text-xs text-amber-900">El plan no identifica repositorios. El alcance necesita aclaración antes de decidir.</p>}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <section id="plan-review-steps" tabIndex={-1} className="scroll-mt-24 rounded-2xl border border-border-subtle p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">
            <h3 className="text-sm font-semibold text-ink">Pasos de trabajo</h3>
            {plan.implementationSteps.length ? <ol className="mt-3 space-y-2">
              {plan.implementationSteps.map((step, index) => <li key={index} className="flex gap-3 text-xs leading-5 text-ink-secondary"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--tenant-accent)/10 text-[10px] font-bold text-(--tenant-accent)">{index + 1}</span><span>{step}</span></li>)}
            </ol> : <p className="mt-2 text-xs text-ink-muted">El agente no detalló pasos.</p>}
          </section>
          <section className="rounded-2xl border border-border-subtle p-4">
            <h3 className="text-sm font-semibold text-ink">Cómo sabremos que quedó bien</h3>
            {plan.acceptanceCriteria.length ? <ul className="mt-3 space-y-2">
              {plan.acceptanceCriteria.map((criterion, index) => <li key={index} className="flex gap-2 text-xs leading-5 text-ink-secondary"><span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border-subtle text-[10px]">·</span><span>{criterion}</span></li>)}
            </ul> : <p className="mt-2 text-xs text-amber-800">Faltan criterios de aceptación; pide al agente que los aclare.</p>}
          </section>
        </div>

        <details className="group overflow-hidden rounded-2xl border border-border-subtle bg-surface-soft">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--tenant-accent) marker:hidden [&::-webkit-details-marker]:hidden">
            <span>Ver supuestos, riesgos y plan de pruebas</span><span className="text-ink-muted group-open:hidden">Ver</span><span className="hidden text-ink-muted group-open:inline">Ocultar</span>
          </summary>
          <div className="grid gap-4 border-t border-border-subtle p-4 sm:grid-cols-2">
            <PlanList title="Suposiciones" items={plan.assumptions} />
            <PlanList title="Riesgos" items={plan.risks} />
            <PlanList title="Plan de QA" items={plan.qaPlan} />
            <PlanList title="Evidencia esperada" items={plan.evidencePlan} />
            <PlanList title="Cómo revertir" items={plan.rollbackPlan} />
            <PlanList title="Contexto revisado" items={plan.contextReviewed} />
            <PlanList title="Archivos impactados" items={plan.filesImpacted} />
          </div>
        </details>
      </div> : <p className="mt-3 text-sm leading-6 text-ink">{summary || 'No hay un resumen verificable del último intento de esta fase. Consulta el historial y la evidencia antes de decidir.'}</p>}
    {task && <div className="mt-4"><DeliveryWorkUsage summary={item.cost_summary} onOpenUsage={onOpenUsage} /></div>}
    {!plan && summary && <p className="mt-2 text-xs text-ink-secondary">Explicación del agente · no sustituye la evidencia ni tu aprobación.</p>}
    {changes.map((change, index) => <article key={`${change.workspace}-${index}`} className="mt-4 border-t border-border-subtle pt-4">
      <h3 className="text-sm font-semibold break-words text-ink">{change.workspace || 'Repositorio'}</h3>
      <p className="mt-1 text-xs break-all text-ink-secondary">Base: {change.baseSHA || 'No registrada'} · Rama: {change.branch || 'No registrada'}</p>
      {change.diffStat && <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-soft p-3 text-xs text-ink">{change.diffStat}</pre>}
      <ul className="mt-3 space-y-2 text-sm text-ink-secondary">{change.validations.map((check, checkIndex) => <li key={checkIndex}>{check.passed ? 'Pasó' : 'Falló'} · {check.label}</li>)}</ul>
      {!change.validations.length && <p className="mt-2 text-sm text-ink-secondary">Sin validaciones registradas para este repositorio.</p>}
    </article>)}
    {qa && <div className="mt-4 border-t border-border-subtle pt-4">
      <h3 className="text-sm font-semibold text-ink">Interpretación de QA del agente</h3>
      <p className="mt-1 text-xs text-ink-secondary">Este reporte no reemplaza los resultados registrados de ejecución.</p>
      <ul className="mt-3 space-y-2 text-sm text-ink-secondary">{qa.checks.map((check, index) => <li key={index}>{check.status === 'passed' ? 'Reporta éxito' : check.status === 'failed' ? 'Reporta fallo' : 'Sin ejecutar'} · {check.name}: {check.detail}</li>)}</ul>
      {qa.coverageGaps.length > 0 && <><h4 className="mt-3 text-sm font-semibold text-ink">Qué falta comprobar</h4><ul className="mt-2 space-y-2 text-sm text-ink-secondary">{qa.coverageGaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></>}
      {!qaRuns.some(run => run.commands.length > 0) && <p className="mt-3 text-sm text-ink-secondary">No hay comandos de QA ejecutados registrados en este resultado.</p>}
    </div>}
    {qaRuns.map((run, index) => <div key={`${run.workspace}-${index}`} className="mt-4 border-t border-border-subtle pt-4">
      <h3 className="text-sm font-semibold text-ink">Ejecución registrada · {run.workspace || 'QA'}</h3>
      <ul className="mt-2 space-y-2 text-sm text-ink-secondary">{run.commands.map((check, checkIndex) => <li key={checkIndex}>{check.passed ? 'Pasó' : 'Falló'} · {check.label}</li>)}</ul>
    </div>)}
    {release && <><p className="mt-3 text-sm text-ink-secondary">Por qué: {release.executive.why}</p><p className="mt-2 text-sm text-ink-secondary">Cómo probar: {release.executive.howToTest}</p></>}
    {task && <div className="mt-4 border-t border-border-subtle pt-3">
      <button type="button" onClick={() => onInspect(task.id)} className="min-h-11 rounded-xl border border-border-subtle px-4 text-sm font-semibold text-ink">{plan ? 'Abrir actividad y trazabilidad' : 'Abrir diff, pruebas y detalle del intento'}</button>
    </div>}
  </section>
}
