'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { ArrowPathIcon, ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/20/solid'

export type ProviderUsageSnapshot = {
  project_id: string
  observed_at?: string
  accounts: Array<{
    provider: string
    status: 'available' | 'not_configured' | 'not_supported' | 'unavailable' | 'error'
    billing_model: 'token' | 'subscription_quota' | 'unknown' | 'management_api_not_supported'
    credential_scope: 'project' | 'missing' | 'separate_management_credential_required'
    observed_at?: string
    currency?: string
    balance?: {
      total: string
      granted: string
      topped_up: string
      is_available: boolean
    }
    windows?: Array<{
      name: string
      used: string
      limit: string
      remaining: string
      unit: string
      reset_at?: string
    }>
    error_code?: string
  }>
}

export type ProviderAccountUsagePanelProps = {
  projectId: string
  snapshot?: ProviderUsageSnapshot | null
  loading?: boolean
  refreshing?: boolean
  error?: boolean
  onRefresh: () => void
}

const statusPresentation: Record<ProviderUsageSnapshot['accounts'][number]['status'], { label: string; color: 'emerald' | 'zinc' | 'amber' | 'rose' }> = {
  available: { label: 'Disponible', color: 'emerald' },
  not_configured: { label: 'No configurado', color: 'zinc' },
  not_supported: { label: 'No compatible', color: 'zinc' },
  unavailable: { label: 'No disponible', color: 'amber' },
  error: { label: 'Error de consulta', color: 'rose' },
}

const billingModelLabel: Record<ProviderUsageSnapshot['accounts'][number]['billing_model'], string> = {
  token: 'Saldo de cuenta / uso por tokens',
  subscription_quota: 'Cuota de suscripción',
  unknown: 'Modelo de facturación no identificado',
  management_api_not_supported: 'Consulta de saldo pendiente de credencial de gestión',
}

function credentialScopeLabel(scope: ProviderUsageSnapshot['accounts'][number]['credential_scope']) {
  if (scope === 'project') return 'Credencial de este proyecto'
  if (scope === 'separate_management_credential_required') return 'Requiere credencial de gestión separada'
  return 'Sin credencial de proyecto'
}

function timestampLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function valueWithCurrency(value: string, currency?: string) {
  return currency ? `${value} ${currency}` : value
}

function valueWithUnit(value: string, unit: string) {
  return unit ? `${value} ${unit}` : value
}

