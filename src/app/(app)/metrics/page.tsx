'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/product/page-header'
import { PageTransition } from '@/components/ui/page-transition'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { readApiData } from '@/lib/api-envelope'
import { metricsPortfolioPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { sessionCan } from '@/lib/session-capabilities'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { ProductMetricSummary, ProductMetricsPortfolio } from '@/models/ProductMetrics'
import { useStore } from '@/store/useStore'
import {
  ArrowPathIcon,
  BoltIcon,
  BuildingOffice2Icon,
  ChartBarSquareIcon,
  CheckCircleIcon,
  CircleStackIcon,
  CursorArrowRaysIcon,
  ExclamationTriangleIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import useSWR from 'swr'

const PRODUCT_NAMES: Record<string, string> = {
  eventiapp: 'EventiApp',
  itbem: 'ITBEM',
  cafettonhouse: 'Cafetton House',
}

function compact(value: number) {
  return new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

function aggregate(rows: ProductMetricSummary[]) {
  return rows.reduce(
    (total, row) => ({
      requests: total.requests + row.requests,
      mutations: total.mutations + row.mutations,
      errors: total.errors + row.errors,
      duration_ms: total.duration_ms + row.duration_ms,
      request_bytes: total.request_bytes + row.request_bytes,
      active_users: total.active_users + row.active_users,
    }),
    { requests: 0, mutations: 0, errors: 0, duration_ms: 0, request_bytes: 0, active_users: 0 }
  )
}

function productRows(rows: ProductMetricSummary[]): ProductMetricSummary[] {
  const grouped = new Map<string, ProductMetricSummary>()
  for (const row of rows) {
    const current = grouped.get(row.tenant_code) ?? {
      tenant_code: row.tenant_code,
      client_id: row.tenant_code,
      client_name: 'Todas las organizaciones',
      requests: 0,
      mutations: 0,
      errors: 0,
      duration_ms: 0,
      request_bytes: 0,
      active_users: 0,
    }
    current.requests += row.requests
    current.mutations += row.mutations
    current.errors += row.errors
    current.duration_ms += row.duration_ms
    current.request_bytes += row.request_bytes
    current.active_users += row.active_users
    grouped.set(row.tenant_code, current)
  }
  return [...grouped.values()].sort((left, right) => right.requests - left.requests)
}

function ProductCard({ row, index }: { row: ProductMetricSummary; index: number }) {
  const reducedMotion = useReducedMotion()
  const successRate = row.requests ? ((row.requests - row.errors) / row.requests) * 100 : 100
  const latency = row.requests ? Math.round(row.duration_ms / row.requests) : 0

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.4, delay: index * 0.05 }}
      className="premium-surface relative overflow-hidden rounded-3xl p-5"
    >
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-(--tenant-accent) to-transparent opacity-55" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-zinc-600 uppercase">Producto</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{PRODUCT_NAMES[row.tenant_code] ?? row.tenant_code}</h2>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{row.client_name || 'Tráfico general del producto'}</p>
        </div>
        <Badge color={successRate >= 99 ? 'lime' : successRate >= 97 ? 'amber' : 'red'}>
          {successRate.toFixed(1)}% sano
        </Badge>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-4">
        <div>
          <p className="text-2xl font-semibold text-white tabular-nums">{compact(row.requests)}</p>
          <p className="mt-1 text-xs text-zinc-600">solicitudes</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-white tabular-nums">{compact(row.mutations)}</p>
          <p className="mt-1 text-xs text-zinc-600">acciones de valor</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs text-zinc-500">
        <span>{latency} ms promedio</span>
        <span>{row.active_users} activos</span>
      </div>
    </motion.article>
  )
}

