'use client'

import { Badge } from '@/components/badge'
import { PageHeader } from '@/components/product/page-header'
import { Pagination } from '@/components/ui/pagination'
import { PageTransition } from '@/components/ui/page-transition'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { readApiData } from '@/lib/api-envelope'
import { auditLogsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import type { AuditLogPage } from '@/models/AuditLog'
import { ClipboardDocumentCheckIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import useSWR from 'swr'

const PAGE_SIZE = 30

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'America/Mexico_City',
  })
}

export default function AuditPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'all' | 'denied' | 'failed'>('all')
  const statusCode = status === 'denied' ? 403 : undefined
  const key = auditLogsPath({
    page,
    page_size: PAGE_SIZE,
    status: statusCode,
    succeeded: status === 'failed' ? false : undefined,
  })
  const { data: raw, error, isLoading, isValidating, mutate } = useSWR<AuditLogPage>(
    key,
    fetcher,
    responsiveListSwrOptions
  )
  const records = readApiData<AuditLogPage | undefined>(raw)
  const visibleRecords = records?.data ?? []
  const errorState = getDataErrorState(error, raw)

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Gobierno de plataforma"
        title="Auditoría"
        description="Cambios, accesos rechazados y recursos afectados sin exponer contenido sensible."
        icon={ClipboardDocumentCheckIcon}
        actions={
          <select
            aria-label="Filtrar auditoría"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status)
              setPage(1)
            }}
            className="min-h-10 rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-400 focus:outline-none"
          >
            <option value="all">Toda la actividad</option>
            <option value="denied">Accesos denegados</option>
            <option value="failed">Operaciones fallidas</option>
          </select>
        }
      />

      {errorState === 'stale' && (
        <div className="mt-6">
          <StaleDataNotice label="auditoría" onRetry={() => void mutate()} retrying={isValidating} />
        </div>
      )}

      {errorState === 'fatal' ? (
        <div className="premium-surface mt-8 flex min-h-72 flex-col items-center justify-center rounded-3xl px-6 text-center">
          <ExclamationTriangleIcon className="size-8 text-amber-300" />
          <p className="mt-4 text-sm font-medium text-zinc-200">No pudimos cargar la auditoría</p>
          <button className="mt-4 text-sm font-semibold text-indigo-300" onClick={() => void mutate()}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="premium-surface mt-8 overflow-hidden rounded-3xl">
          <div className="grid grid-cols-[minmax(8rem,0.8fr)_minmax(10rem,1.4fr)_minmax(7rem,0.7fr)] gap-4 border-b border-white/8 px-5 py-3 text-[10px] font-semibold tracking-wider text-zinc-600 uppercase md:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.4fr)_minmax(9rem,0.8fr)_minmax(7rem,0.6fr)]">
            <span>Momento</span>
            <span>Acción</span>
            <span className="hidden md:block">Recurso</span>
            <span>Resultado</span>
          </div>
          {isLoading ? (
            <div className="space-y-px p-2" aria-label="Cargando auditoría" role="status">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-xl bg-white/[0.025]" />
              ))}
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-500">No hay registros para este filtro.</div>
          ) : (
            <ul className="divide-y divide-white/6">
              {visibleRecords.map((entry) => (
                <li
                  key={entry.id}
                  className="grid grid-cols-[minmax(8rem,0.8fr)_minmax(10rem,1.4fr)_minmax(7rem,0.7fr)] items-center gap-4 px-5 py-4 text-sm md:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.4fr)_minmax(9rem,0.8fr)_minmax(7rem,0.6fr)]"
                >
                  <span className="text-xs text-zinc-500 tabular-nums">{formatDate(entry.occurred_at)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-200">
                      {entry.method} {entry.route}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-zinc-600">{entry.request_id}</span>
                  </span>
                  <span className="hidden min-w-0 md:block">
                    <span className="block truncate text-xs text-zinc-400">{entry.resource_type || 'plataforma'}</span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-zinc-700">
                      {entry.resource_id || '—'}
                    </span>
                  </span>
                  <span>
                    <Badge color={entry.succeeded ? 'lime' : entry.status === 403 ? 'amber' : 'red'}>
                      {entry.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {records && records.total > PAGE_SIZE && (
        <Pagination total={records.total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    </PageTransition>
  )
}
