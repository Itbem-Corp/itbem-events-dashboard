'use client'

import { usePageActivity } from '@/hooks/usePageActivity'
import { readApiData } from '@/lib/api-envelope'
import { eventAnalyticsPath } from '@/lib/api-paths'
import { EVENT_LIVE_REFRESH_INTERVAL_MS } from '@/lib/event-live-refresh'
import { fetcher } from '@/lib/fetcher'
import { buildEventGuestAnalytics } from '@/lib/event-guest-analytics'
import { normalizeKeys } from '@/lib/normalizer'
import type { EventAnalytics, EventGuestAnalyticsSummary, PerformanceMetricSummary } from '@/models/EventAnalytics'
import type { Guest } from '@/models/Guest'
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import useSWR from 'swr'

interface Props {
  eventId: string
  eventIdentifier: string
  eventCapacity?: number | null
  guests?: Guest[]
  guestsLoading?: boolean
  liveRefreshEnabled?: boolean
}

const ROLE_COLORS: Record<string, string> = {
  graduate: '#6366f1',
  guest: '#a78bfa',
  vip: '#f59e0b',
  speaker: '#10b981',
  staff: '#3b82f6',
  host: '#ec4899',
  '': '#71717a',
}

const PALETTE = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#a78bfa', '#71717a']

const METHOD_LABELS: Record<string, string> = {
  web: 'Web',
  app: 'App',
  host: 'Anfitrión',
  '': 'Sin dato',
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  color: '#f4f4f5',
}

const cardCls = 'rounded-xl bg-zinc-900 border border-zinc-800 p-4'
const liveEventSwrOptions = {
  revalidateOnFocus: true,
} as const

function nonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value))
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return 0

    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed))
  }

  return 0
}

function nonNegativeNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : 0
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function normalizePerformance(value: unknown): PerformanceMetricSummary[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    const route = typeof row.route === 'string' ? row.route.trim() : ''
    const metric = typeof row.metric === 'string' ? row.metric.trim() : ''
    if (!route || !metric) return []
    return [{
      route,
      metric,
      sample_count: nonNegativeInt(row.sample_count),
      average: nonNegativeNumber(row.average),
      minimum: nonNegativeNumber(row.minimum),
      maximum: nonNegativeNumber(row.maximum),
      p75: nonNegativeNumber(row.p75),
      p95: nonNegativeNumber(row.p95),
      rating: typeof row.rating === 'string' ? row.rating : undefined,
    }]
  })
}

export function normalizeEventAnalyticsPayload(value: unknown): EventAnalytics | undefined {
  const data = readApiData<unknown>(normalizeKeys(value))
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined

  const record = data as Record<string, unknown>
  const analytics: EventAnalytics = {
    id: typeof record.id === 'string' ? record.id : '',
    event_id: typeof record.event_id === 'string' ? record.event_id : '',
    views: nonNegativeInt(record.views),
    rsvp_confirmed: nonNegativeInt(record.rsvp_confirmed),
    rsvp_declined: nonNegativeInt(record.rsvp_declined),
    moment_uploads: nonNegativeInt(record.moment_uploads),
    moment_comments: nonNegativeInt(record.moment_comments),
    moment_total: nonNegativeInt(record.moment_total),
    moment_approved: nonNegativeInt(record.moment_approved),
    moment_pending: nonNegativeInt(record.moment_pending),
    guests: normalizeGuestAnalytics(record.guests),
    performance: normalizePerformance(record.performance),
  }

  if (typeof record.created_at === 'string') analytics.created_at = record.created_at
  if (typeof record.updated_at === 'string') analytics.updated_at = record.updated_at

  return analytics
}

