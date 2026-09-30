'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dialog, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { deliveryStateLabels } from '@/features/automation/delivery-presentation'
import type { DeliveryWorkItem } from '@/features/automation/delivery-types'
import {
  deliveryEpicDetailPath,
  deliveryEpicWorkItemPath,
  deliveryEpicWorkItemsPath,
  deliveryProjectEpicsPagePath,
  deliveryProjectEpicsPath,
  type DeliveryEpicDetail,
  type DeliveryEpicListPage,
  type DeliveryEpicStatus,
  type DeliveryEpicSummary,
} from '@/features/automation/delivery-epics'
import { api } from '@/lib/api'
import { deliveryEpicBrowserPath } from '@/lib/api-paths'
import { readApiData } from '@/lib/api-envelope'
import { getApiErrorMessage } from '@/lib/api-error'
import { fetcher } from '@/lib/fetcher'
import { ArrowPathIcon, ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XMarkIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import useSWR from 'swr'

const epicStatuses: Array<{ value: DeliveryEpicStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'planned', label: 'Planeada' },
  { value: 'active', label: 'Activa' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'archived', label: 'Archivada' },
]

const workItemStates = [
  { value: '', label: 'Todos los estados' },
  { value: 'planning', label: 'Preparando el plan' },
  { value: 'plan_review', label: 'Plan por revisar' },
  { value: 'implementation', label: 'Construyendo el cambio' },
  { value: 'code_review', label: 'Cambio por revisar' },
  { value: 'preview_pending', label: 'Esperando preview' },
  { value: 'qa_running', label: 'Verificando el resultado' },
  { value: 'qa_review', label: 'Validación por revisar' },
  { value: 'release_review', label: 'Entrega por autorizar' },
  { value: 'released', label: 'Entregado' },
  { value: 'blocked', label: 'Necesita atención' },
  { value: 'cancelled', label: 'Cancelado' },
] as const

const statusLabels: Record<string, string> = Object.fromEntries(epicStatuses.filter((status) => status.value).map((status) => [status.value, status.label]))

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

function epicStatusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll('_', ' ')
}

function workStateLabel(state: string) {
  return deliveryStateLabels[state] ?? state.replaceAll('_', ' ')
}