export function ProviderAccountUsagePanel({
  projectId,
  snapshot,
  loading = false,
  refreshing = false,
  error = false,
  onRefresh,
}: ProviderAccountUsagePanelProps) {
  const scopedSnapshot = snapshot?.project_id === projectId ? snapshot : null
  const snapshotBelongsToAnotherProject = Boolean(snapshot && snapshot.project_id !== projectId)
  const observedAt = scopedSnapshot?.observed_at || undefined

  return (
    <section
      aria-labelledby="provider-account-usage-title"
      className="premium-surface mt-5 overflow-hidden rounded-[1.75rem]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
            <ShieldCheckIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Uso de cuenta por proyecto</p>
            <h2 id="provider-account-usage-title" className="mt-1 text-lg font-semibold text-ink">Saldo y cuotas de proveedores</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-secondary">
              Muestra la captura que reporta cada proveedor. Los valores y unidades se presentan sin conversiones ni estimaciones.
            </p>
          </div>
        </div>
        <Button
          outline
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing || !projectId.trim()}
          aria-label="Actualizar cuotas"
        >
          <ArrowPathIcon data-slot="icon" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
          Actualizar cuotas
        </Button>
      </header>

      <div className="p-5 sm:p-6">
        {loading && !scopedSnapshot ? (
          <p role="status" aria-live="polite" aria-busy="true" className="flex min-h-24 items-center gap-2 text-sm text-ink-secondary">
            <ArrowPathIcon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Consultando saldo y cuotas de las cuentas de este proyecto…
          </p>
        ) : snapshotBelongsToAnotherProject ? (
          <div role="alert" className="flex min-h-24 items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[.07] p-4 text-sm text-amber-900 dark:text-amber-200">
            <ExclamationTriangleIcon aria-hidden="true" className="size-5 shrink-0" />
            <p>La captura disponible pertenece a otro proyecto. No se muestra para evitar mezclar saldos o cuotas.</p>
          </div>
        ) : error && !scopedSnapshot ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/[.07] p-4 text-sm text-rose-800 dark:text-rose-200">
            <ExclamationTriangleIcon aria-hidden="true" className="size-5 shrink-0" />
            <p className="min-w-0 flex-1">No se pudo consultar el saldo o las cuotas del proyecto. Intenta actualizar de nuevo.</p>
          </div>
        ) : !scopedSnapshot ? (
          <p className="flex min-h-24 items-center text-sm text-ink-muted">
            Aún no hay una captura de saldo o cuotas para este proyecto.
          </p>
        ) : (
          <>
            {error && (
              <p role="status" className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/[.07] px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                No se pudo actualizar la captura; se conserva la última consulta correcta.
              </p>
            )}
            {refreshing && (
              <p role="status" aria-live="polite" className="mb-4 text-xs text-ink-muted">Actualizando cuotas…</p>
            )}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <p>{scopedSnapshot.accounts.length} {scopedSnapshot.accounts.length === 1 ? 'proveedor consultado' : 'proveedores consultados'}</p>
              {observedAt && <p>
                Captura:{' '}
                <time dateTime={observedAt}>{timestampLabel(observedAt ?? '')}</time>
              </p>}
            </div>
            {scopedSnapshot.accounts.length === 0 && !observedAt ? (
              <p className="flex min-h-24 items-center text-sm text-ink-muted">
                Aún no hay una captura de saldo o cuotas para este proyecto.
              </p>
            ) : scopedSnapshot.accounts.length === 0 ? (
              <p className="flex min-h-20 items-center rounded-2xl border border-dashed border-border-subtle px-4 text-sm text-ink-muted">
                No hay proveedores con una consulta de cuenta para este proyecto.
              </p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {scopedSnapshot.accounts.map((account, index) => {
                  const status = statusPresentation[account.status]
                  const accountObservedAt = account.observed_at ?? scopedSnapshot.observed_at
                  return (
                    <li key={`${account.provider}:${index}`}>
                      <article className="h-full rounded-2xl border border-border-subtle bg-surface-raised p-4">
                        <header className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-ink">{account.provider}</h3>
                            <p className="mt-1 text-xs text-ink-secondary">{billingModelLabel[account.billing_model]}</p>
                          </div>
                          <Badge color={status.color}>{status.label}</Badge>
                        </header>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <Badge color={account.credential_scope === 'project' ? 'indigo' : 'zinc'}>{credentialScopeLabel(account.credential_scope)}</Badge>
                          {accountObservedAt && (
                            <span className="inline-flex min-h-6 items-center text-ink-muted">
                              Consulta <time dateTime={accountObservedAt}>{timestampLabel(accountObservedAt)}</time>
                            </span>
                          )}
                        </div>

                        {account.balance?.is_available ? (
                          <dl className="mt-4 grid grid-cols-1 gap-2 rounded-xl bg-surface-soft/65 p-3 sm:grid-cols-3">
                            {[
                              ['Total', account.balance.total],
                              ['Otorgado', account.balance.granted],
                              ['Recargado', account.balance.topped_up],
                            ].map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <dt className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">{label}</dt>
                                <dd className="mt-1 break-words text-sm font-semibold text-ink tabular-nums">
                                  {valueWithCurrency(value, account.currency)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : account.balance ? (
                          <p className="mt-4 rounded-xl bg-surface-soft/65 px-3 py-2.5 text-xs text-ink-muted">
                            El proveedor no reportó saldo disponible.
                          </p>
                        ) : null}

                        {account.windows && account.windows.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-xs font-semibold text-ink">Ventanas de uso</h4>
                            <ul className="mt-2 space-y-2">
                              {account.windows.map((window, windowIndex) => (
                                <li key={`${window.name}:${windowIndex}`} className="rounded-xl border border-border-subtle px-3 py-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-ink">{window.name}</h5>
                                    {window.reset_at && (
                                      <p className="text-[11px] text-ink-muted">
                                        Reinicio: <time dateTime={window.reset_at}>{timestampLabel(window.reset_at)}</time>
                                      </p>
                                    )}
                                  </div>
                                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                                    {[
                                      ['Usado', window.used],
                                      ['Límite', window.limit],
                                      ['Restante', window.remaining],
                                    ].filter(([, value]) => value.trim() !== '').map(([label, value]) => (
                                      <div key={label} className="min-w-0">
                                        <dt className="text-ink-muted">{label}</dt>
                                        <dd className="mt-0.5 break-words font-semibold text-ink tabular-nums">
                                          {valueWithUnit(value, window.unit)}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {account.status === 'not_configured' && (
                          <p className="mt-4 rounded-xl border border-dashed border-border-subtle px-3 py-2.5 text-xs text-ink-muted">
                            Configura una credencial para este proyecto antes de consultar la cuenta.
                          </p>
                        )}
                        {account.status === 'not_supported' && (
                          <p className="mt-4 rounded-xl border border-dashed border-border-subtle px-3 py-2.5 text-xs text-ink-muted">
                            {account.credential_scope === 'separate_management_credential_required'
                              ? 'OpenRouter requiere una credencial de gestión separada para consultar créditos. No reutilizamos claves de inferencia.'
                              : 'Esta consulta no está habilitada con la credencial disponible. No reutilizamos claves de inferencia para consultar gestión.'}
                          </p>
                        )}
                        {account.status === 'unavailable' && (
                          <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[.05] px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                            La cuenta no devolvió una captura disponible en esta consulta.
                          </p>
                        )}
                        {account.status === 'error' && (
                          <p role="status" className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/[.05] px-3 py-2.5 text-xs text-rose-800 dark:text-rose-200">
                            No se pudo consultar esta cuenta.
                          </p>
                        )}
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default ProviderAccountUsagePanel