function normalizeGuestAnalytics(value: unknown): EventGuestAnalyticsSummary {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const counts = (key: string) => Array.isArray(source[key]) ? (source[key] as Array<Record<string, unknown>>).map(item => ({ name: typeof item.name === 'string' ? item.name : '', value: nonNegativeInt(item.value) })) : []
  return {
    total_guests: nonNegativeInt(source.total_guests), confirmed: nonNegativeInt(source.confirmed),
    declined: nonNegativeInt(source.declined), pending: nonNegativeInt(source.pending),
    total_companions: nonNegativeInt(source.total_companions), estimated_attendees: nonNegativeInt(source.estimated_attendees),
    dietary: counts('dietary'), methods: counts('methods'), roles: counts('roles'), tables: counts('tables'),
    timeline: Array.isArray(source.timeline) ? (source.timeline as Array<Record<string, unknown>>).map(item => ({ date: typeof item.date === 'string' ? item.date : '', confirmed: nonNegativeInt(item.confirmed), declined: nonNegativeInt(item.declined) })) : [],
    top_companions: Array.isArray(source.top_companions) ? (source.top_companions as Array<Record<string, unknown>>).map(item => ({ id: typeof item.id === 'string' ? item.id : '', first_name: typeof item.first_name === 'string' ? item.first_name : '', last_name: typeof item.last_name === 'string' ? item.last_name : '', role: typeof item.role === 'string' ? item.role : '', companion_count: nonNegativeInt(item.companion_count) })) : [],
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 sm:grid-cols-2">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-zinc-800" />
      ))}
      <div className="col-span-1 h-48 rounded-xl bg-zinc-800 sm:col-span-2" />
      <div className="col-span-1 h-48 rounded-xl bg-zinc-800 sm:col-span-2" />
    </div>
  )
}

