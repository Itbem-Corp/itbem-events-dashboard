'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { EventAnalytics } from '@/models/EventAnalytics'
import type { Guest } from '@/models/Guest'

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

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 rounded-xl bg-zinc-800" />
      ))}
      <div className="col-span-2 h-48 rounded-xl bg-zinc-800" />
      <div className="col-span-2 h-48 rounded-xl bg-zinc-800" />
    </div>
  )
}

function KPICard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col gap-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

export function EventAnalyticsPanel({ eventId, eventIdentifier }: Props) {
  const { data: analytics, isLoading: loadingA } = useSWR<EventAnalytics>(
    `/events/${eventId}/analytics`,
    fetcher,
  )
  const { data: guests = [], isLoading: loadingG } = useSWR<Guest[]>(
    `/guests/${eventIdentifier}`,
    fetcher,
  )

  if (loadingA || loadingG) return <Skeleton />

  const totalGuests   = guests.length
  const responded     = guests.filter(g => g.rsvp_status && g.rsvp_status !== 'pending').length
  const confirmed     = analytics?.rsvp_confirmed ?? guests.filter(g => g.rsvp_status === 'confirmed').length
  const declined      = analytics?.rsvp_declined  ?? guests.filter(g => g.rsvp_status === 'declined').length
  const responseRate  = totalGuests > 0 ? Math.round((responded / totalGuests) * 100) : 0
  const views         = analytics?.views ?? 0
  const momentUploads = analytics?.moment_uploads ?? 0

  const funnelData = [
    { name: 'Invitados', value: totalGuests },
    { name: 'Respondieron', value: responded },
    { name: 'Confirmados', value: confirmed },
    { name: 'Declinaron', value: declined },
  ]

  const roleCounts: Record<string, number> = {}
  for (const g of guests) {
    const role = g.role || ''
    roleCounts[role] = (roleCounts[role] ?? 0) + 1
  }
  const roleData = Object.entries(roleCounts)
    .map(([name, value]) => ({ name: name || 'sin rol', value, color: ROLE_COLORS[name] ?? '#71717a' }))
    .sort((a, b) => b.value - a.value)

  const tooltipStyle = {
    backgroundColor: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    color: '#f4f4f5',
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Vistas"         value={views}                sub="páginas cargadas" />
        <KPICard label="Confirmados"    value={confirmed}            sub={`de ${totalGuests} invitados`} />
        <KPICard label="Declinaron"     value={declined}             sub="no asistirán" />
        <KPICard label="Tasa respuesta" value={`${responseRate}%`}   sub={`${responded} respondieron`} />
      </div>

      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Embudo RSVP</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={funnelData} layout="vertical" margin={{ left: 16, right: 24 }}>
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#27272a' }} />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} name="Personas" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {roleData.length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">Composición por rol</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={roleData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {roleData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 12 }}>{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {momentUploads > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-4">
          <span className="text-4xl">📸</span>
          <div>
            <p className="text-2xl font-bold text-white">{momentUploads}</p>
            <p className="text-sm text-zinc-500">momentos subidos por invitados</p>
          </div>
        </div>
      )}
    </div>
  )
}
