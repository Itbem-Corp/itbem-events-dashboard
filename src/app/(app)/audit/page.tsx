'use client'

import { Badge } from '@/components/badge'
import { PageHeader } from '@/components/product/page-header'
import { Pagination } from '@/components/ui/pagination'
import { PageTransition } from '@/components/ui/page-transition'
import { StaleDataNotice } from '@/components/ui/stale-data-notice'
import { useScopedFetcherKey } from '@/hooks/useScopedFetcherKey'
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
  const scopedKey = useScopedFetcherKey(key)
  const { data: raw, error, isLoading, isValidating, mutate } = useSWR<AuditLogPage>(
    scopedKey,
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
            className="min-h-10 rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink transition-colors hover:border-border-strong hover:bg-surface-raised focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/12 focus:outline-none"
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
          <p className="mt-4 text-sm font-medium text-ink">No pudimos cargar la auditoría</p>
          <button
            type="button"
            className="mt-4 text-sm font-semibold text-(--tenant-accent) transition-colors hover:text-ink"
            onClick={() => void mutate()}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="premium-surface mt-8 overflow-hidden rounded-3xl">
          <div className="hidden grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.4fr)_minmax(9rem,0.8fr)_minmax(7rem,0.6fr)] gap-4 border-b border-border-subtle px-5 py-3 text-xs font-semibold tracking-wider text-ink-muted uppercase md:grid">
            <span>Momento</span>
            <span>Acción</span>
            <span>Recurso</span>
            <span>Resultado</span>
          </div>
          {isLoading ? (
            <div className="space-y-px p-2" aria-label="Cargando auditoría" role="status">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-xl bg-surface-soft" />
              ))}
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-ink-muted">No hay registros para este filtro.</div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {visibleRecords.map((entry) => (
                <li key={entry.id} data-testid="audit-entry" className="px-4 py-4 text-sm sm:px-5">
                  {/* Below md: a stacked card so the route and ids stay fully readable. */}
                  <div className="space-y-2 md:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-ink-muted tabular-nums">{formatDate(entry.occurred_at)}</span>
                      <Badge color={entry.succeeded ? 'lime' : entry.status === 403 ? 'amber' : 'red'}>
                        {entry.status}
                      </Badge>
                    </div>
                    <p className="font-medium break-all text-ink">
                      {entry.method} {entry.route}
                    </p>
                    <details className="group">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-(--tenant-accent) focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none">
                        Ver detalle
                      </summary>
                      <dl className="mt-1 space-y-2 font-mono text-xs break-all text-ink-muted">
                        <div>
                          <dt className="font-sans font-semibold text-ink-secondary">Solicitud</dt>
                          <dd>{entry.request_id || '—'}</dd>
                        </div>
                        <div>
                          <dt className="font-sans font-semibold text-ink-secondary">Tipo de recurso</dt>
                          <dd>{entry.resource_type || 'plataforma'}</dd>
                        </div>
                        <div>
                          <dt className="font-sans font-semibold text-ink-secondary">ID de recurso</dt>
                          <dd>{entry.resource_id || '—'}</dd>
                        </div>
                      </dl>
                    </details>
                  </div>
                  {/* md and up: the grid row. */}
                  <div className="hidden grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.4fr)_minmax(9rem,0.8fr)_minmax(7rem,0.6fr)] items-center gap-4 md:grid">
                    <span className="text-xs text-ink-muted tabular-nums">{formatDate(entry.occurred_at)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink" title={`${entry.method} ${entry.route}`}>
                        {entry.method} {entry.route}
                      </span>
                      <span className="mt-1 block truncate text-xs text-ink-muted" title={entry.request_id}>
                        {entry.request_id}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-ink-secondary">{entry.resource_type || 'plataforma'}</span>
                      <span className="mt-1 block truncate font-mono text-xs text-ink-muted" title={entry.resource_id || undefined}>
                        {entry.resource_id || '—'}
                      </span>
                    </span>
                    <span>
                      <Badge color={entry.succeeded ? 'lime' : entry.status === 403 ? 'amber' : 'red'}>
                        {entry.status}
                      </Badge>
                    </span>
                  </div>
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
