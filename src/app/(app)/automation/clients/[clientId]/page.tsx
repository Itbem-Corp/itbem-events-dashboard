'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import {
  aggregateDeliveryPortfolioCosts,
  deliveryPortfolioCostCoverage,
  deliveryPortfolioRefreshInterval,
  normalizeDeliveryPortfolio,
  portfolioCostAmountLabel,
  portfolioCostCoverageNote,
  type DeliveryPortfolioProject,
  type DeliveryPortfolioSnapshot,
} from '@/features/automation/delivery-portfolio'
import type { DeliveryClientOverview } from '@/features/automation/delivery-types'
import { api, localSessionRecoveryMessage } from '@/lib/api'
import { automationPortfolioPath, deliveryClientProfilePath, deliveryClientsPath, deliveryProjectPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { ArrowLeftIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, BuildingOffice2Icon, ChatBubbleLeftRightIcon, CheckCircleIcon, ClipboardDocumentCheckIcon, CodeBracketIcon, CurrencyDollarIcon, ExclamationTriangleIcon, FolderIcon, HeartIcon, ListBulletIcon, PencilSquareIcon, UserGroupIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { type FormEvent, useMemo, useState } from 'react'
import useSWR from 'swr'

type ClientHealth = 'healthy' | 'watch' | 'at_risk'
type ClientPortfolioData = { snapshot: DeliveryPortfolioSnapshot; costsAvailable: boolean }

type RecordLike = Record<string, unknown>

function asRecord(value: unknown): RecordLike | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordLike : null
}

function hasCostSource(value: unknown) {
  const record = asRecord(value)
  if (!record) return false

  // An omitted marker means the API attempted the summary. The normalized
  // amount and per-period unpriced count remain optional so older payloads can
  // show a known subtotal with explicitly unknown coverage rather than $0.
  const hasUnavailableMarker = Object.hasOwn(record, 'summary_sources_unavailable') || Object.hasOwn(record, 'summarySourcesUnavailable')
  const unavailable = record.summary_sources_unavailable ?? record.summarySourcesUnavailable
  if (hasUnavailableMarker && (!Array.isArray(unavailable) || !unavailable.every(source => typeof source === 'string') || unavailable.includes('costs'))) return false
  return true
}

function normalizeClientPortfolioResponse(value: unknown): ClientPortfolioData | null {
  const snapshot = normalizeDeliveryPortfolio(value)
  return snapshot ? { snapshot, costsAvailable: hasCostSource(value) } : null
}

const clientHealth = {
  healthy: { label: 'Estable', color: 'emerald' as const },
  watch: { label: 'En seguimiento', color: 'amber' as const },
  at_risk: { label: 'Requiere atención', color: 'rose' as const },
} satisfies Record<ClientHealth, { label: string; color: 'emerald' | 'amber' | 'rose' }>

const unsafeClientContext = /(?:\b(?:sk|rk|pk|gh[pousr])[-_][a-z0-9_-]{12,}\b|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+\S+|\b(?:api[_ -]?key|secret|token|password)\s*[:=]\s*\S+|\b(?:system|developer|user)?\s*(?:prompt|reasoning|thought|chain[ -]of[ -]thought)\s*[:=])/i

function profileLines(value?: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
  } catch {
    return []
  }
}

function safeClientContext(value?: string) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return ''
  if (unsafeClientContext.test(normalized)) return 'Contenido omitido por seguridad'
  return normalized.length > 1_200 ? `${normalized.slice(0, 1_197)}…` : normalized
}

function contextDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function clientContextStatus(error: unknown) {
  if (typeof error !== 'object' || error === null || !('response' in error)) return 'No se pudo guardar el contexto. Intenta de nuevo.'
  const response = error.response
  if (typeof response === 'object' && response !== null && 'status' in response && response.status === 403) {
    return 'El servidor rechazó el cambio. Sólo una persona administradora de plataforma puede editar el contexto de empresa.'
  }
  return 'No se pudo guardar el contexto. Intenta de nuevo.'
}

function formatCostMicros(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value / 1_000_000)
}

