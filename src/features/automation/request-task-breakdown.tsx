'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import type { DeliveryContextSource, DeliveryRequest } from './delivery-types'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { deliveryRequestDecompositionApplyPath, deliveryRequestDecompositionsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { useState, type FormEvent } from 'react'
import useSWR from 'swr'

type DraftTask = {
  title: string
  outcome: string
  scope: string
  acceptance: string
  budgetUsd: string
  primaryRepositoryRef: string
  dependsOnPrevious: boolean
}

type StoredProposal = {
  id: string
  version: number
  status: string
  summary: string
  structured_result: string
}

type ProposedTask = {
  key?: string
  title?: string
  expected_outcome?: string
  included_scope?: string[]
  acceptance_criteria?: string[]
  primary_repository_ref?: string
  depends_on?: string[]
  budget_microusd?: number
}

function lines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean)
}

function draftTask(primaryRepositoryRef: string, dependsOnPrevious: boolean): DraftTask {
  return { title: '', outcome: '', scope: '', acceptance: '', budgetUsd: '0.02', primaryRepositoryRef, dependsOnPrevious }
}

function proposalTasks(proposal: StoredProposal) {
  try {
    const structured = JSON.parse(proposal.structured_result) as { tasks?: ProposedTask[] }
    return Array.isArray(structured.tasks) ? structured.tasks : []
  } catch {
    return []
  }
}

