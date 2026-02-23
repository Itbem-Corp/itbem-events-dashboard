'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts'
import type { EventAnalytics } from '@/models/EventAnalytics'
import type { Guest } from '@/models/Guest'
import type { Moment } from '@/models/Moment'
import { getEffectiveStatus } from '@/lib/guest-utils'

interface Props {
  eventId: string
  eventIdentifier: string
}

const ROLE_COLORS: Record<string, string> = {
  graduate: '#6366f1',
  guest:    '#a78bfa',
  vip:      '#f59e0b',
  speaker:  '#10b981',
  staff:    '#3b82f6',
  host:     '#ec4899',
  '':       '#71717a',
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-zinc-800" />
      ))}
      <div className="col-span-1 sm:col-span-2 h-48 rounded-xl bg-zinc-800" />
      <div className="col-span-1 sm:col-span-2 h-48 rounded-xl bg-zinc-800" />
    </div>
  )
}

function KPICard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className={cardCls + ' flex flex-col gap-1'}>
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl sm:text-3xl font-bold truncate ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium text-zinc-400 mb-4">{children}</h3>
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function EventAnalyticsPanel({ eventId }: Props) {
  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: analytics, isLoading: loadingA, error: errorA } = useSWR<EventAnalytics>(
    eventId ? `/events/${eventId}/analytics` : null,
    fetcher,
  )
  const { data: rawGuests, isLoading: loadingG, error: errorG } = useSWR(
    eventId ? `/guests/all:${eventId}` : null,
    fetcher,
  )
  const { data: rawMoments } = useSWR(
    eventId ? `/moments?event_id=${eventId}` : null,
    fetcher,
  )

  const parsed = Array.isArray(rawGuests) ? rawGuests : rawGuests?.data
  const guests: Guest[] = Array.isArray(parsed) ? parsed : []

  const parsedMoments = Array.isArray(rawMoments) ? rawMoments : rawMoments?.data
  const moments: Moment[] = Array.isArray(parsedMoments) ? parsedMoments : []

  // ── Computed data (all hooks before early returns) ─────────────────────────

  const dietaryData = useMemo(() => {
    if (!guests.length) return []
    const counts: Record<string, number> = {}
    for (const g of guests) {
      const key = g.dietary_restrictions?.trim() || 'Ninguna'
      counts[key] = (counts[key] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value], i) => ({ name, value, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.value - a.value)
  }, [guests])

  const rsvpTimeline = useMemo(() => {
    const dated = guests
      .filter(g => g.rsvp_at && getEffectiveStatus(g) !== 'PENDING')
      .sort((a, b) => new Date(a.rsvp_at!).getTime() - new Date(b.rsvp_at!).getTime())
    if (!dated.length) return []

    const byDay: Record<string, { confirmed: number; declined: number }> = {}
    for (const g of dated) {
      const day = new Date(g.rsvp_at!).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
      if (!byDay[day]) byDay[day] = { confirmed: 0, declined: 0 }
      if (getEffectiveStatus(g) === 'CONFIRMED') byDay[day].confirmed++
      else if (getEffectiveStatus(g) === 'DECLINED') byDay[day].declined++
    }

    let cumConfirmed = 0
    let cumDeclined = 0
    return Object.entries(byDay).map(([date, v]) => {
      cumConfirmed += v.confirmed
      cumDeclined += v.declined
      return { date, confirmados: cumConfirmed, declinados: cumDeclined }
    })
  }, [guests])

  const tableData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const g of guests) {
      const table = g.table_number?.trim()
      if (table) counts[table] = (counts[table] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name: `Mesa ${name}`, value }))
      .sort((a, b) => b.value - a.value)
  }, [guests])

  const rsvpMethodData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const g of guests) {
      if (getEffectiveStatus(g) === 'PENDING') continue
      const method = g.rsvp_method || ''
      counts[method] = (counts[method] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value], i) => ({ name: METHOD_LABELS[name] ?? name, value, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.value - a.value)
  }, [guests])

  const topPlusOnes = useMemo(() => {
    return guests
      .filter(g => (g.guests_count ?? 0) > 0 && getEffectiveStatus(g) === 'CONFIRMED')
      .sort((a, b) => b.guests_count - a.guests_count)
      .slice(0, 5)
  }, [guests])

  // ── Derived scalars ────────────────────────────────────────────────────────

  const hasDietary = guests.some(g => g.dietary_restrictions?.trim())

  // ── Early returns ──────────────────────────────────────────────────────────

  if ((loadingA || loadingG) && !errorA && !errorG) return <Skeleton />

  if (errorA || errorG) {
    return (
      <div className={cardCls + ' p-6 text-center'}>
        <p className="text-zinc-400">No se pudieron cargar las analíticas.</p>
        <p className="text-xs text-zinc-600 mt-1">Intenta recargar la página.</p>
      </div>
    )
  }

  const totalGuests     = guests.length
  const confirmedGuests = guests.filter(g => getEffectiveStatus(g) === 'CONFIRMED')
  const responded       = guests.filter(g => getEffectiveStatus(g) !== 'PENDING').length
  const confirmed       = analytics?.rsvp_confirmed ?? confirmedGuests.length
  const declined        = analytics?.rsvp_declined  ?? guests.filter(g => getEffectiveStatus(g) === 'DECLINED').length
  const pendingRsvp     = totalGuests - responded
  const responseRate    = totalGuests > 0 ? Math.round((responded / totalGuests) * 100) : 0
  const views           = analytics?.views ?? 0
  const momentUploads   = analytics?.moment_uploads ?? moments.length

  // +1s
  const totalPlusOnes      = confirmedGuests.reduce((sum, g) => sum + (g.guests_count ?? 0), 0)
  const estimatedAttendees = confirmed + totalPlusOnes

  // Moments breakdown
  const approvedMoments = moments.filter(m => m.is_approved).length
  const pendingMoments  = moments.filter(m => !m.is_approved && m.processing_status !== 'failed').length
  const momentsWithMsg   = moments.filter(m => m.description?.trim()).length
  const approvalRate     = moments.length > 0 ? Math.round((approvedMoments / moments.length) * 100) : 0

  // Capacity — guard against zero to prevent NaN in percentage calculations
  const capacityTotal = Math.max(estimatedAttendees, 1)

  // Funnel
  const funnelData = [
    { name: 'Invitados',    value: totalGuests },
    { name: 'Respondieron', value: responded },
    { name: 'Confirmados',  value: confirmed },
    { name: 'Declinaron',   value: declined },
  ]

  // Roles
  const roleCounts: Record<string, number> = {}
  for (const g of guests) {
    const role = g.role || ''
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
  }
  const roleData = Object.entries(roleCounts)
    .map(([name, value]) => ({ name: name || 'sin rol', value, color: ROLE_COLORS[name] ?? '#71717a' }))
    .sort((a, b) => b.value - a.value)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── KPI Row 1 ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Vistas"         value={views}              sub="veces que se cargó la página" />
        <KPICard label="Confirmados"    value={confirmed}          sub={`de ${totalGuests} invitados`} accent="text-lime-400" />
        <KPICard label="Declinaron"     value={declined}           sub="no asistirán" accent="text-pink-400" />
        <KPICard label="Tasa respuesta" value={`${responseRate}%`} sub={`${responded} respondieron`} />
      </div>

      {/* ── KPI Row 2 ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Acompañantes"       value={totalPlusOnes}        sub="invitados extra (+1s)" />
        <KPICard label="Asistentes est."     value={estimatedAttendees}   sub="confirmados + acompañantes" accent="text-indigo-400" />
        <KPICard label="Momentos"            value={momentUploads}        sub={`${approvedMoments} aprobados`} />
        <KPICard label="Pendientes RSVP"     value={pendingRsvp}          sub="sin responder" accent={pendingRsvp > 0 ? 'text-amber-400' : 'text-zinc-400'} />
      </div>

      {/* ── Capacity Bar ───────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <SectionTitle>Capacidad del evento</SectionTitle>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{estimatedAttendees} asistentes estimados</span>
            <span>{capacityTotal} capacidad</span>
          </div>
          <div className="h-4 rounded-full bg-zinc-800 overflow-hidden flex">
            {confirmed > 0 && (
              <div
                className="h-full bg-lime-500 transition-all duration-500"
                style={{ width: `${Math.min((confirmed / capacityTotal) * 100, 100)}%` }}
                title={`${confirmed} confirmados`}
              />
            )}
            {totalPlusOnes > 0 && (
              <div
                className="h-full bg-lime-500/50 transition-all duration-500"
                style={{ width: `${Math.min((totalPlusOnes / capacityTotal) * 100, 100 - (confirmed / capacityTotal) * 100)}%` }}
                title={`${totalPlusOnes} acompañantes`}
              />
            )}
            {pendingRsvp > 0 && (
              <div
                className="h-full bg-amber-500/40 transition-all duration-500"
                style={{ width: `${Math.min((pendingRsvp / capacityTotal) * 100, 100 - ((confirmed + totalPlusOnes) / capacityTotal) * 100)}%` }}
                title={`${pendingRsvp} pendientes`}
              />
            )}
            {declined > 0 && (
              <div
                className="h-full bg-pink-500/40 transition-all duration-500"
                style={{ width: `${Math.min((declined / capacityTotal) * 100, 100 - ((confirmed + totalPlusOnes + pendingRsvp) / capacityTotal) * 100)}%` }}
                title={`${declined} declinados`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
            <span><span className="inline-block size-2 rounded-full bg-lime-500 mr-1" />Confirmados</span>
            <span><span className="inline-block size-2 rounded-full bg-lime-500/50 mr-1" />Acompañantes</span>
            <span><span className="inline-block size-2 rounded-full bg-amber-500/40 mr-1" />Pendientes</span>
            <span><span className="inline-block size-2 rounded-full bg-pink-500/40 mr-1" />Declinados</span>
          </div>
        </div>
      </div>

      {/* ── RSVP Funnel ────────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <SectionTitle>Embudo RSVP</SectionTitle>
        <p className="text-xs text-zinc-600 mb-3">Muestra cuántos invitados avanzan en cada etapa del proceso.</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={funnelData} layout="vertical" margin={{ left: 0, right: 16 }}>
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
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
              <Area type="monotone" dataKey="confirmados" stroke="#84cc16" fill="url(#gradConfirmed)" strokeWidth={2} name="Confirmados" />
              <Area type="monotone" dataKey="declinados" stroke="#ec4899" fill="url(#gradDeclined)" strokeWidth={2} name="Declinados" />
              <Legend formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 12 }}>{value}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Two-column: Role + RSVP Method ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {roleData.length > 0 && (
          <div className={cardCls}>
            <SectionTitle>Composición por rol</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={roleData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {roleData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
                <Pie data={rsvpMethodData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {rsvpMethodData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
              <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
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
              <Pie data={dietaryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {dietaryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Moments Engagement ─────────────────────────────────────────────── */}
      {moments.length > 0 && (
        <div className={cardCls}>
          <SectionTitle>Engagement de momentos</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-white">{moments.length}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Total subidos</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-lime-400">{approvedMoments}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Aprobados</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-400">{pendingMoments}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Pendientes</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3 text-center">
              <p className="text-2xl font-bold text-indigo-400">{approvalRate}%</p>
              <p className="text-xs text-zinc-500 mt-0.5">Tasa aprobación</p>
            </div>
          </div>
          {momentsWithMsg > 0 && (
            <p className="text-xs text-zinc-600 mt-3">
              {momentsWithMsg} momento{momentsWithMsg !== 1 ? 's' : ''} con mensaje de invitado
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
                <span className="text-xs font-bold text-zinc-500 w-5 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{g.first_name} {g.last_name}</p>
                  {g.role && <p className="text-xs text-zinc-600">{g.role}</p>}
                </div>
                <span className="text-sm font-bold text-indigo-400">+{g.guests_count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
