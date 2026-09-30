'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageTransition } from '@/components/ui/page-transition'
import {
  DELIVERY_EPIC_SUMMARY_MAX_LENGTH,
  DELIVERY_EPIC_TITLE_MAX_LENGTH,
  deliveryEpicDetailPath,
  deliveryEpicUpdatePath,
  isDeliveryEpicStatus,
  validateDeliveryEpicUpdate,
  type DeliveryEpicDetail,
  type DeliveryEpicSummary,
  type DeliveryEpicStatus,
  type UpdateDeliveryEpicPayload,
} from '@/features/automation/delivery-epics'
import { deliveryStateLabels } from '@/features/automation/delivery-presentation'
import { projectCostAmountLabel, projectCostCoverage, projectCostCoverageNote } from '@/features/automation/project-cost-coverage'
import { ProjectActivityTimeline } from '@/features/automation/project-activity-timeline'
import type { DeliveryProject } from '@/features/automation/delivery-types'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  deliveryEpicBrowserPath,
  deliveryProjectEpicsBrowserPath,
  deliveryProjectPath,
  deliveryWorkItemPath,
  automationCostsPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import useSWR from 'swr'

const epicStatusLabels: Record<string, string> = {
  planned: 'Planeada',
  active: 'Activa',
  blocked: 'Bloqueada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  archived: 'Archivada',
}

const editableEpicStatuses: Array<{ value: DeliveryEpicStatus; label: string }> = [
  { value: 'planned', label: 'Planeada' },
  { value: 'active', label: 'Activa' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'archived', label: 'Archivada' },
]

function statusTone(status: string): 'amber' | 'indigo' | 'rose' | 'emerald' | 'zinc' {
  if (status === 'active') return 'indigo'
  if (status === 'blocked') return 'rose'
  if (status === 'completed') return 'emerald'
  if (status === 'planned') return 'amber'
  return 'zinc'
}

function dateLabel(value?: string) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-MX', { dateStyle: 'medium' })
}

function readableStatus(status: string, labels: Record<string, string>) {
  return labels[status] ?? status.replaceAll('_', ' ')
}

function workItemPathWithEpicContext(
  workItemId: string,
  epicId: string,
  searchParams: { get(name: string): string | null }
) {
  const context = new URLSearchParams({ from_epic: epicId })
  for (const key of ['epic_status', 'epic_cursor', 'tasks_cursor']) {
    const value = searchParams.get(key)
    if (value) context.set(key === 'tasks_cursor' ? 'epic_tasks_cursor' : key, value)
  }
  return `${deliveryWorkItemPath(workItemId)}?${context.toString()}`
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-9 items-center gap-1 font-semibold underline"
      >
        <ArrowPathIcon className="size-4" aria-hidden="true" />
        Volver a intentar
      </button>
    </div>
  )
}

type EpicCostOverview = {
  summary: {
    executions: number
    unpriced_executions?: number
    tasks: number
    total_tokens: number
    total_cost_microusd: number
  }
  by_model?: Array<{
    provider: string
    model: string
    executions: number
    total_cost_microusd: number
  }> | null
}