function KPICard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number | string
  sub?: string
  accent?: string
}) {
  return (
    <div className={cardCls + ' flex flex-col gap-1'}>
      <p className="text-xs tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className={`truncate text-2xl font-bold sm:text-3xl ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-4 text-sm font-medium text-zinc-400">{children}</h3>
}

const PERFORMANCE_LABELS: Record<string, string> = {
  lcp: 'LCP', inp: 'INP', cls: 'CLS', page_spec_ms: 'PageSpec',
  photo_visible_ms: 'Primera foto', rsvp_submit_ms: 'Envío RSVP',
}

const PERFORMANCE_ROUTE_LABELS: Record<string, string> = {
  event: 'Invitación', moments: 'Momentos', rsvp: 'RSVP', upload: 'Subida', tv: 'TV',
}

function formatPerformanceValue(metric: string, value: number): string {
  if (metric === 'cls') return value.toFixed(value < 1 ? 2 : 1)
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} s`
  return `${Math.round(value)} ms`
}

function performanceRatingClasses(rating?: string): string {
  if (rating === 'good') return 'border-lime-400/20 bg-lime-400/10 text-lime-300'
  if (rating === 'needs_improvement') return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
  if (rating === 'poor') return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
  return 'border-zinc-700 bg-zinc-800 text-zinc-400'
}

function performanceRatingLabel(rating?: string): string {
  if (rating === 'good') return 'Bueno'
  if (rating === 'needs_improvement') return 'Mejorable'
  if (rating === 'poor') return 'Deficiente'
  return 'Observación'
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function EventAnalyticsPanel({
  eventId,
  eventCapacity,
  guests: providedGuests,
  guestsLoading: providedGuestsLoading,
  liveRefreshEnabled = true,
}: Props) {
  const isPageActive = usePageActivity()
  const liveRefreshInterval = isPageActive && liveRefreshEnabled ? EVENT_LIVE_REFRESH_INTERVAL_MS : 0
  // ── Data fetching ──────────────────────────────────────────────────────────
  const {
    data: rawAnalytics,
    isLoading: loadingA,
    isValidating: validatingA,
    error: errorA,
    mutate: retryAnalytics,
  } = useSWR<unknown>(eventId ? eventAnalyticsPath(eventId) : null, fetcher, {
    ...liveEventSwrOptions,
    refreshInterval: liveRefreshInterval,
  })
  const analytics = useMemo(() => normalizeEventAnalyticsPayload(rawAnalytics), [rawAnalytics])

  // ── Computed data (all hooks before early returns) ─────────────────────────

  const guestAnalytics = useMemo(() => providedGuests ? buildEventGuestAnalytics(providedGuests) : analytics?.guests, [analytics?.guests, providedGuests])
  const dietaryData = useMemo(() => {
    return (guestAnalytics && 'dietary' in guestAnalytics ? guestAnalytics.dietary : Object.entries(guestAnalytics?.dietaryCounts ?? {}).map(([name, value]) => ({ name, value })))
      .map(({ name, value }, i) => ({ name, value, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.value - a.value)
  }, [guestAnalytics])
  const rsvpTimeline = guestAnalytics && 'timeline' in guestAnalytics ? guestAnalytics.timeline.map(point => ({ date: new Date(`${point.date}T00:00:00`).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }), confirmados: point.confirmed, declinados: point.declined })) : guestAnalytics?.rsvpTimeline ?? []

  const tableData = useMemo(() => {
    return guestAnalytics && 'tables' in guestAnalytics ? guestAnalytics.tables : Object.entries(guestAnalytics?.tableCounts ?? {}).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [guestAnalytics])

  const rsvpMethodData = useMemo(() => {
    const entries = guestAnalytics && 'methods' in guestAnalytics ? guestAnalytics.methods : Object.entries(guestAnalytics?.methodCounts ?? {}).map(([name, value]) => ({ name, value }))
    return entries.map(({ name, value }, i) => ({ name: METHOD_LABELS[name] ?? name, value, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.value - a.value)
  }, [guestAnalytics])
  const topPlusOnes = guestAnalytics && 'top_companions' in guestAnalytics ? guestAnalytics.top_companions : guestAnalytics?.topPlusOnes ?? []

  // ── Derived scalars ────────────────────────────────────────────────────────

  const hasDietary = dietaryData.some(item => item.name !== 'Ninguna' && item.value > 0)
  const fatalAnalyticsError = Boolean(errorA && rawAnalytics === undefined)
  const hasBackgroundRefreshError = Boolean(errorA && !fatalAnalyticsError)
  const retrying = Boolean(validatingA)

  const retryData = () => {
    void retryAnalytics()
  }

  // ── Early returns ──────────────────────────────────────────────────────────

  if ((loadingA || providedGuestsLoading) && !errorA) return <Skeleton />

  if (fatalAnalyticsError) {
    return (
      <div className={cardCls + ' p-7 text-center'} role="alert" aria-live="polite">
        <ExclamationTriangleIcon className="mx-auto size-7 text-amber-400" />
        <p className="mt-4 font-medium text-zinc-200">No pudimos cargar las analíticas</p>
        <p className="mt-1 text-xs text-zinc-500">Tus datos permanecen intactos. Reintenta sin salir del evento.</p>
        <button
          type="button"
          onClick={retryData}
          disabled={retrying}
          aria-busy={retrying}
          className="mt-5 inline-flex min-h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
        >
          <ArrowPathIcon className={retrying ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'} />
          {retrying ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    )
  }

  const totalGuests = guestAnalytics && 'total_guests' in guestAnalytics ? guestAnalytics.total_guests : providedGuests?.length ?? 0
  const confirmedPrimary = guestAnalytics?.confirmed ?? 0
  const confirmed = guestAnalytics?.confirmed ?? 0
  const declined = guestAnalytics?.declined ?? 0
  const responded = confirmed + declined
  const pendingRsvp = guestAnalytics?.pending ?? 0
  const responseRate = totalGuests > 0 ? Math.round((responded / totalGuests) * 100) : 0
  const views = analytics?.views ?? 0
  const momentUploads = analytics?.moment_uploads ?? 0

  // Party size fields from RSVP are total people, so companions are partySize - 1.
  const totalPlusOnes = guestAnalytics && 'total_companions' in guestAnalytics ? guestAnalytics.total_companions : guestAnalytics?.totalPlusOnes ?? 0
  const estimatedAttendees = guestAnalytics && 'estimated_attendees' in guestAnalytics ? guestAnalytics.estimated_attendees : guestAnalytics?.estimatedAttendees ?? 0

  // Moments breakdown
  const currentMoments = analytics?.moment_total ?? 0
  const approvedMoments = analytics?.moment_approved ?? 0
  const pendingMoments = analytics?.moment_pending ?? 0
  const momentComments = analytics?.moment_comments ?? 0
  const hasMomentEngagement = momentUploads > 0 || currentMoments > 0
  const approvalRate = currentMoments > 0 ? Math.round((approvedMoments / currentMoments) * 100) : 0

  // Capacity — guard against zero to prevent NaN in percentage calculations
  const capacityTotal = Math.max(nonNegativeInt(eventCapacity), totalGuests, estimatedAttendees, 1)

  // Funnel
  const funnelData = [
    { name: 'Invitados', value: totalGuests },
    { name: 'Respondieron', value: responded },
    { name: 'Confirmados', value: confirmed },
    { name: 'Declinaron', value: declined },
  ]

  // Roles
  const roleEntries = guestAnalytics && 'roles' in guestAnalytics ? guestAnalytics.roles : Object.entries(guestAnalytics?.roleCounts ?? {}).map(([name, value]) => ({ name, value }))
  const roleData = roleEntries.map(({ name, value }) => ({ name: name || 'sin rol', value, color: ROLE_COLORS[name] ?? '#71717a' }))
    .sort((a, b) => b.value - a.value)
  const performance = analytics?.performance ?? []

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {hasBackgroundRefreshError && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs leading-5 text-amber-200/80">
              Mostrando la última información disponible; no pudimos completar la actualización.
            </p>
          </div>
          <button
            type="button"
            onClick={retryData}
            disabled={retrying}
            aria-busy={retrying}
            className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/10 disabled:opacity-60"
          >
            <ArrowPathIcon className={retrying ? 'size-3.5 animate-spin motion-reduce:animate-none' : 'size-3.5'} />
            {retrying ? 'Actualizando…' : 'Reintentar'}
          </button>
        </div>
      )}
      {/* ── KPI Row 1 ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Vistas" value={views} sub="veces que se cargó la página" />
        <KPICard label="Confirmados" value={confirmed} sub={`de ${totalGuests} invitados`} accent="text-lime-400" />
        <KPICard label="Declinaron" value={declined} sub="no asistirán" accent="text-pink-400" />
        <KPICard label="Tasa respuesta" value={`${responseRate}%`} sub={`${responded} respondieron`} />
      </div>

      {performance.length > 0 && (
        <section className={cardCls} aria-labelledby="performance-heading">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 id="performance-heading" className="text-sm font-medium text-zinc-300">Experiencia real</h3>
              <p className="mt-1 text-xs text-zinc-500">Percentiles de los últimos 7 días medidos en dispositivos de invitados.</p>
            </div>
            <p className="text-[11px] text-zinc-600">p75 determina el estado · p95 muestra la cola lenta</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {performance.map((metric) => (
              <article key={`${metric.route}:${metric.metric}`} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-200">{PERFORMANCE_LABELS[metric.metric] ?? metric.metric}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600">{PERFORMANCE_ROUTE_LABELS[metric.route] ?? metric.route}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${performanceRatingClasses(metric.rating)}`}>
                    {performanceRatingLabel(metric.rating)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] tracking-wide text-zinc-600 uppercase">p75</p>
                    <p className="mt-0.5 text-xl font-semibold text-white">{formatPerformanceValue(metric.metric, metric.p75)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] tracking-wide text-zinc-600 uppercase">p95</p>
                    <p className="mt-0.5 text-xl font-semibold text-zinc-300">{formatPerformanceValue(metric.metric, metric.p95)}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-zinc-600">{metric.sample_count.toLocaleString('es-MX')} muestras · promedio {formatPerformanceValue(metric.metric, metric.average)}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── KPI Row 2 ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Acompañantes" value={totalPlusOnes} sub="invitados extra (+1s)" />
        <KPICard
          label="Asistentes est."
          value={estimatedAttendees}
          sub="confirmados + acompañantes"
          accent="text-indigo-400"
        />
        <KPICard label="Momentos" value={momentUploads} sub={`${approvedMoments} aprobados`} />
        <KPICard
          label="Pendientes RSVP"
          value={pendingRsvp}
          sub="sin responder"
          accent={pendingRsvp > 0 ? 'text-amber-400' : 'text-zinc-400'}
        />
      </div>

      {/* ── Capacity Bar ───────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <SectionTitle>Capacidad del evento</SectionTitle>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{estimatedAttendees} asistentes estimados</span>
            <span>{capacityTotal} capacidad</span>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-zinc-800">
            {confirmedPrimary > 0 && (
              <div
                className="h-full bg-lime-500 transition-all duration-500"
                style={{ width: `${Math.min((confirmedPrimary / capacityTotal) * 100, 100)}%` }}
                title={`${confirmedPrimary} confirmados`}
              />
            )}
            {totalPlusOnes > 0 && (
              <div
                className="h-full bg-lime-500/50 transition-all duration-500"
                style={{
                  width: `${Math.min((totalPlusOnes / capacityTotal) * 100, 100 - (confirmedPrimary / capacityTotal) * 100)}%`,
                }}
                title={`${totalPlusOnes} acompañantes`}
              />
            )}
            {pendingRsvp > 0 && (
              <div
                className="h-full bg-amber-500/40 transition-all duration-500"
                style={{
                  width: `${Math.min((pendingRsvp / capacityTotal) * 100, 100 - ((confirmedPrimary + totalPlusOnes) / capacityTotal) * 100)}%`,
                }}
                title={`${pendingRsvp} pendientes`}
              />
            )}
            {declined > 0 && (
              <div
                className="h-full bg-pink-500/40 transition-all duration-500"
                style={{
                  width: `${Math.min((declined / capacityTotal) * 100, 100 - ((confirmedPrimary + totalPlusOnes + pendingRsvp) / capacityTotal) * 100)}%`,
                }}
                title={`${declined} declinados`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-lime-500" />
              Confirmados
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-lime-500/50" />
              Acompañantes
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-amber-500/40" />
              Pendientes
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-pink-500/40" />
              Declinados
            </span>
          </div>
        </div>
      </div>

      {/* ── RSVP Funnel ────────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <SectionTitle>Embudo RSVP</SectionTitle>
        <p className="mb-3 text-xs text-zinc-600">Muestra cuántos invitados avanzan en cada etapa del proceso.</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={funnelData} layout="vertical" margin={{ left: 0, right: 16 }}>
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#a1a1aa', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={65}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#27272a' }} />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} name="Personas" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── RSVP Timeline ──────────────────────────────────────────────────── */}
      {rsvpTimeline.length > 1 && (
        <div className={cardCls}>
          <SectionTitle>Respuestas en el tiempo</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={rsvpTimeline} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gradConfirmed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#84cc16" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#84cc16" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDeclined" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="confirmados"
                stroke="#84cc16"
                fill="url(#gradConfirmed)"
                strokeWidth={2}
                name="Confirmados"
              />
              <Area
                type="monotone"
                dataKey="declinados"
                stroke="#ec4899"
                fill="url(#gradDeclined)"
                strokeWidth={2}
                name="Declinados"
              />
              <Legend formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 12 }}>{value}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Two-column: Role + RSVP Method ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {roleData.length > 0 && (
          <div className={cardCls}>
            <SectionTitle>Composición por rol</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={roleData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {roleData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {rsvpMethodData.length > 0 && (
          <div className={cardCls}>
            <SectionTitle>Canal de respuesta RSVP</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={rsvpMethodData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {rsvpMethodData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Table Distribution ─────────────────────────────────────────────── */}
      {tableData.length > 0 && (
        <div className={cardCls}>
          <SectionTitle>Distribución por mesa</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(120, tableData.length * 32)}>
            <BarChart data={tableData} layout="vertical" margin={{ left: 0, right: 16 }}>
              <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#27272a' }} />
              <Bar dataKey="value" fill="#a78bfa" radius={[0, 4, 4, 0]} name="Invitados" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Dietary Restrictions ────────────────────────────────────────────── */}
      {hasDietary && (
        <div className={cardCls}>
          <SectionTitle>Restricciones alimentarias</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={dietaryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {dietaryData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Moments Engagement ─────────────────────────────────────────────── */}
      {hasMomentEngagement && (
        <div className={cardCls}>
          <SectionTitle>Engagement de momentos</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-white">{momentUploads}</p>
              <p className="mt-0.5 text-xs text-zinc-500">Total subidos</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-lime-400">{approvedMoments}</p>
              <p className="mt-0.5 text-xs text-zinc-500">Aprobados</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-400">{pendingMoments}</p>
              <p className="mt-0.5 text-xs text-zinc-500">Pendientes</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-indigo-400">{approvalRate}%</p>
              <p className="mt-0.5 text-xs text-zinc-500">Tasa aprobación</p>
            </div>
          </div>
          {momentComments > 0 && (
            <p className="mt-3 text-xs text-zinc-600">
              {momentComments} momento{momentComments !== 1 ? 's' : ''} con mensaje de invitado
            </p>
          )}
        </div>
      )}

      {/* ── Top +1s Leaderboard ────────────────────────────────────────────── */}
      {topPlusOnes.length > 0 && (
        <div className={cardCls}>
          <SectionTitle>Top invitados por acompañantes</SectionTitle>
          <div className="space-y-2">
            {topPlusOnes.map((g, i) => (
              <div key={g.id} className="flex items-center gap-3 rounded-lg bg-zinc-800/50 px-3 py-2">
                <span className="w-5 text-center text-xs font-bold text-zinc-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">
                    {g.first_name} {g.last_name}
                  </p>
                  {g.role && <p className="text-xs text-zinc-600">{g.role}</p>}
                </div>
                <span className="text-sm font-bold text-indigo-400">+{'companion_count' in g ? g.companion_count : Math.max((g.rsvp_guest_count || g.guests_count || 1) - 1, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