export default function MetricsPage() {
  const [days, setDays] = useState(30)
  const session = useStore((state) => state.applicationSession)
  const user = useStore((state) => state.user)
  const currentClient = useStore((state) => state.currentClient)
  const canView = sessionCan(session, 'metrics:view')
  const isRoot = Boolean(user?.is_root)
  const isPrimaryRoot = isRoot && (user?.root_level === 1 || !user?.root_level)
  const clientId = isPrimaryRoot || (isRoot && !currentClient) ? undefined : currentClient?.id
  const key = canView && (isRoot || clientId) ? metricsPortfolioPath(clientId, days) : null
  const { data: raw, error, isLoading, isValidating, mutate } = useSWR<ProductMetricsPortfolio>(
    key,
    fetcher,
    responsiveListSwrOptions
  )
  const portfolio = useMemo(() => readApiData<ProductMetricsPortfolio | undefined>(raw), [raw])
  const errorState = getDataErrorState(error, raw)
  const totals = useMemo(() => aggregate(portfolio?.summaries ?? []), [portfolio?.summaries])
  const products = useMemo(() => productRows(portfolio?.summaries ?? []), [portfolio?.summaries])
  const activity = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const point of portfolio?.timeline ?? []) {
      byDay.set(point.day, (byDay.get(point.day) ?? 0) + point.requests)
    }
    return [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [portfolio?.timeline])
  const maxDailyRequests = Math.max(1, ...activity.map(([, requests]) => requests))
  const successRate = totals.requests ? ((totals.requests - totals.errors) / totals.requests) * 100 : 100
  const averageLatency = totals.requests ? Math.round(totals.duration_ms / totals.requests) : 0

  if (!canView) {
    return (
      <PageTransition>
        <div className="premium-surface flex min-h-80 flex-col items-center justify-center rounded-3xl px-6 text-center">
          <ChartBarSquareIcon className="size-9 text-zinc-700" />
          <h1 className="mt-4 text-lg font-semibold text-white">Métricas no disponibles</h1>
          <p className="mt-1 text-sm text-zinc-500">Tu rol no incluye acceso a analítica operativa.</p>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Inteligencia operativa"
        title="Métricas de producto"
        description="Adopción, actividad y salud técnica por producto y organización, en una sola lectura."
        icon={ChartBarSquareIcon}
        actions={
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((value) => (
              days === value ? (
                <Button key={value} color="indigo" onClick={() => setDays(value)}>
                  {value}d
                </Button>
              ) : (
                <Button key={value} outline onClick={() => setDays(value)}>
                  {value}d
                </Button>
              )
            ))}
          </div>
        }
      />

      {errorState === 'stale' && (
        <div className="mt-6">
          <StaleDataNotice label="métricas" onRetry={() => void mutate()} retrying={isValidating} />
        </div>
      )}

      {errorState === 'fatal' ? (
        <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-red-500/15 bg-red-500/[0.035] px-6 text-center">
          <ExclamationTriangleIcon className="size-8 text-red-400" />
          <p className="mt-4 text-sm font-medium text-white">No pudimos leer las métricas</p>
          <p className="mt-1 text-sm text-zinc-500">La operación continúa normalmente. Puedes reintentar sin riesgo.</p>
          <Button className="mt-5" outline onClick={() => void mutate()}>
            <ArrowPathIcon />
            Reintentar
          </Button>
        </div>
      ) : isLoading || !portfolio ? (
        <div className="mt-8 grid animate-pulse gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 rounded-3xl bg-zinc-900" />
          ))}
        </div>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Solicitudes', value: compact(totals.requests), detail: `${days} días`, icon: CursorArrowRaysIcon },
              { label: 'Acciones de valor', value: compact(totals.mutations), detail: 'cambios completados', icon: BoltIcon },
              { label: 'Disponibilidad lógica', value: `${successRate.toFixed(2)}%`, detail: `${totals.errors} errores`, icon: CheckCircleIcon },
              { label: 'Latencia media', value: `${averageLatency} ms`, detail: formatBytes(totals.request_bytes), icon: CircleStackIcon },
            ].map(({ label, value, detail, icon: Icon }) => (
              <article key={label} className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-zinc-500">{label}</p>
                  <Icon className="size-4 text-zinc-600" />
                </div>
                <p className="mt-5 text-3xl font-semibold tracking-tight text-white tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-zinc-600">{detail}</p>
              </article>
            ))}
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-3">
            {products.length ? (
              products.map((row, index) => (
                <ProductCard key={`${row.tenant_code}:${row.client_id}`} row={row} index={index} />
              ))
            ) : (
              <div className="premium-surface col-span-full rounded-3xl px-6 py-14 text-center">
                <ChartBarSquareIcon className="mx-auto size-8 text-zinc-700" />
                <p className="mt-4 text-sm font-medium text-zinc-300">La medición está activa</p>
                <p className="mt-1 text-sm text-zinc-600">Los primeros datos aparecerán conforme se use cada producto.</p>
              </div>
            )}
          </section>

          {activity.length > 0 && (
            <section className="premium-surface mt-4 rounded-3xl p-5 sm:p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-zinc-600 uppercase">Actividad</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Ritmo diario de uso</h2>
                </div>
                <p className="text-xs text-zinc-600">Solicitudes completadas por día</p>
              </div>
              <div className="mt-7 flex h-36 items-end gap-1.5" aria-label="Actividad diaria">
                {activity.map(([day, requests]) => (
                  <div
                    key={day}
                    title={`${new Date(day).toLocaleDateString('es-MX')}: ${requests.toLocaleString('es-MX')}`}
                    className="group relative flex h-full min-w-0 flex-1 items-end"
                  >
                    <div
                      className="w-full rounded-t-md bg-(--tenant-accent)/45 transition-colors group-hover:bg-(--tenant-accent)"
                      style={{ height: `${Math.max(4, (requests / maxDailyRequests) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-zinc-700">
                <span>{new Date(activity[0][0]).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                <span>{new Date(activity.at(-1)![0]).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
              </div>
            </section>
          )}

          {portfolio.summaries.some((row) => row.client_name) && (
            <section className="mt-4 overflow-hidden rounded-3xl border border-white/[0.07]">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <p className="text-xs font-semibold tracking-[0.14em] text-zinc-600 uppercase">Organizaciones</p>
                <h2 className="mt-1 text-base font-semibold text-white">Mayor actividad del periodo</h2>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {portfolio.summaries
                  .filter((row) => row.client_name)
                  .slice(0, 8)
                  .map((row) => (
                    <div key={`${row.tenant_code}:${row.client_id}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-5 px-5 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-200">{row.client_name}</p>
                        <p className="mt-0.5 text-xs text-zinc-600">{PRODUCT_NAMES[row.tenant_code] ?? row.tenant_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white tabular-nums">{compact(row.mutations)}</p>
                        <p className="text-[10px] text-zinc-600">acciones</p>
                      </div>
                      <div className="w-16 text-right">
                        <p className="text-sm font-semibold text-zinc-300 tabular-nums">{row.active_users}</p>
                        <p className="text-[10px] text-zinc-600">activos</p>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          <section className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              { label: 'Organizaciones', value: portfolio.inventory.organizations, icon: BuildingOffice2Icon },
              { label: 'Usuarios vinculados', value: portfolio.inventory.users, icon: UsersIcon },
              { label: 'Eventos operados', value: portfolio.inventory.events, icon: ChartBarSquareIcon },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-4 rounded-2xl border border-white/[0.06] px-5 py-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-500">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-semibold text-white tabular-nums">{value.toLocaleString('es-MX')}</p>
                  <p className="text-xs text-zinc-600">{label}</p>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </PageTransition>
  )
}