function EpicOperationalSummary({ projectId, epicId }: { projectId: string; epicId: string }) {
  const path = automationCostsPath({
    days: 30,
    project_id: projectId,
    epic_id: epicId,
    page: 1,
    page_size: 1,
    work_item_limit: 1,
  })
  const costs = useSWR<EpicCostOverview>(path, fetcher, {
    dedupingInterval: 10_000,
    revalidateOnFocus: true,
  })
  const summary = costs.data?.summary
  const costCoverage = summary ? projectCostCoverage({
    executions: summary.executions,
    unpricedExecutions: summary.unpriced_executions,
    totalCostMicros: summary.total_cost_microusd,
  }) : null
  const costCoverageNote = costCoverage ? projectCostCoverageNote(costCoverage) : undefined
  const number = (value: number) => new Intl.NumberFormat('es-MX').format(value)
  const money = (micros: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000)

  return (
    <section aria-labelledby="epic-operations-heading" className="mt-5 overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised">
      <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-(--tenant-accent)">
          <ChartBarSquareIcon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="epic-operations-heading" className="text-base font-semibold text-ink">Resumen operativo · últimos 30 días</h2>
          <p className="mt-1 text-sm text-ink-secondary">Costos y uso atribuidos por el servidor a esta épica; no se incluyen prompts ni contenido privado.</p>
        </div>
      </div>
      {costs.isLoading && !costs.data ? <p role="status" className="p-5 text-sm text-ink-muted">Cargando uso de la épica…</p> : null}
      {costs.error ? (
        <div className="p-5">
          <InlineError message={getApiErrorMessage(costs.error, 'No se pudo cargar el uso de esta épica.')} onRetry={() => void costs.mutate()} />
        </div>
      ) : null}
      {summary && !costs.error ? (
        <>
          <dl className="grid gap-px border-b border-border-subtle bg-border-subtle sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-surface-raised p-5"><dt className="text-xs text-ink-muted">Gasto registrado</dt><dd className="mt-1 text-xl font-semibold text-ink tabular-nums">{costCoverage ? projectCostAmountLabel(costCoverage, money) : 'No disponible'}</dd>{costCoverageNote ? <p role="status" className="mt-2 text-xs leading-5 text-amber-800">{costCoverageNote}</p> : null}</div>
            <div className="bg-surface-raised p-5"><dt className="text-xs text-ink-muted">Llamadas</dt><dd className="mt-1 text-xl font-semibold text-ink tabular-nums">{number(summary.executions)}</dd></div>
            <div className="bg-surface-raised p-5"><dt className="text-xs text-ink-muted">Tareas con uso</dt><dd className="mt-1 text-xl font-semibold text-ink tabular-nums">{number(summary.tasks)}</dd></div>
            <div className="bg-surface-raised p-5"><dt className="text-xs text-ink-muted">Tokens registrados</dt><dd className="mt-1 text-xl font-semibold text-ink tabular-nums">{number(summary.total_tokens)}</dd></div>
          </dl>
          <div className="p-5 sm:px-6">
            <h3 className="text-sm font-semibold text-ink">Proveedores y modelos</h3>
            {costs.data?.by_model?.length ? (
              <ul className="mt-3 divide-y divide-border-subtle rounded-2xl border border-border-subtle">
                {costs.data.by_model.slice(0, 5).map((model) => (
                  <li key={`${model.provider}:${model.model}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="min-w-0"><span className="font-medium text-ink">{model.model}</span><span className="ml-2 text-xs text-ink-muted">{model.provider}</span></span>
                    <span className="shrink-0 text-right text-xs text-ink-secondary">{number(model.executions)} llamadas · {money(model.total_cost_microusd)} USD</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted">No hay llamadas de IA registradas para esta épica en este periodo.</p>}
          </div>
        </>
      ) : null}
    </section>
  )
}

type EpicContextEditorProps = {
  epic: DeliveryEpicSummary
  isSaving: boolean
  serverError: string | null
  onCancel: () => void
  onSave: (payload: UpdateDeliveryEpicPayload) => Promise<void>
}

function EpicContextEditor({ epic, isSaving, serverError, onCancel, onSave }: EpicContextEditorProps) {
  const [title, setTitle] = useState(epic.title)
  const [summary, setSummary] = useState(epic.summary ?? '')
  const [status, setStatus] = useState(epic.status)
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const nextPayload = { title, summary, status }
    const error = validateDeliveryEpicUpdate(nextPayload)
    if (error) {
      setValidationError(error)
      return
    }

    setValidationError(null)
    if (!isDeliveryEpicStatus(status)) return
    void onSave({ title: title.trim(), summary: summary.trim(), status })
  }

  return (
    <section
      aria-labelledby="epic-context-editor-heading"
      className="mt-5 rounded-3xl border border-border-subtle bg-surface-raised p-5 sm:p-6"
    >
      <div className="mb-5">
        <h2 id="epic-context-editor-heading" className="text-lg font-semibold text-ink">
          Editar contexto de la épica
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Actualiza el nombre, el resumen y el estado que ayudan a organizar el trabajo de esta épica.
        </p>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
          No incluyas claves API, tokens ni secretos en el contexto de la épica.
        </p>
      </div>

      <form aria-label="Editar contexto de la épica" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="epic-context-title" className="block text-sm font-semibold text-ink">
            Nombre de la épica
          </label>
          <input
            id="epic-context-title"
            autoComplete="off"
            required
            maxLength={DELIVERY_EPIC_TITLE_MAX_LENGTH}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSaving}
            aria-describedby="epic-context-title-count"
            aria-invalid={Boolean(validationError && !title.trim())}
            className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent) disabled:opacity-60"
          />
          <p id="epic-context-title-count" className="mt-1 text-xs text-ink-muted">
            {title.length}/{DELIVERY_EPIC_TITLE_MAX_LENGTH} caracteres
          </p>
        </div>

        <div>
          <label htmlFor="epic-context-summary" className="block text-sm font-semibold text-ink">
            Resumen de la épica
          </label>
          <textarea
            id="epic-context-summary"
            maxLength={DELIVERY_EPIC_SUMMARY_MAX_LENGTH}
            rows={4}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            disabled={isSaving}
            aria-describedby="epic-context-summary-count"
            className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent) disabled:opacity-60"
          />
          <p id="epic-context-summary-count" className="mt-1 text-xs text-ink-muted">
            {summary.length}/{DELIVERY_EPIC_SUMMARY_MAX_LENGTH} caracteres
          </p>
        </div>

        <div>
          <label htmlFor="epic-context-status" className="block text-sm font-semibold text-ink">
            Estado de la épica
          </label>
          <select
            id="epic-context-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            disabled={isSaving}
            className="mt-1 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent) disabled:opacity-60"
          >
            {!isDeliveryEpicStatus(status) ? (
              <option value={status} disabled>
                {readableStatus(status, epicStatusLabels)} (no disponible)
              </option>
            ) : null}
            {editableEpicStatuses.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {validationError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-200">{validationError}</p> : null}
        {serverError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-200">{serverError}</p> : null}
        {isSaving ? <p role="status" aria-live="polite" className="text-sm text-ink-secondary">Guardando contexto…</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
          <Button outline type="button" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </section>
  )
}

export default function DeliveryEpicDetailPage() {
  const { epicId } = useParams<{ epicId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([])
  const [editingEpic, setEditingEpic] = useState(false)
  const [savingEpic, setSavingEpic] = useState(false)
  const [epicUpdateError, setEpicUpdateError] = useState<string | null>(null)
  const [epicUpdateSaved, setEpicUpdateSaved] = useState(false)
  const cursor = searchParams.get('tasks_cursor') ?? undefined
  const detail = useSWR<DeliveryEpicDetail>(epicId ? deliveryEpicDetailPath(epicId, cursor) : null, fetcher, {
    refreshInterval: editingEpic ? 0 : 15_000,
    dedupingInterval: 4_000,
    revalidateOnFocus: !editingEpic,
  })
  const epic = detail.data?.epic.id === epicId ? detail.data : undefined
  const projectId = epic?.epic.project_id
  const project = useSWR<DeliveryProject>(projectId ? deliveryProjectPath(projectId) : null, fetcher, {
    dedupingInterval: 10_000,
    revalidateOnFocus: true,
  })
  const projectData = project.data?.id === projectId ? project.data : undefined
  const projectReturnPath = projectId
    ? deliveryProjectEpicsBrowserPath(projectId, {
        status: searchParams.get('epic_status') ?? undefined,
        cursor: searchParams.get('epic_cursor') ?? undefined,
      })
    : '/automation/projects'

  function navigateCursor(nextCursor?: string) {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextCursor) nextParams.set('tasks_cursor', nextCursor)
    else nextParams.delete('tasks_cursor')
    const query = nextParams.toString()
    const basePath = deliveryEpicBrowserPath(epicId)
    router.push(`${basePath}${query ? `?${query}` : ''}`, { scroll: false })
  }

  function nextPage() {
    if (!epic?.work_items.next_cursor) return
    setPreviousCursors((current) => [...current, cursor])
    navigateCursor(epic.work_items.next_cursor)
  }

  function previousPage() {
    if (previousCursors.length === 0) return
    const history = [...previousCursors]
    const previous = history.pop()
    setPreviousCursors(history)
    navigateCursor(previous)
  }

  const taskCount = epic?.work_items.total ?? 0

  async function updateEpic(payload: UpdateDeliveryEpicPayload) {
    if (!epic?.can_manage || savingEpic) return

    setSavingEpic(true)
    setEpicUpdateError(null)
    try {
      await api.put(deliveryEpicUpdatePath(epicId), payload)
      await detail.mutate()
      setEditingEpic(false)
      setEpicUpdateSaved(true)
    } catch (error) {
      setEpicUpdateError(getApiErrorMessage(error, 'No se pudo guardar el contexto de la épica.'))
    } finally {
      setSavingEpic(false)
    }
  }

  return (
    <PageTransition>
      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
        <nav aria-label="Ruta de navegación" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Link
            href="/automation/clients"
            className="rounded-sm hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none"
          >
            Clientes
          </Link>
          <span aria-hidden="true">/</span>
          {projectData ? (
            <Link
              href={`/automation/clients/${encodeURIComponent(projectData.client?.id ?? projectData.client_id)}`}
              className="rounded-sm hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none"
            >
              {projectData.client?.name ?? 'Empresa'}
            </Link>
          ) : (
            <span>Empresa</span>
          )}
          <span aria-hidden="true">/</span>
          {projectId ? (
            <Link
              href={projectReturnPath}
              className="rounded-sm hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none"
            >
              {projectData?.name ?? 'Proyecto'}
            </Link>
          ) : (
            <span>Proyecto</span>
          )}
          <span aria-hidden="true">/</span>
          <span className="font-medium text-ink" aria-current="page">
            {epic?.epic.title ?? 'Épica'}
          </span>
        </nav>

        <div className="mb-5">
          <Button outline href={projectReturnPath}>
            <ArrowLeftIcon data-slot="icon" />
            Volver al proyecto
          </Button>
        </div>

        {detail.isLoading && !epic ? (
          <div role="status" className="premium-surface rounded-3xl p-6 text-sm text-ink-muted">
            Cargando detalle de la épica…
          </div>
        ) : null}
        {detail.error ? (
          <InlineError
            message={getApiErrorMessage(detail.error, 'No se pudo cargar la épica.')}
            onRetry={() => void detail.mutate()}
          />
        ) : null}
        {epic ? (
          <>
            <header className="premium-surface overflow-hidden rounded-3xl">
              <div className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-start sm:p-7">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Épica del proyecto</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{epic.epic.title}</h1>
                  {epic.epic.summary ? (
                    <p className="mt-3 max-w-3xl text-sm leading-6 whitespace-pre-wrap text-ink-secondary">
                      {epic.epic.summary}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge color={statusTone(epic.epic.status)}>{readableStatus(epic.epic.status, epicStatusLabels)}</Badge>
                  {epic.can_manage && !editingEpic ? (
                    <Button
                      outline
                      type="button"
                      onClick={() => {
                        setEpicUpdateSaved(false)
                        setEpicUpdateError(null)
                        setEditingEpic(true)
                      }}
                    >
                      Editar contexto
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-px border-t border-border-subtle bg-border-subtle sm:grid-cols-3">
                <div className="bg-surface-raised p-5">
                  <p className="text-xs text-ink-muted">Tareas asociadas</p>
                  <p className="mt-1 text-xl font-semibold text-ink tabular-nums">{taskCount}</p>
                </div>
                <div className="bg-surface-raised p-5">
                  <p className="text-xs text-ink-muted">Creada</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{dateLabel(epic.epic.created_at)}</p>
                </div>
                <div className="bg-surface-raised p-5">
                  <p className="text-xs text-ink-muted">Último cambio</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{dateLabel(epic.epic.updated_at)}</p>
                </div>
              </div>
            </header>

            {editingEpic && epic.can_manage ? (
              <EpicContextEditor
                key={`${epic.epic.id}:${epic.epic.updated_at}`}
                epic={epic.epic}
                isSaving={savingEpic}
                serverError={epicUpdateError}
                onCancel={() => {
                  setEditingEpic(false)
                  setEpicUpdateError(null)
                }}
                onSave={updateEpic}
              />
            ) : null}
            {epicUpdateSaved && !editingEpic ? (
              <p role="status" aria-live="polite" className="mt-3 text-sm text-emerald-700 dark:text-emerald-200">
                Contexto de la épica actualizado.
              </p>
            ) : null}

            <section
              aria-labelledby="epic-project-heading"
              className="mt-5 rounded-3xl border border-border-subtle bg-surface-raised p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-ink-secondary">
                    <FolderOpenIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold tracking-[.12em] text-ink-muted uppercase">
                      Proyecto contenedor
                    </p>
                    <h2 id="epic-project-heading" className="mt-1 text-base font-semibold text-ink">
                      {projectData?.name ?? (project.error ? 'Proyecto no disponible' : 'Cargando proyecto…')}
                    </h2>
                    {projectData?.summary ? (
                      <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-secondary">{projectData.summary}</p>
                    ) : null}
                  </div>
                </div>
                {projectData ? (
                  <Badge color={statusTone(projectData.status)}>
                    {readableStatus(projectData.status, epicStatusLabels)}
                  </Badge>
                ) : null}
              </div>
              {project.error ? (
                <div className="mt-4">
                  <InlineError
                    message={getApiErrorMessage(project.error, 'No se pudo cargar el contexto del proyecto.')}
                    onRetry={() => void project.mutate()}
                  />
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
                {projectData ? (
                  <span>
                    Empresa:{' '}
                    <Link
                      href={`/automation/clients/${encodeURIComponent(projectData.client?.id ?? projectData.client_id)}`}
                      className="font-semibold text-(--tenant-accent) hover:underline"
                    >
                      {projectData.client?.name ?? 'Empresa'}
                    </Link>
                  </span>
                ) : null}
                <span>
                  Estado del proyecto:{' '}
                  {projectData ? readableStatus(projectData.status, epicStatusLabels) : 'No disponible'}
                </span>
                {projectId ? (
                  <Link
                    href={projectReturnPath}
                    className="inline-flex min-h-9 items-center gap-1 font-semibold text-(--tenant-accent) hover:underline"
                  >
                    Abrir proyecto
                    <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </section>

            {projectId ? <EpicOperationalSummary projectId={projectId} epicId={epic.epic.id} /> : null}

            {projectId ? (
              <div className="mt-5">
                <ProjectActivityTimeline
                  projectId={projectId}
                  fixedEpicId={epic.epic.id}
                  workItems={epic.work_items.items.map(({ id, title }) => ({ id, title }))}
                />
              </div>
            ) : null}

            <section aria-labelledby="epic-tasks-heading" className="premium-surface mt-5 overflow-hidden rounded-3xl">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Trabajo relacionado</p>
                  <h2 id="epic-tasks-heading" className="mt-1 text-lg font-semibold text-ink">
                    Tareas de esta épica
                  </h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Abre una tarea para consultar su plan, pasos, actividad y evidencias.
                  </p>
                </div>
                <Badge color="indigo">
                  {taskCount} {taskCount === 1 ? 'tarea' : 'tareas'}
                </Badge>
              </div>
              {detail.isLoading && !epic ? (
                <div role="status" className="p-5 text-sm text-ink-muted">
                  Cargando tareas…
                </div>
              ) : null}
              {epic.work_items.items.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {epic.work_items.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={workItemPathWithEpicContext(item.id, epicId, searchParams)}
                        className="flex min-h-20 flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none focus-visible:ring-inset sm:px-6"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                          <span className="mt-1 block text-xs text-ink-muted">Asociada {dateLabel(item.added_at)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Badge
                            color={item.state === 'released' ? 'emerald' : item.state === 'blocked' ? 'rose' : 'zinc'}
                          >
                            {deliveryStateLabels[item.state] ?? item.state.replaceAll('_', ' ')}
                          </Badge>
                          <ArrowRightIcon className="size-4 text-ink-muted" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : !detail.error ? (
                <div className="p-7 text-center">
                  <p className="text-sm font-semibold text-ink">Esta épica todavía no tiene tareas asociadas</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Puedes volver al proyecto para consultar su trabajo y organizar las épicas.
                  </p>
                  {projectId ? (
                    <Link
                      href={projectReturnPath}
                      className="mt-3 inline-flex min-h-10 items-center gap-1 font-semibold text-(--tenant-accent) hover:underline"
                    >
                      Ir al proyecto
                      <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {!detail.error ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 sm:px-6">
                  <p className="text-xs text-ink-muted">
                    {epic.work_items.items.length} tareas visibles de {taskCount}
                  </p>
                  <div className="flex gap-2">
                    <Button outline type="button" disabled={previousCursors.length === 0} onClick={previousPage}>
                      <ChevronLeftIcon data-slot="icon" />
                      Anterior
                    </Button>
                    <Button outline type="button" disabled={!epic.work_items.next_cursor} onClick={nextPage}>
                      Siguiente
                      <ChevronRightIcon data-slot="icon" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </PageTransition>
  )
}
