'use client'

import useSWR from 'swr'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { automationTaskResultPath } from '@/lib/api-paths'
import { deliveryExecutionResult, deliveryQAReport, deliveryReleaseDraft } from './delivery-result-data'
import type { DeliveryWorkItem } from './delivery-types'

const operationByState: Record<string, string> = { planning: 'delivery.plan', plan_review: 'delivery.plan', implementation: 'delivery.implementation', code_review: 'delivery.implementation', qa_review: 'delivery.qa', release_review: 'delivery.summary' }
type Result = { structured_result?: unknown; artifacts?: unknown }
const fetchResult = async (path: string) => readApiData<Result>((await api.get(path)).data)

export function DeliveryReviewBrief({ item, onInspect }: { item: DeliveryWorkItem; onInspect: (id: string) => void }) {
  const task = [...(item.automation_tasks ?? [])]
    .filter(task => task.operation === operationByState[item.state])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  const result = useSWR(task?.status === 'completed' ? automationTaskResultPath(task.id) : null, fetchResult)
  const execution = deliveryExecutionResult(result.data?.artifacts)
  const qa = deliveryQAReport(result.data?.structured_result)
  const release = deliveryReleaseDraft(result.data?.structured_result)
  const structured = result.data?.structured_result
  const summary = execution.implementation?.summary ?? qa?.summary ?? release?.executive.whatChanged ??
    (structured && typeof structured === 'object' && 'summary' in structured && typeof structured.summary === 'string' ? structured.summary : undefined)
  const implementation = execution.implementation
  const changes = implementation?.changeSets.length ? implementation.changeSets : implementation ? [implementation] : []
  const qaRuns = execution.qa?.repositoryRuns.length ? execution.qa.repositoryRuns : execution.qa ? [execution.qa] : []
  return <section aria-label="Resultado para revisar" className="rounded-3xl border border-border-subtle bg-surface-raised p-5 sm:p-6">
    <h2 className="text-lg font-semibold text-ink">Qué entregó el agente</h2>
    {result.isLoading ? <p role="status" className="mt-3 text-sm text-ink-secondary">Cargando el resultado privado…</p> : result.error ?
      <div role="alert" className="mt-3 text-sm text-ink-secondary">No pudimos cargar el resultado. No asumas que está verificado. <button type="button" onClick={() => void result.mutate()} className="min-h-11 underline">Reintentar lectura</button></div> :
      <p className="mt-3 text-sm leading-6 text-ink">{summary || 'No hay un resumen verificable del último intento de esta fase. Consulta el historial y la evidencia antes de decidir.'}</p>}
    {summary && <p className="mt-2 text-xs text-ink-secondary">Explicación del agente · no sustituye la evidencia ni tu aprobación.</p>}
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
    {task && <button type="button" onClick={() => onInspect(task.id)} className="mt-4 min-h-11 rounded-xl border border-border-subtle px-4 text-sm font-semibold text-ink">Abrir diff, pruebas y detalle del intento</button>}
  </section>
}