export function RequestTaskBreakdown({ projectId, request, contexts, onApplied }: {
  projectId: string
  request: DeliveryRequest
  contexts: DeliveryContextSource[]
  onApplied: () => void
}) {
  const [open, setOpen] = useState(false)
  const repositories = contexts.filter((source) => source.kind === 'repository' && source.status === 'ready')
  const localRepositories = repositories.filter((source) => source.reference.startsWith('workspace://'))
  const defaultPrimary = localRepositories.find((source) => source.metadata?.repository_role === 'primary')?.reference ?? localRepositories[0]?.reference ?? ''
  const [draft, setDraft] = useState<DraftTask[]>(() => [draftTask(defaultPrimary, false), draftTask(defaultPrimary, true)])
  const [summary, setSummary] = useState(`Dividir ${request.title} en entregas verificables`)
  const [approvalComment, setApprovalComment] = useState('')
  const [createdProposal, setCreatedProposal] = useState<StoredProposal | null>(null)
  const [busy, setBusy] = useState<'propose' | 'apply' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const path = deliveryRequestDecompositionsPath(projectId, request.id)
  const proposals = useSWR<StoredProposal[]>(open ? path : null, fetcher)
  const pendingProposal = createdProposal ?? [...(proposals.data ?? [])].filter((proposal) => proposal.status === 'proposed').sort((a, b) => b.version - a.version)[0]
  const canPropose = Boolean(summary.trim() && repositories.length > 0 && draft.length > 0 && draft.every((task) => task.title.trim() && task.outcome.trim() && lines(task.scope).length > 0 && lines(task.acceptance).length > 0 && Number(task.budgetUsd) > 0 && Number(task.budgetUsd) <= 100_000))

  const updateTask = (index: number, change: Partial<DraftTask>) => {
    setDraft((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...change } : task))
  }

  const propose = async (event: FormEvent) => {
    event.preventDefault()
    if (!canPropose || busy) return
    setBusy('propose')
    setError('')
    setNotice('')
    try {
      const result = await api.post(path, { structured: {
        summary: summary.trim(),
        tasks: draft.map((task, index) => {
          const primaryRepositoryRef = localRepositories.some((source) => source.reference === task.primaryRepositoryRef) ? task.primaryRepositoryRef : defaultPrimary
          return ({
          key: `task-${index + 1}`,
          title: task.title.trim(),
          description: '',
          expected_outcome: task.outcome.trim(),
          included_scope: lines(task.scope),
          excluded_scope: [],
          acceptance_criteria: lines(task.acceptance),
          context_references: repositories.map((source) => source.reference),
          ...(primaryRepositoryRef ? { primary_repository_ref: primaryRepositoryRef } : {}),
          depends_on: index > 0 && task.dependsOnPrevious ? [`task-${index}`] : [],
          budget_microusd: Math.round(Number(task.budgetUsd) * 1_000_000),
          })
        }),
      } })
      setCreatedProposal(readApiData<StoredProposal>(result.data))
      setNotice('Propuesta guardada. Revísala antes de crear las tareas; todavía no se lanzó ningún agente.')
      void proposals.mutate()
    } catch {
      setError('No pudimos confirmar si la propuesta se guardó. Actualiza esta sección y comprueba la versión antes de repetir el envío.')
      void proposals.mutate()
    } finally {
      setBusy(null)
    }
  }

  const apply = async () => {
    if (!pendingProposal || approvalComment.trim().length < 8 || busy) return
    setBusy('apply')
    setError('')
    setNotice('')
    try {
      await api.post(deliveryRequestDecompositionApplyPath(projectId, request.id, pendingProposal.id), { comment: approvalComment.trim() })
      setCreatedProposal(null)
      setNotice('Tareas creadas con sus dependencias. La planificación avanzará según la capacidad del agente y los gates del proyecto.')
      void proposals.mutate()
      onApplied()
    } catch {
      setCreatedProposal(null)
      setError('No pudimos confirmar la aplicación. Revisa el estado de la propuesta y las tareas antes de intentarlo otra vez.')
      void proposals.mutate()
      onApplied()
    } finally {
      setBusy(null)
    }
  }

  return <div className="mt-3">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink transition hover:bg-surface-interactive">
      {open ? 'Cerrar desglose' : 'Dividir en tareas'}
    </button>
    {open && <section aria-label={`Tareas de ${request.title}`} className="mt-3 rounded-2xl border border-border-subtle bg-surface-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold text-ink">Convertir la solicitud en tareas</h3><p className="mt-1 text-xs leading-5 text-ink-secondary">Primero guarda una propuesta. Una persona la revisa y aprueba antes de crear trabajo operativo.</p></div>
        <Badge color="indigo">Sin inferencia al proponer</Badge>
      </div>
      {proposals.isLoading && !createdProposal ? <p className="mt-4 text-sm text-ink-muted">Buscando propuestas existentes…</p> : null}
      {proposals.error ? <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">No pudimos cargar propuestas anteriores. Actualiza antes de crear otra para evitar duplicados.</p> : null}
      {pendingProposal ? <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">Propuesta v{pendingProposal.version}</p><Badge color="amber">Esperando aprobación</Badge></div>
          <p className="mt-1 text-sm text-ink-secondary">{pendingProposal.summary}</p>
          <ol className="mt-3 space-y-2">{proposalTasks(pendingProposal).map((task, index) => <li key={task.key ?? index} className="rounded-xl border border-border-subtle p-3 text-sm">
            <p className="font-semibold text-ink">{index + 1}. {task.title}</p>
            <p className="mt-1 text-ink-secondary">{task.expected_outcome}</p>
            <p className="mt-1 text-xs text-ink-muted">{task.primary_repository_ref ? `Principal: ${task.primary_repository_ref}` : 'Repositorio principal según el mapa del proyecto'}{task.depends_on?.length ? ` · Depende de ${task.depends_on.join(', ')}` : ''} · Límite IA: USD {((task.budget_microusd ?? 0) / 1_000_000).toFixed(3)}</p>
            {task.included_scope?.length ? <div className="mt-2"><p className="text-xs font-semibold text-ink">Alcance</p><ul className="mt-1 list-inside list-disc text-xs text-ink-secondary">{task.included_scope.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            {task.acceptance_criteria?.length ? <div className="mt-2"><p className="text-xs font-semibold text-ink">Aceptación</p><ul className="mt-1 list-inside list-disc text-xs text-ink-secondary">{task.acceptance_criteria.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
          </li>)}</ol>
        </div>
        <label className="block text-xs font-semibold text-ink">Motivo de aprobación
          <textarea value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} minLength={8} maxLength={2000} rows={2} placeholder="Revisé alcance, dependencias y repositorios; apruebo crear estas tareas." className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-raised p-3 text-sm font-normal" />
        </label>
        <p className="text-xs leading-5 text-ink-muted">Aprobar crea las tareas y puede poner en cola la planificación. Las llamadas de IA consumirán el presupuesto configurado cuando se ejecuten.</p>
        <Button color="indigo" type="button" disabled={busy === 'apply' || approvalComment.trim().length < 8} onClick={() => void apply()}>{busy === 'apply' ? 'Creando tareas…' : 'Aprobar y crear tareas'}</Button>
      </div> : !proposals.isLoading && !proposals.error ? <form onSubmit={propose} className="mt-4 space-y-4">
        <label className="block text-xs font-semibold text-ink">Resumen de la propuesta
          <input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={1000} className="mt-2 h-10 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal" />
        </label>
        {draft.map((task, index) => <fieldset key={index} className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Tarea {index + 1}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink">Título
              <input value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} maxLength={240} className="mt-1 block h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-ink">Resultado esperado
              <input value={task.outcome} onChange={(event) => updateTask(index, { outcome: event.target.value })} maxLength={2000} className="mt-1 block h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-ink">Alcance incluido · uno por línea
              <textarea value={task.scope} onChange={(event) => updateTask(index, { scope: event.target.value })} rows={2} className="mt-1 block w-full rounded-xl border border-border-subtle bg-surface-soft p-3 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-ink">Criterios de aceptación · uno por línea
              <textarea value={task.acceptance} onChange={(event) => updateTask(index, { acceptance: event.target.value })} rows={2} className="mt-1 block w-full rounded-xl border border-border-subtle bg-surface-soft p-3 text-sm font-normal" />
            </label>
          </div>
          {localRepositories.length > 0 ? <label className="mt-3 block text-xs font-semibold text-ink">Repositorio principal
            <select value={localRepositories.some((source) => source.reference === task.primaryRepositoryRef) ? task.primaryRepositoryRef : defaultPrimary} onChange={(event) => updateTask(index, { primaryRepositoryRef: event.target.value })} className="mt-1 block h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal">
              {localRepositories.map((source) => <option key={source.id} value={source.reference}>{source.name}</option>)}
            </select>
          </label> : <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">Sin workspace local: estas tareas sólo podrán planear, no implementar código.</p>}
          <label className="mt-3 block text-xs font-semibold text-ink">Límite de IA para esta tarea · USD
            <input type="number" min="0.001" max="100000" step="0.001" value={task.budgetUsd} onChange={(event) => updateTask(index, { budgetUsd: event.target.value })} className="mt-1 block h-10 w-36 rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal" />
          </label>
          {index > 0 ? <label className="mt-3 flex items-center gap-2 text-xs text-ink-secondary"><input type="checkbox" checked={task.dependsOnPrevious} onChange={(event) => updateTask(index, { dependsOnPrevious: event.target.checked })} /> Esperar a la tarea anterior</label> : null}
          {draft.length > 1 ? <button type="button" onClick={() => setDraft((current) => current.filter((_, taskIndex) => taskIndex !== index))} className="mt-3 min-h-9 text-xs font-semibold text-rose-700 dark:text-rose-300">Quitar esta tarea</button> : null}
        </fieldset>)}
        <div className="flex flex-wrap gap-2">
          {draft.length < 12 ? <Button type="button" outline onClick={() => setDraft((current) => [...current, draftTask(defaultPrimary, true)])}>Agregar tarea</Button> : null}
          <Button type="submit" color="indigo" disabled={!canPropose || busy === 'propose' || repositories.length === 0}>{busy === 'propose' ? 'Guardando propuesta…' : 'Guardar propuesta para revisión'}</Button>
        </div>
        <p className="text-xs leading-5 text-ink-muted">Cada tarea consultará los repositorios listos del proyecto y congelará sus revisiones. Los ambientes y reglas de trabajo se incluyen automáticamente.</p>
      </form> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-ink-secondary">{notice}</p> : null}
    </section>}
  </div>
}
