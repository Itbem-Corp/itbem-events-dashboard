'use client'

import { Badge } from '@/components/badge'
import { deliveryProjectEffectivePolicyPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import useSWR from 'swr'
import type { DeliveryEffectivePolicySnapshot, DeliveryProjectVaultRevision } from './delivery-types'
import { ProjectPolicyManagementPanel } from './delivery-policy-management-panel'
import { effectivePolicyMissingLabels, effectivePolicyModeLabel, normalizeEffectivePolicySnapshot } from './effective-policy'

type ProjectEffectivePolicyPanelProps = {
  projectId: string
  vaultRevisions: DeliveryProjectVaultRevision[]
}

type EffectivePolicyPanelProps = {
  repository: string
  repositories: string[]
  snapshot?: DeliveryEffectivePolicySnapshot
  loading?: boolean
  validating?: boolean
  unavailable?: boolean
  onRepositoryChange: (repository: string) => void
  onRefresh: () => void
}

function compactDigest(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-6)}`
}

function evaluationDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Fecha no verificable'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

export function ProjectEffectivePolicyPanel({ projectId, vaultRevisions }: ProjectEffectivePolicyPanelProps) {
  const repositories = vaultRevisions.map((revision) => revision.repository_reference)
  const [requestedRepository, setRequestedRepository] = useState<string | null>(null)
  const repository = requestedRepository && repositories.includes(requestedRepository) ? requestedRepository : repositories[0]
  const path = repository ? deliveryProjectEffectivePolicyPath(projectId, repository) : null
  const query = useSWR<unknown>(path, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    keepPreviousData: false,
  })
  const snapshot = repository && query.data
    ? normalizeEffectivePolicySnapshot(query.data, projectId, repository) ?? undefined
    : undefined
  if (!repository) return null
  return <>
    <EffectivePolicyPanel
      repository={repository}
      repositories={repositories}
      snapshot={snapshot}
      loading={query.isLoading}
      validating={query.isValidating}
      unavailable={!query.isLoading && Boolean(query.error || (query.data && !snapshot))}
      onRepositoryChange={setRequestedRepository}
      onRefresh={() => { void query.mutate() }}
    />
    <ProjectPolicyManagementPanel projectId={projectId} repository={repository} onEffectiveRefresh={() => query.mutate()} />
  </>
}

export function EffectivePolicyPanel({ repository, repositories, snapshot, loading = false, validating = false, unavailable = false, onRepositoryChange, onRefresh }: EffectivePolicyPanelProps) {
  const policy = snapshot?.policy
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised" aria-labelledby="effective-policy-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-(--tenant-accent)">
            <ShieldCheckIcon className="size-4" aria-hidden="true" />
            <p className="text-xs font-semibold tracking-[0.12em] uppercase">Delivery policy</p>
          </div>
          <h3 id="effective-policy-heading" className="mt-1 text-base font-semibold text-ink">Autoridad configurada por repositorio</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">Vista efectiva platform → organización → proyecto → repositorio. Es evidencia de configuración; no ejecuta merge ni deploy.</p>
        </div>
        <button type="button" aria-label="Actualizar política efectiva" onClick={onRefresh} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary transition hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)">
          <ArrowPathIcon className={`size-4 ${validating ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        </button>
      </div>

      <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Repositorio aprobado en Vault</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {repositories.map((value) => (
            <button key={value} type="button" aria-pressed={value === repository} onClick={() => onRepositoryChange(value)} className={`min-h-11 shrink-0 rounded-xl border px-3 font-mono text-[10px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent) ${value === repository ? 'border-(--tenant-accent)/40 bg-(--tenant-accent)/10 text-(--tenant-accent)' : 'border-border-subtle bg-surface-soft text-ink-secondary hover:bg-surface'}`}>
              {value.replace('github://', '')}
            </button>
          ))}
        </div>
      </div>

      {unavailable ? (
        <div role="status" className="flex items-start gap-3 px-4 py-5 sm:px-5">
          <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div><p className="text-sm font-semibold text-ink">No se pudo verificar la política</p><p className="mt-1 text-xs leading-5 text-ink-muted">Merge y release permanecen bloqueados hasta recuperar una proyección íntegra.</p></div>
        </div>
      ) : loading ? (
        <div role="status" aria-label="Cargando política efectiva" className="grid gap-3 px-4 py-5 sm:grid-cols-3 sm:px-5">
          {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />)}
        </div>
      ) : !policy ? (
        <div className="flex items-start gap-3 px-4 py-5 sm:px-5"><ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-amber-500" /><div><p className="text-sm font-semibold text-ink">Sin evidencia de política</p><p className="mt-1 text-xs text-ink-muted">No existe una configuración verificable para conceder merge o release.</p></div></div>
      ) : (
        <div className="space-y-4 px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm font-semibold text-ink">{effectivePolicyModeLabel(policy.mode)}</p><p className="mt-1 font-mono text-[10px] text-ink-muted">policy:{compactDigest(policy.digest)}</p></div>
            <div className="flex gap-2"><Badge color={policy.resolved ? 'emerald' : 'amber'}>{policy.resolved ? 'Configuración completa' : 'Configuración incompleta'}</Badge><Badge color="zinc">{snapshot.overrides_considered ? 'Override exacto evaluado' : 'Sin overrides'}</Badge></div>
          </div>

          {!policy.resolved ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Faltan {policy.missing.length} campo{policy.missing.length === 1 ? '' : 's'}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">{policy.missing.map((item) => <li key={item}><Badge color="amber">{effectivePolicyMissingLabels[item] ?? item}</Badge></li>)}</ul>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PolicyValue label="Ramas destino" values={policy.allowed_target_branches} />
            <PolicyValue label="Pruebas obligatorias" values={policy.required_test_kinds} />
            <PolicyValue label="Merge" values={policy.merge_method ? [policy.merge_method] : []} />
            <PolicyValue label="Entorno" values={policy.deployment_environment ? [policy.deployment_environment] : []} />
            <PolicyValue label="Workflow" values={policy.deployment_workflow ? [policy.deployment_workflow] : []} />
            <PolicyValue label="Health checks" values={policy.required_health_checks} />
            <PolicyValue label="Post-merge" values={policy.required_post_merge_checks} />
            <PolicyValue label="Recuperación" values={policy.recovery_default ? [policy.recovery_default] : []} />
          </div>
          {policy.sources.length ? (
            <details className="rounded-2xl border border-border-subtle bg-surface-soft px-3 py-2.5">
              <summary className="min-h-9 cursor-pointer py-1 text-xs font-semibold text-ink-secondary">Ver capas aprobadas</summary>
              <ul className="space-y-2 border-t border-border-subtle pt-3 text-xs">
                {policy.sources.map((source) => <li key={`${source.level}:${source.revision_id}`} className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink-secondary">{source.level}</span><span className="font-mono text-[10px] text-ink-muted">{compactDigest(source.digest)} · {evaluationDate(source.approved_at)}</span></li>)}
              </ul>
            </details>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)]">
            <div className="rounded-2xl border border-border-subtle bg-surface-soft p-3">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Pisos no negociables</p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                {['Revisión independiente', 'Commit exacto', 'Vault reconciliado', 'Secret scan', '0 high / 0 critical', 'Aprobación humana', 'Sin force merge'].map((item) => <span key={item} className="flex items-center gap-2 text-ink-secondary"><CheckCircleIcon className="size-4 shrink-0 text-emerald-500" />{item}</span>)}
              </div>
            </div>
            <dl className="rounded-2xl border border-border-subtle bg-surface-soft p-3 text-xs">
              <div><dt className="text-ink-muted">Vault</dt><dd className="mt-0.5 font-mono text-ink-secondary">v{snapshot.vault.version} · {compactDigest(snapshot.vault.content_sha256)}</dd></div>
              <div className="mt-2"><dt className="text-ink-muted">Commit del repositorio</dt><dd className="mt-0.5 font-mono text-ink-secondary">{compactDigest(snapshot.vault.repository_sha)}</dd></div>
              <div className="mt-2"><dt className="text-ink-muted">Capas aprobadas</dt><dd className="mt-0.5 text-ink-secondary">{policy.sources.length}</dd></div>
              <div className="mt-2"><dt className="text-ink-muted">Evaluada</dt><dd className="mt-0.5 text-ink-secondary">{evaluationDate(snapshot.evaluated_at)}</dd></div>
            </dl>
          </div>
        </div>
      )}
      <p className="border-t border-border-subtle px-4 py-3 text-[11px] leading-4 text-ink-muted sm:px-5">La política resuelta limita capacidades; el Gatekeeper exact-SHA y una aprobación humana independiente siguen siendo obligatorios antes de cualquier acción.</p>
    </section>
  )
}

function PolicyValue({ label, values }: { label: string; values: string[] }) {
  return <div className="rounded-2xl border border-border-subtle bg-surface-soft p-3"><p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{label}</p><div className="mt-2 flex flex-wrap gap-1.5">{values.length ? values.map((value) => <Badge key={value} color="zinc">{value}</Badge>) : <span className="text-xs text-ink-muted">No configurado</span>}</div></div>
}