function EpicTaskRow({ item, onRemove, canManage, removing }: {
  item: DeliveryEpicDetail['work_items']['items'][number]
  canManage: boolean
  removing: boolean
  onRemove: (item: DeliveryEpicDetail['work_items']['items'][number]) => void
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/automation/work-items/${encodeURIComponent(item.id)}`} className="block truncate text-sm font-semibold text-ink hover:text-(--tenant-accent) hover:underline">
          {item.title}
        </Link>
        <p className="mt-1 text-xs text-ink-muted">{workStateLabel(item.state)} · en la épica desde {dateLabel(item.added_at)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge color={item.state === 'released' ? 'emerald' : item.state === 'blocked' ? 'rose' : 'zinc'}>{workStateLabel(item.state)}</Badge>
        {canManage ? (
          <button
            type="button"
            aria-label={`Quitar ${item.title} de la épica`}
            title="Quitar de la épica; la tarea seguirá en el proyecto"
            disabled={removing}
            onClick={() => onRemove(item)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border-subtle text-ink-muted transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/30"
          >
            <XMarkIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </li>
  )
}

function EpicDetailDialog({
  epicId,
  epicPageHref,
  projectWorkItems,
  onClose,
  onProjectChanged,
}: {
  epicId: string | null
  epicPageHref: string
  projectWorkItems: DeliveryWorkItem[]
  onClose: () => void
  onProjectChanged: () => void
}) {
  const [cursor, setCursor] = useState<string | undefined>()
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([])
  const [tasksState, setTasksState] = useState('')
  const [selectedWorkItemId, setSelectedWorkItemId] = useState('')
  const [busy, setBusy] = useState<'attach' | string | null>(null)
  const [message, setMessage] = useState('')
  const path = epicId ? deliveryEpicDetailPath(epicId, cursor, tasksState) : null
  const detail = useSWR<DeliveryEpicDetail>(path, fetcher)
  const data = detail.data
  const canManage = data?.can_manage === true
  const attachedIds = new Set(data?.work_items.items.map((item) => item.id) ?? [])
  const attachableWorkItems = projectWorkItems.filter((item) => !attachedIds.has(item.id))

  async function attachWorkItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!epicId || !selectedWorkItemId || !canManage || busy) return
    setBusy('attach')
    setMessage('')
    try {
      await api.post(deliveryEpicWorkItemsPath(epicId), { work_item_id: selectedWorkItemId })
      setSelectedWorkItemId('')
      setMessage('Tarea asociada a la épica. La tarea y su historial permanecen en el proyecto.')
      await detail.mutate()
      onProjectChanged()
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No se pudo asociar la tarea. Puede pertenecer a otra épica o tu permiso pudo cambiar.'))
      void detail.mutate()
    } finally {
      setBusy(null)
    }
  }

  async function removeWorkItem(item: DeliveryEpicDetail['work_items']['items'][number]) {
    if (!epicId || !canManage || busy) return
    setBusy(item.id)
    setMessage('')
    try {
      await api.delete(deliveryEpicWorkItemPath(epicId, item.id))
      setMessage('La tarea se quitó de la épica; sigue disponible en el proyecto.')
      await detail.mutate()
      onProjectChanged()
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No se pudo quitar la tarea de la épica.'))
      void detail.mutate()
    } finally {
      setBusy(null)
    }
  }

  function nextPage() {
    if (!data?.work_items.next_cursor || busy) return
    setPreviousCursors((current) => [...current, cursor])
    setCursor(data.work_items.next_cursor)
    setMessage('')
  }

  function previousPage() {
    if (previousCursors.length === 0 || busy) return
    const nextHistory = [...previousCursors]
    const previous = nextHistory.pop()
    setPreviousCursors(nextHistory)
    setCursor(previous)
  }

  function changeTasksState(nextState: string) {
    setTasksState(nextState)
    setCursor(undefined)
    setPreviousCursors([])
  }

  return (
    <Dialog open={Boolean(epicId)} onClose={onClose} size="4xl">
      {epicId ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Épica del proyecto</p>
              <DialogTitle className="mt-1">{data?.epic.title ?? 'Detalle de la épica'}</DialogTitle>
              {data?.epic.summary ? <DialogDescription>{data.epic.summary}</DialogDescription> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {data?.epic.status ? <Badge color={statusTone(data.epic.status)}>{epicStatusLabel(data.epic.status)}</Badge> : null}
              {epicId ? <Link href={epicPageHref} className="inline-flex min-h-10 items-center rounded-xl border border-border-subtle px-3 text-sm font-semibold text-ink-secondary transition hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">Abrir página completa</Link> : null}
              <button type="button" aria-label="Cerrar detalle de épica" onClick={onClose} className="inline-flex size-10 items-center justify-center rounded-xl border border-border-subtle text-ink-muted hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">
                <XMarkIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <DialogBody>
            {detail.isLoading && !data ? <p className="rounded-2xl bg-surface-soft p-4 text-sm text-ink-muted">Cargando tareas de la épica…</p> : null}
            {detail.error ? (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                <p>{getApiErrorMessage(detail.error, 'No se pudo cargar la épica.')}</p>
                <button type="button" onClick={() => void detail.mutate()} className="mt-2 min-h-9 font-semibold underline">Volver a intentar</button>
              </div>
            ) : null}
            {data ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border-subtle bg-surface-soft p-4"><p className="text-xs text-ink-muted">{tasksState ? 'Tareas coincidentes' : 'Tareas asociadas'}</p><p className="mt-1 text-xl font-semibold text-ink tabular-nums">{data.work_items.total}</p></div>
                  <div className="rounded-2xl border border-border-subtle bg-surface-soft p-4"><p className="text-xs text-ink-muted">Creada</p><p className="mt-1 text-sm font-semibold text-ink">{dateLabel(data.epic.created_at)}</p></div>
                  <div className="col-span-2 rounded-2xl border border-border-subtle bg-surface-soft p-4 sm:col-span-1"><p className="text-xs text-ink-muted">Último cambio</p><p className="mt-1 text-sm font-semibold text-ink">{dateLabel(data.epic.updated_at)}</p></div>
                </div>
                {canManage ? (
                  <form onSubmit={(event) => void attachWorkItem(event)} className="mt-5 rounded-2xl border border-border-subtle bg-surface-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><h3 className="text-sm font-semibold text-ink">Asociar una tarea existente</h3><p className="mt-1 text-xs leading-5 text-ink-muted">No crea ni asigna trabajo. La tarea seguirá siendo la misma dentro del proyecto.</p></div>
                      <Badge color="zinc">{attachableWorkItems.length} tareas del proyecto</Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <label className="sr-only" htmlFor="epic-work-item-select">Tarea del proyecto</label>
                      <select id="epic-work-item-select" value={selectedWorkItemId} onChange={(event) => setSelectedWorkItemId(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm" disabled={attachableWorkItems.length === 0 || busy !== null}>
                        <option value="">Selecciona una tarea…</option>
                        {attachableWorkItems.map((item) => <option key={item.id} value={item.id}>{item.title} · {workStateLabel(item.state)}</option>)}
                      </select>
                      <Button color="indigo" type="submit" disabled={!selectedWorkItemId || busy !== null}><PlusIcon data-slot="icon" />{busy === 'attach' ? 'Asociando…' : 'Asociar tarea'}</Button>
                    </div>
                    {attachableWorkItems.length === 0 ? <p className="mt-2 text-xs text-ink-muted">No hay otras tareas en la vista actual del proyecto.</p> : null}
                  </form>
                ) : null}
                {message ? <p role="status" className="mt-4 rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-secondary">{message}</p> : null}
                <section className="mt-6" aria-labelledby="epic-work-items-title">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><h3 id="epic-work-items-title" className="text-base font-semibold text-ink">Tareas de esta épica</h3><p className="mt-1 text-xs text-ink-muted">La lista sólo contiene metadatos seguros; el historial completo vive en cada tarea.</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor="epic-work-item-state">Filtrar tareas de la épica por estado</label>
                      <select
                        id="epic-work-item-state"
                        aria-describedby="epic-work-items-count"
                        value={tasksState}
                        onChange={(event) => changeTasksState(event.target.value)}
                        className="min-h-10 max-w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm"
                      >
                        {workItemStates.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
                      </select>
                      <Badge color="indigo">{data.work_items.total} {tasksState ? 'tareas coinciden' : 'tareas'}</Badge>
                    </div>
                  </div>
                  <p id="epic-work-items-count" className="mt-2 text-xs text-ink-muted" aria-live="polite">
                    {data.work_items.items.length} en esta página · {data.work_items.total} {tasksState ? 'coinciden con el filtro' : 'asociadas en total'}
                  </p>
                  {data.work_items.items.length > 0 ? (
                    <ul className="mt-3 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-raised">
                      {data.work_items.items.map((item) => <EpicTaskRow key={item.id} item={item} canManage={canManage} removing={busy === item.id} onRemove={(value) => void removeWorkItem(value)} />)}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-2xl border border-dashed border-border-subtle p-5 text-sm text-ink-muted">{tasksState ? 'No hay tareas de esta épica que coincidan con este estado.' : 'Esta épica todavía no tiene tareas asociadas. Puedes crear las tareas por separado en el proyecto y asociarlas después.'}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-ink-muted">Página {previousCursors.length + 1} · {data.work_items.items.length} de {data.work_items.total} coincidencias</p>
                    <div className="flex gap-2">
                      <Button outline type="button" disabled={previousCursors.length === 0 || busy !== null} onClick={previousPage}><ChevronLeftIcon data-slot="icon" />Anterior</Button>
                      <Button outline type="button" disabled={!data.work_items.next_cursor || busy !== null} onClick={nextPage}>Siguiente<ChevronRightIcon data-slot="icon" /></Button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </DialogBody>
        </>
      ) : null}
    </Dialog>
  )
}

export function ProjectEpicsPanel({ projectId, workItems, onProjectChanged }: {
  projectId: string
  workItems: DeliveryWorkItem[]
  onProjectChanged: () => void
}) {
  const searchParams = useSearchParams()
  const requestedStatus = searchParams.get('epic_status') ?? ''
  const initialStatus = epicStatuses.some((option) => option.value === requestedStatus) ? requestedStatus as DeliveryEpicStatus | '' : ''
  const [status, setStatus] = useState<DeliveryEpicStatus | ''>(initialStatus)
  const [cursor, setCursor] = useState<string | undefined>(() => searchParams.get('epic_cursor') || undefined)
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([])
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const path = deliveryProjectEpicsPagePath(projectId, { status: status || undefined, limit: 25, cursor })
  const epics = useSWR<DeliveryEpicListPage>(path, fetcher)
  const data = epics.data
  const canManage = data?.can_manage === true

  async function createEpic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || !title.trim() || creating) return
    setCreating(true)
    setMessage('')
    try {
      const response = await api.post(deliveryProjectEpicsPath(projectId), { title: title.trim(), summary: summary.trim() })
      const created = readApiData<DeliveryEpicSummary>(response.data)
      setTitle('')
      setSummary('')
      setCreateOpen(false)
      setStatus('')
      setCursor(undefined)
      setPreviousCursors([])
      setMessage('Épica creada. No se inició ningún agente.')
      await epics.mutate()
      if (created?.id) setSelectedEpicId(created.id)
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No se pudo crear la épica.'))
      void epics.mutate()
    } finally {
      setCreating(false)
    }
  }

  function nextPage() {
    if (!data?.next_cursor) return
    setPreviousCursors((current) => [...current, cursor])
    setCursor(data.next_cursor)
  }

  function previousPage() {
    if (previousCursors.length === 0) return
    const nextHistory = [...previousCursors]
    const previous = nextHistory.pop()
    setPreviousCursors(nextHistory)
    setCursor(previous)
  }

  function changeStatus(nextStatus: DeliveryEpicStatus | '') {
    setStatus(nextStatus)
    setCursor(undefined)
    setPreviousCursors([])
  }

  return (
    <>
      <section id="project-epics" className="premium-surface overflow-hidden rounded-3xl" aria-labelledby="project-epics-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Organización del proyecto</p>
            <h2 id="project-epics-title" className="mt-1 text-lg font-semibold text-ink">Épicas</h2>
            <p className="mt-1 text-sm text-ink-secondary">Agrupan tareas existentes; crear una épica no lanza agentes ni crea tareas automáticamente.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="project-epic-status">Filtrar épicas por estado</label>
            <select id="project-epic-status" value={status} onChange={(event) => changeStatus(event.target.value as DeliveryEpicStatus | '')} className="min-h-10 rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm">
              {epicStatuses.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
            {canManage ? <Button color="indigo" type="button" onClick={() => setCreateOpen((current) => !current)}><PlusIcon data-slot="icon" />{createOpen ? 'Cerrar formulario' : 'Crear épica'}</Button> : null}
          </div>
        </div>
        {createOpen && canManage ? (
          <form onSubmit={(event) => void createEpic(event)} className="grid gap-3 border-b border-border-subtle bg-surface-soft/50 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end sm:px-6">
            <label className="text-xs font-semibold text-ink">Nombre de la épica
              <input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal" placeholder="Ej. Plataforma de operaciones" />
            </label>
            <label className="text-xs font-semibold text-ink">Resumen <span className="font-normal text-ink-muted">(opcional)</span>
              <input maxLength={4000} value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-border-subtle bg-surface-raised px-3 text-sm font-normal" placeholder="Resultado o alcance que conecta sus tareas" />
            </label>
            <Button color="indigo" type="submit" disabled={!title.trim() || creating}>{creating ? 'Creando…' : 'Guardar épica'}</Button>
          </form>
        ) : null}
        {message ? <p role="status" className="border-b border-border-subtle px-5 py-3 text-sm text-ink-secondary sm:px-6">{message}</p> : null}
        {epics.isLoading && !data ? <div className="p-6 text-sm text-ink-muted">Cargando épicas…</div> : null}
        {epics.error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-rose-800 dark:text-rose-200">
            <span>{getApiErrorMessage(epics.error, 'No se pudieron cargar las épicas.')}</span>
            <button type="button" onClick={() => void epics.mutate()} className="inline-flex min-h-9 items-center gap-1 font-semibold underline"><ArrowPathIcon className="size-4" />Volver a intentar</button>
          </div>
        ) : null}
        {data && data.items.length > 0 ? (
          <>
            <ul className="divide-y divide-border-subtle">
              {data.items.map((epic) => (
                <li key={epic.id}>
                  <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-soft sm:px-6">
                    <Link href={deliveryEpicBrowserPath(epic.id, { status, cursor })} aria-label={`Ver página de épica: ${epic.title}`} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-ink">{epic.title}</span><Badge color={statusTone(epic.status)}>{epicStatusLabel(epic.status)}</Badge></span>
                      {epic.summary ? <span className="mt-1 block line-clamp-2 text-sm text-ink-secondary">{epic.summary}</span> : null}
                      <span className="mt-1 block text-xs text-ink-muted">{epic.task_count} {epic.task_count === 1 ? 'tarea asociada' : 'tareas asociadas'} · actualizado {dateLabel(epic.updated_at)}</span>
                    </span>
                    <ArrowRightIcon className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                    </Link>
                    <button type="button" onClick={() => setSelectedEpicId(epic.id)} aria-label={`Abrir vista rápida de épica: ${epic.title}`} className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-border-subtle px-3 text-xs font-semibold text-ink-secondary transition hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">Vista rápida</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-5 py-3 sm:px-6">
              <p className="text-xs text-ink-muted">Página {previousCursors.length + 1} · {data.items.length} épicas{status ? ` · ${epicStatusLabel(status).toLowerCase()}` : ''}</p>
              <div className="flex gap-2">
                <Button outline type="button" disabled={previousCursors.length === 0} onClick={previousPage}><ChevronLeftIcon data-slot="icon" />Anterior</Button>
                <Button outline type="button" disabled={!data.next_cursor} onClick={nextPage}>Siguiente<ChevronRightIcon data-slot="icon" /></Button>
              </div>
            </div>
          </>
        ) : data && !epics.error ? (
          <div className="p-7 text-center">
            <p className="text-sm font-semibold text-ink">{status ? 'No hay épicas con este estado' : 'Este proyecto todavía no tiene épicas'}</p>
            <p className="mt-1 text-sm text-ink-muted">Las tareas siguen visibles en la sección de trabajo del proyecto y pueden asociarse después.</p>
            {canManage && !createOpen ? <button type="button" onClick={() => setCreateOpen(true)} className="mt-3 min-h-10 font-semibold text-(--tenant-accent) hover:underline">Crear la primera épica</button> : null}
          </div>
        ) : null}
      </section>
      <EpicDetailDialog
        key={selectedEpicId ?? 'closed'}
        epicId={selectedEpicId}
        epicPageHref={selectedEpicId ? deliveryEpicBrowserPath(selectedEpicId, { status, cursor }) : '#'}
        projectWorkItems={workItems}
        onClose={() => setSelectedEpicId(null)}
        onProjectChanged={() => { onProjectChanged(); void epics.mutate() }}
      />
    </>
  )
}