function projectListPath(clientId: string) {
  const query = new URLSearchParams({ client: clientId })
  return `${deliveryProjectsPath()}?${query.toString()}`
}

function projectHealth(project: DeliveryPortfolioProject) {
  if (project.decisionsRequired + project.blockedWorkItems + project.attentionTasks > 0) return { label: 'Requiere atención', color: 'rose' as const }
  if (project.activeWorkItems > 0) return { label: 'En marcha', color: 'blue' as const }
  return { label: project.status, color: 'zinc' as const }
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail?: string; icon: typeof FolderIcon }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-medium text-ink-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>{detail ? <p className="mt-1 text-xs text-ink-muted">{detail}</p> : null}</div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><Icon className="size-4" aria-hidden="true" /></span>
      </div>
    </div>
  )
}

function TagList({ label, values, emptyLabel }: { label: string; values: string[]; emptyLabel: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">{label}</p>
      {values.length > 0 ? <ul className="mt-2 flex flex-wrap gap-1.5">{values.map(value => <li key={value} className="rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs font-medium text-ink-secondary">{value}</li>)}</ul> : <p className="mt-1 text-xs text-ink-muted">{emptyLabel}</p>}
    </div>
  )
}

function ProjectCard({ project, costAvailable }: { project: DeliveryPortfolioProject; costAvailable: boolean }) {
  const health = projectHealth(project)
  const costCoverage = deliveryPortfolioCostCoverage(
    costAvailable ? project.costLast30DaysMicros : undefined,
    costAvailable ? project.unpricedExecutionsLast30Days : undefined,
  )
  const cost = portfolioCostAmountLabel(costCoverage, formatCostMicros)
  const costNote = costAvailable ? portfolioCostCoverageNote(costCoverage) : 'Costo USD no disponible.'
  const workItems = [...project.workItems].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))

  return (
    <article className="rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={deliveryProjectPath(project.id)} className="group inline-flex min-h-8 items-center gap-1.5 text-base font-semibold text-ink hover:text-(--tenant-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)/35">
            <span className="truncate">{project.name}</span><ArrowTopRightOnSquareIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </Link>
          <p className="mt-1 text-xs text-ink-muted">Actualizado {new Date(project.updatedAt).toLocaleDateString('es-MX')}</p>
        </div>
        <Badge color={health.color}>{health.label}</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-surface-soft/65 p-2.5"><dt className="text-[10px] text-ink-muted">Trabajos</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{project.workItemCount}</dd></div>
        <div className="rounded-xl bg-surface-soft/65 p-2.5"><dt className="text-[10px] text-ink-muted">Activos</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{project.activeWorkItems}</dd></div>
        <div className="rounded-xl bg-surface-soft/65 p-2.5"><dt className="text-[10px] text-ink-muted">Atención</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{project.decisionsRequired + project.blockedWorkItems + project.attentionTasks}</dd></div>
        <div className="rounded-xl bg-surface-soft/65 p-2.5"><dt className="text-[10px] text-ink-muted">IA · 30 días</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{cost}</dd>{costNote ? <dd className="mt-1 text-[10px] leading-4 text-amber-800">{costNote}</dd> : null}</div>
      </dl>

      <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
        <TagList label="Tecnologías configuradas" values={project.technologyTags} emptyLabel="Sin tecnologías registradas." />
        <TagList label="Runtime observado" values={project.runtimeHints} emptyLabel="Sin señales de runtime disponibles." />
      </div>

      {workItems.length > 0 ? (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">Actividad reciente</p>
          <ul className="mt-1 divide-y divide-border-subtle/70">{workItems.slice(0, 3).map(item => <li key={item.id}><Link href={`/automation/work-items/${encodeURIComponent(item.id)}`} className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm hover:text-(--tenant-accent)"><span className="min-w-0 truncate text-ink">{item.title}</span><span className="shrink-0 text-xs text-ink-muted">{item.state}</span></Link></li>)}</ul>
          {project.workItemsTruncated ? <p className="mt-1 text-xs text-ink-muted">Resumen parcial; abre el proyecto para consultar el resto de tareas y épicas.</p> : null}
        </div>
      ) : <p className="mt-4 border-t border-border-subtle pt-3 text-xs text-ink-muted">Este proyecto aún no tiene trabajos visibles.</p>}
    </article>
  )
}

export default function AutomationClientOverviewPage() {
  const params = useParams<{ clientId: string }>()
  const clientId = typeof params.clientId === 'string' ? params.clientId : ''
  const [editingClientContext, setEditingClientContext] = useState(false)
  const [clientContextSaving, setClientContextSaving] = useState(false)
  const [clientContextMessage, setClientContextMessage] = useState('')
  const [draftClientHealth, setDraftClientHealth] = useState<ClientHealth>('healthy')
  const [draftClientContacts, setDraftClientContacts] = useState('')
  const [draftClientRules, setDraftClientRules] = useState('')
  const [draftClientHandoff, setDraftClientHandoff] = useState('')
  const clients = useSWR<DeliveryClientOverview[]>(clientId ? deliveryClientsPath() : null, fetcher, {
    refreshInterval: 30_000,
    dedupingInterval: 5_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })
  const portfolio = useSWR<ClientPortfolioData | null>(
    clientId ? automationPortfolioPath() : null,
    async path => normalizeClientPortfolioResponse(await fetcher<unknown>(path)),
    { refreshInterval: data => deliveryPortfolioRefreshInterval(data?.snapshot), dedupingInterval: 5_000, revalidateOnFocus: true, keepPreviousData: true },
  )
  const company = clients.data?.find(item => item.client.id === clientId)
  const profile = company?.profile
  const profileHealth = profile && profile.health in clientHealth ? clientHealth[profile.health as ClientHealth] : null
  const contacts = profileLines(profile?.contacts).map(safeClientContext).filter(Boolean)
  const rules = profileLines(profile?.rules).map(safeClientContext).filter(Boolean)
  const handoff = safeClientContext(profile?.conversation_summary)
  const portfolioData = portfolio.data ?? null
  const snapshot = portfolioData?.snapshot ?? null
  const costAvailable = portfolioData?.costsAvailable === true
  const projects = useMemo(
    () => snapshot?.projects.filter(project => project.clientId === clientId).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)) ?? [],
    [clientId, snapshot],
  )
  const fallbackName = projects[0]?.client.name
  const companyName = company?.client.name ?? fallbackName ?? 'Empresa'
  const totals = useMemo(() => {
    const costCoverage = aggregateDeliveryPortfolioCosts(projects.map(project => ({
      costLast30DaysMicros: costAvailable ? project.costLast30DaysMicros : undefined,
      unpricedExecutionsLast30Days: costAvailable ? project.unpricedExecutionsLast30Days : undefined,
    })))
    const operational = projects.reduce((summary, project) => ({
      workItems: summary.workItems + project.workItemCount,
      active: summary.active + project.activeWorkItems,
      attention: summary.attention + project.decisionsRequired + project.blockedWorkItems + project.attentionTasks,
    }), { workItems: 0, active: 0, attention: 0 })
    return { ...operational, costCoverage }
  }, [costAvailable, projects])
  const technologyTags = useMemo(() => [...new Set(projects.flatMap(project => project.technologyTags))].sort(), [projects])
  const runtimeHints = useMemo(() => [...new Set(projects.flatMap(project => project.runtimeHints))].sort(), [projects])
  const costCoverageNote = costAvailable ? portfolioCostCoverageNote(totals.costCoverage) : 'El resumen de costos no está disponible.'
  const isLoading = clients.isLoading || portfolio.isLoading
  const hasLoadError = Boolean(clients.error || portfolio.error) && !clients.data && !snapshot
  const sessionMessage = localSessionRecoveryMessage(portfolio.error) ?? localSessionRecoveryMessage(clients.error)
  const notFound = !isLoading && Boolean(clients.data || snapshot) && !company && projects.length === 0

  async function refresh() {
    await Promise.all([clients.mutate(), portfolio.mutate()])
  }

  function editClientContext() {
    const profile = company?.profile
    setDraftClientHealth(profile && profile.health in clientHealth ? profile.health as ClientHealth : 'healthy')
    setDraftClientContacts(profileLines(profile?.contacts).join('\n'))
    setDraftClientRules(profileLines(profile?.rules).join('\n'))
    setDraftClientHandoff(profile?.conversation_summary ?? '')
    setClientContextMessage('')
    setEditingClientContext(true)
  }

  async function saveClientContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!clientId || !company) return
    setClientContextSaving(true)
    setClientContextMessage('')
    try {
      await api.put(deliveryClientProfilePath(clientId), {
        health: draftClientHealth,
        contacts: draftClientContacts.split('\n').map((entry) => entry.trim()).filter(Boolean),
        rules: draftClientRules.split('\n').map((entry) => entry.trim()).filter(Boolean),
        conversation_summary: draftClientHandoff.trim(),
      })
      setClientContextMessage('Contexto guardado. Los nuevos flujos tomarán una copia al iniciar.')
      setEditingClientContext(false)
      try {
        await clients.mutate()
      } catch {
        // The mutation succeeded; a failed read refresh must not misreport the write as rejected.
      }
    } catch (error) {
      // Never render an API error body: a 403 may include server details unrelated to this view.
      setClientContextMessage(clientContextStatus(error))
    } finally {
      setClientContextSaving(false)
    }
  }

  return (
    <PageTransition>
      <main className="mx-auto max-w-[92rem] px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:pb-10">
        <nav aria-label="Jerarquía del portafolio" className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Link href="/clients" className="rounded-sm hover:text-ink">Organizaciones</Link><span aria-hidden="true">/</span>
          <Link href="/automation/clients" className="rounded-sm hover:text-ink">Clientes</Link><span aria-hidden="true">/</span>
          <span aria-current="page" className="max-w-64 truncate font-semibold text-ink-secondary">{companyName}</span>
        </nav>
        <PageHeader
          eyebrow="Overview de empresa"
          title={companyName}
          description="Proyectos, señales operativas, stack tecnológico y gasto de IA de esta empresa."
          icon={BuildingOffice2Icon}
          actions={<div className="flex flex-wrap gap-2"><Button outline onClick={() => void refresh()} aria-label={`Actualizar overview de ${companyName}`}><ArrowPathIcon data-slot="icon" />Actualizar</Button><Link href={projectListPath(clientId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-(--tenant-accent) px-3 text-xs font-semibold text-white hover:opacity-90">Ver proyectos<ArrowTopRightOnSquareIcon className="size-3.5" /></Link></div>}
        />

        {isLoading && !company && !snapshot ? <div className="mt-5 rounded-2xl border border-border-subtle bg-surface-raised p-8 text-center text-sm text-ink-muted">Cargando overview de empresa…</div> : null}
        {hasLoadError ? <div role="alert" className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/[.06] p-5"><div className="flex items-start gap-3"><ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600"/><div><p className="text-sm font-semibold text-ink">{sessionMessage ? 'La sesión local necesita atención' : 'No se pudo cargar el overview'}</p><p className="mt-1 text-sm text-ink-muted">{sessionMessage ?? 'Reintenta para consultar los proyectos y señales disponibles para esta empresa.'}</p></div></div></div> : null}
        {notFound ? <div className="mt-5 rounded-2xl border border-border-subtle bg-surface-raised p-8 text-center"><p className="text-sm font-semibold text-ink">No encontramos una empresa accesible con este identificador.</p><Link href="/automation/clients" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-(--tenant-accent)"><ArrowLeftIcon className="size-4"/>Volver al portafolio</Link></div> : null}

        {company || projects.length > 0 ? <>
          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Resumen de empresa">
            <Metric label="Proyectos" value={company?.project_count ?? projects.length} detail={`${projects.length} visibles para tu acceso`} icon={FolderIcon} />
            <Metric label="Trabajos" value={totals.workItems} detail="Épicas y tareas registradas" icon={ListBulletIcon} />
            <Metric label="En movimiento" value={totals.active} detail="Trabajos activos ahora" icon={ArrowPathIcon} />
            <Metric label="Atención" value={totals.attention} detail="Gates, bloqueos o fallos" icon={ExclamationTriangleIcon} />
            <Metric label="IA · 30 días" value={costAvailable ? portfolioCostAmountLabel(totals.costCoverage, formatCostMicros) : 'No disponible'} detail={costCoverageNote ?? 'Cobertura completa en proyectos visibles'} icon={CurrencyDollarIcon} />
          </section>

          {company ? (
            <section className="mt-5 rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5" aria-labelledby="company-context-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    <ClipboardDocumentCheckIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id="company-context-title" className="text-base font-semibold text-ink">Contexto de empresa</h2>
                      {profile ? (
                        <Badge color={profileHealth?.color ?? 'zinc'}>{profileHealth?.label ?? 'Estado no reconocido'}</Badge>
                      ) : <Badge color="zinc">Sin perfil guardado</Badge>}
                    </div>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
                      Fuente: perfil persistido de esta empresa. Los proyectos y tareas sólo reciben snapshots al crearse; esta vista no inventa contexto cuando el perfil falta.
                    </p>
                  </div>
                </div>
                {!editingClientContext ? (
                  <Button outline type="button" onClick={editClientContext} aria-label={`Editar contexto de ${companyName}`}>
                    <PencilSquareIcon data-slot="icon" />Editar contexto
                  </Button>
                ) : null}
              </div>

              {editingClientContext ? (
                <form onSubmit={saveClientContext} className="mt-4 space-y-4 border-t border-border-subtle pt-4">
                  <p className="rounded-xl border border-sky-500/20 bg-sky-500/[.05] px-3 py-2 text-xs leading-5 text-ink-muted">
                    No incluyas credenciales. El servidor valida permisos al guardar; la edición persistente requiere administración de plataforma.
                  </p>
                  <fieldset>
                    <legend className="text-sm font-medium text-ink">Salud de la relación</legend>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Salud de la relación de empresa">
                      {(Object.entries(clientHealth) as Array<[ClientHealth, (typeof clientHealth)[ClientHealth]]>).map(([value, state]) => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={draftClientHealth === value}
                          onClick={() => setDraftClientHealth(value)}
                          className={`min-h-10 rounded-xl border px-3 text-xs font-semibold ${draftClientHealth === value ? 'border-(--tenant-accent) bg-(--tenant-accent)/10 text-ink' : 'border-border-subtle bg-surface-soft text-ink-muted'}`}
                        >
                          {state.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block text-sm font-medium text-ink">
                      Contactos <span className="font-normal text-ink-muted">(uno por línea)</span>
                      <textarea value={draftClientContacts} onChange={(event) => setDraftClientContacts(event.target.value)} rows={4} maxLength={12000} placeholder="Nombre · rol · canal" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm" />
                    </label>
                    <label className="block text-sm font-medium text-ink">
                      Reglas <span className="font-normal text-ink-muted">(una por línea)</span>
                      <textarea value={draftClientRules} onChange={(event) => setDraftClientRules(event.target.value)} rows={4} maxLength={12000} placeholder="Decisiones reutilizables para los equipos de esta empresa" className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-ink">
                    Resumen del último handoff
                    <textarea value={draftClientHandoff} onChange={(event) => setDraftClientHandoff(event.target.value)} rows={4} maxLength={12000} placeholder="Acuerdos vigentes o decisiones recientes. Sin credenciales." className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm" />
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button outline type="button" onClick={() => { setEditingClientContext(false); setClientContextMessage('') }} disabled={clientContextSaving}>Cancelar</Button>
                    <Button color="indigo" type="submit" disabled={clientContextSaving}>
                      <HeartIcon data-slot="icon" />{clientContextSaving ? 'Guardando…' : 'Guardar contexto'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 grid gap-4 border-t border-border-subtle pt-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><HeartIcon className="size-4 text-(--tenant-accent)" aria-hidden="true" />Salud</p>
                    <p className="mt-1 text-sm text-ink-secondary">{profileHealth?.label ?? (profile ? 'Estado no reconocido' : 'Sin estado registrado')}</p>
                    {profile?.updated_at ? <p className="mt-1 text-[11px] text-ink-muted">Actualizado {contextDate(profile.updated_at) ?? 'sin fecha válida'}</p> : null}
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><UserGroupIcon className="size-4 text-(--tenant-accent)" aria-hidden="true" />Contactos</p>
                    {contacts.length ? <ul className="mt-1 space-y-1 text-sm text-ink-secondary">{contacts.map((entry, index) => <li key={`${index}:${entry}`} className="break-words">{entry}</li>)}</ul> : <p className="mt-1 text-xs text-ink-muted">{profile ? 'Sin contactos registrados.' : 'No hay contactos: aún no existe perfil de empresa.'}</p>}
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><ClipboardDocumentCheckIcon className="size-4 text-(--tenant-accent)" aria-hidden="true" />Reglas</p>
                    {rules.length ? <ul className="mt-1 space-y-1 text-sm text-ink-secondary">{rules.map((entry, index) => <li key={`${index}:${entry}`} className="break-words">{entry}</li>)}</ul> : <p className="mt-1 text-xs text-ink-muted">{profile ? 'Sin reglas registradas.' : 'No hay reglas: aún no existe perfil de empresa.'}</p>}
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink"><ChatBubbleLeftRightIcon className="size-4 text-(--tenant-accent)" aria-hidden="true" />Último handoff</p>
                    {handoff ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-ink-secondary">{handoff}</p> : <p className="mt-1 text-xs text-ink-muted">{profile ? 'Sin resumen de conversación registrado.' : 'No hay handoff: aún no existe perfil de empresa.'}</p>}
                    {profile?.last_conversation_at ? <p className="mt-1 text-[11px] text-ink-muted">Registrado {contextDate(profile.last_conversation_at) ?? 'sin fecha válida'}</p> : null}
                  </div>
                </div>
              )}
              {clientContextMessage ? <p role="status" className="mt-4 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-xs leading-5 text-ink-secondary">{clientContextMessage}</p> : null}
              {!profile ? <p className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-border-subtle px-3 py-2 text-xs text-ink-muted"><CheckCircleIcon className="size-4 shrink-0" aria-hidden="true" />El perfil de contexto no está guardado en el API. Al editar y guardar, el servidor decidirá si tu rol puede crearlo.</p> : null}
            </section>
          ) : null}

          <section className="mt-5 rounded-2xl border border-border-subtle bg-surface-raised p-4 sm:p-5" aria-labelledby="company-stack-title">
            <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)"><CodeBracketIcon className="size-4" aria-hidden="true" /></span><div><h2 id="company-stack-title" className="text-sm font-semibold text-ink">Stack tecnológico de la empresa</h2><p className="mt-1 text-xs leading-5 text-ink-muted">Agregado sólo de los proyectos visibles. Las tecnologías son configuración; el runtime son señales observadas y no una conclusión automática.</p></div></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><TagList label="Tecnologías declaradas" values={technologyTags} emptyLabel="Aún no hay tecnologías declaradas en el contexto de los proyectos."/><TagList label="Runtime detectado" values={runtimeHints} emptyLabel="Aún no hay señales de runtime en los checkpoints de repositorio."/></div>
          </section>

          <section className="mt-6" aria-labelledby="company-projects-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold tracking-[0.1em] text-ink-muted uppercase">Ejecución por proyecto</p><h2 id="company-projects-title" className="mt-1 text-xl font-semibold text-ink">Proyectos</h2></div><p className="text-xs text-ink-muted">Actualización automática según actividad y al volver a la pestaña.</p></div>
            {projects.length > 0 ? <div className="grid gap-3 xl:grid-cols-2">{projects.map(project => <ProjectCard key={project.id} project={project} costAvailable={costAvailable}/>)}</div> : <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-raised p-8 text-center"><p className="text-sm font-semibold text-ink">Esta empresa todavía no tiene proyectos visibles.</p><Link href={projectListPath(clientId)} className="mt-3 inline-flex min-h-10 items-center gap-1 font-semibold text-(--tenant-accent)">Crear o revisar proyectos<ArrowTopRightOnSquareIcon className="size-3.5"/></Link></div>}
          </section>
        </> : null}

        <div className="mt-6"><Link href="/automation/clients" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-ink-secondary hover:text-ink"><ArrowLeftIcon className="size-4"/>Volver al portafolio de clientes</Link></div>
      </main>
    </PageTransition>
  )
}
