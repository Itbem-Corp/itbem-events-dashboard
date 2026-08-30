'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { deliveryProjectPolicyDecisionPath, deliveryProjectPolicyRevisionsPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, LockClosedIcon, PlusIcon, XCircleIcon } from '@heroicons/react/20/solid'
import type { FormEvent } from 'react'
import { useState } from 'react'
import useSWR from 'swr'
import type { DeliveryPolicyPatch, DeliveryPolicyRevision } from './delivery-types'
import { buildPolicyProposal, emptyPolicyProposalDraft, normalizePolicyRevisions, policyRevisionsForRepository, type PolicyProposalDraft } from './delivery-policy-management'

type ProjectPolicyManagementPanelProps = {
  projectId: string
  repository: string
  onEffectiveRefresh: () => Promise<unknown>
}

const statusCopy = { pending: 'Pendiente', approved: 'Aprobada', revoked: 'Revocada' } as const
const levelCopy = { project: 'Proyecto', repository: 'Repositorio', override: 'Override exacto' } as const

function statusTone(status: DeliveryPolicyRevision['status']) {
  if (status === 'approved') return 'emerald' as const
  if (status === 'revoked') return 'rose' as const
  return 'amber' as const
}

export function ProjectPolicyManagementPanel({ projectId, repository, onEffectiveRefresh }: ProjectPolicyManagementPanelProps) {
  const path = deliveryProjectPolicyRevisionsPath(projectId)
  const query = useSWR<unknown>(path, fetcher, { refreshInterval: 20_000, revalidateOnFocus: true })
  const hasData = query.data !== undefined
  const normalized = hasData ? normalizePolicyRevisions(query.data, projectId) : []
  const revisions = normalized ? policyRevisionsForRepository(normalized, repository) : []
  const [draft, setDraft] = useState<PolicyProposalDraft>(emptyPolicyProposalDraft)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({})
  const [revocationReasons, setRevocationReasons] = useState<Record<string, string>>({})
  const unavailable = !query.isLoading && Boolean(query.error || (hasData && !normalized))

  function updateDraft<Key extends keyof PolicyProposalDraft>(key: Key, value: PolicyProposalDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (query.isLoading || unavailable) {
      setFeedback('El ledger debe estar disponible e íntegro antes de crear una propuesta.')
      return
    }
    setBusy('proposal')
    setFeedback('')
    try {
      const proposal = buildPolicyProposal(draft, repository)
      await api.post(path, proposal)
      await query.mutate()
      setDraft(emptyPolicyProposalDraft)
      setFeedback('Propuesta sellada. Todavía no tiene autoridad: otra identidad debe revisar el digest y aprobarla.')
    } catch (error) {
      setFeedback(error instanceof Error && !('response' in error) ? error.message : getApiErrorMessage(error, 'La propuesta fue rechazada sin cambiar la política efectiva.'))
    } finally {
      setBusy(null)
    }
  }

  async function decide(revision: DeliveryPolicyRevision, action: 'approved' | 'revoked') {
    if (query.isLoading || unavailable) {
      setFeedback('El ledger debe estar disponible e íntegro antes de registrar una decisión.')
      return
    }
    const key = `${action}:${revision.id}`
    setBusy(key)
    setFeedback('')
    try {
      await api.post(deliveryProjectPolicyDecisionPath(projectId, revision.id), {
        action,
        expected_digest: revision.content_sha256,
        ...(action === 'revoked' ? { reason: revocationReasons[revision.id]?.trim() } : {}),
      })
      await Promise.all([query.mutate(), onEffectiveRefresh()])
      setConfirmations((current) => ({ ...current, [revision.id]: false }))
      setRevocationReasons((current) => ({ ...current, [revision.id]: '' }))
      setFeedback(action === 'approved' ? 'Aprobación independiente registrada; la política efectiva fue recalculada.' : 'Revocación registrada. Esta revisión no puede reactivarse; una corrección requiere un digest nuevo.')
    } catch (error) {
      setFeedback(getApiErrorMessage(error, action === 'approved' ? 'La aprobación falló cerrada. Confirma que usas una identidad distinta del proponente.' : 'La revocación no pudo registrarse.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised" aria-labelledby="policy-management-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-(--tenant-accent) uppercase">Policy ledger</p>
          <h3 id="policy-management-heading" className="mt-1 text-base font-semibold text-ink">Proponer y decidir configuración</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">Dos pasos, dos identidades. Configurar sólo cambia evidencia; nunca ejecuta código, merge ni deploy.</p>
        </div>
        <Badge color="zinc">{revisions.length} {revisions.length === 1 ? 'revisión' : 'revisiones'}</Badge>
      </div>

      <details className="border-b border-border-subtle px-4 py-4 sm:px-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink marker:hidden focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none">
          <PlusIcon className="size-4 text-(--tenant-accent)" aria-hidden="true" />Nueva propuesta inmutable
        </summary>
        <form onSubmit={propose} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PolicySelect label="Alcance" value={draft.scope} onChange={(value) => updateDraft('scope', value as PolicyProposalDraft['scope'])} options={[['project', 'Proyecto'], ['repository', 'Repositorio'], ['override', 'Override exacto']]} />
            {draft.scope === 'override' ? <PolicySelect label="Cobertura del override" value={draft.overrideScope} onChange={(value) => updateDraft('overrideScope', value as PolicyProposalDraft['overrideScope'])} options={[['repository', 'Sólo este repo'], ['project', 'Todos los repos']]} /> : null}
            <PolicySelect label="Modo" value={draft.mode} onChange={(value) => updateDraft('mode', value as PolicyProposalDraft['mode'])} options={[[ '', 'Heredar' ], ['review_only', 'Sólo revisión'], ['merge', 'Merge controlado'], ['release', 'Release controlado']]} />
            <PolicySelect label="Método de merge" value={draft.mergeMethod} onChange={(value) => updateDraft('mergeMethod', value as PolicyProposalDraft['mergeMethod'])} options={[[ '', 'Heredar' ], ['squash', 'Squash'], ['merge', 'Merge commit'], ['rebase', 'Rebase']]} />
            <PolicySelect label="Recovery" value={draft.recoveryDefault} onChange={(value) => updateDraft('recoveryDefault', value as PolicyProposalDraft['recoveryDefault'])} options={[[ '', 'Heredar' ], ['rollback', 'Rollback'], ['roll_forward', 'Roll-forward'], ['expand_contract', 'Expand/contract'], ['irreversible', 'Irreversible']]} />
          </div>

          {draft.scope === 'override' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <PolicyInput label="Change-set exacto" value={draft.changeSetId} onChange={(value) => updateDraft('changeSetId', value)} placeholder="change-set-uuid" required />
              <PolicyInput label="Expira" value={draft.expiresAt} onChange={(value) => updateDraft('expiresAt', value)} type="datetime-local" required />
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <PolicyInput label="Pruebas obligatorias" value={draft.requiredTestKinds} onChange={(value) => updateDraft('requiredTestKinds', value)} placeholder="unit, integration, contract" />
            <PolicyInput label="Ramas exactas" value={draft.allowedTargetBranches} onChange={(value) => updateDraft('allowedTargetBranches', value)} placeholder="main, release/v2" />
            <PolicyInput label="Workflow" value={draft.deploymentWorkflow} onChange={(value) => updateDraft('deploymentWorkflow', value)} placeholder=".github/workflows/deploy.yml" />
            <PolicyInput label="Entorno" value={draft.deploymentEnvironment} onChange={(value) => updateDraft('deploymentEnvironment', value)} placeholder="production" />
            <PolicyInput label="Health checks" value={draft.requiredHealthChecks} onChange={(value) => updateDraft('requiredHealthChecks', value)} placeholder="healthz, readyz" />
            <PolicyInput label="Post-merge" value={draft.requiredPostMergeChecks} onChange={(value) => updateDraft('requiredPostMergeChecks', value)} placeholder="exact-sha, smoke" />
          </div>
          <PolicyInput label="Razón y resultado esperado" value={draft.reason} onChange={(value) => updateDraft('reason', value)} placeholder="Qué cambia, por qué y cómo se comprobará" required />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-soft p-3">
            <p className="max-w-3xl text-xs leading-5 text-ink-muted">Los campos vacíos heredan la capa superior. Ramas con wildcard y workflows fuera de <span className="font-mono">.github/workflows</span> se rechazan.</p>
            <Button color="indigo" type="submit" disabled={busy !== null || query.isLoading || unavailable}>
              {busy === 'proposal' ? <ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" /> : <PlusIcon data-slot="icon" />}
              {busy === 'proposal' ? 'Sellando…' : 'Crear propuesta'}
            </Button>
          </div>
        </form>
      </details>

      {feedback ? <p role="status" className="border-b border-border-subtle bg-surface-soft px-4 py-3 text-xs leading-5 text-ink-secondary">{feedback}</p> : null}
      {unavailable ? (
        <div role="alert" className="flex items-start gap-3 px-4 py-5 sm:px-5"><ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-500" /><div><p className="text-sm font-semibold text-ink">Ledger no verificable</p><p className="mt-1 text-xs text-ink-muted">No se habilita ninguna decisión mientras la proyección sea inválida o no esté disponible.</p></div></div>
      ) : query.isLoading ? (
        <div role="status" className="flex items-center gap-2 px-4 py-5 text-sm text-ink-muted"><ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" />Leyendo revisiones…</div>
      ) : revisions.length === 0 ? (
        <div className="px-4 py-5 text-center sm:px-5"><LockClosedIcon className="mx-auto size-5 text-ink-muted" /><p className="mt-2 text-sm font-semibold text-ink">Sin propuestas para este alcance</p><p className="mt-1 text-xs text-ink-muted">La política efectiva permanece limitada por las capas ya aprobadas.</p></div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {revisions.map((revision) => (
            <details key={revision.id} className="group px-4 py-4 sm:px-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 marker:hidden focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none">
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><Badge color={statusTone(revision.status)}>{statusCopy[revision.status]}</Badge><Badge color="zinc">{levelCopy[revision.level]}</Badge></span><span className="mt-1 block truncate font-mono text-[10px] text-ink-muted">{revision.content_sha256}</span></span>
                <span className="text-xs font-semibold text-(--tenant-accent) group-open:hidden">Revisar</span>
              </summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0 space-y-3">
                  <PolicyPatchSummary patch={revision.patch} />
                  <dl className="grid gap-2 rounded-xl border border-border-subtle bg-surface-soft p-3 text-xs sm:grid-cols-2">
                    <div><dt className="text-ink-muted">Repositorio</dt><dd className="mt-0.5 break-all font-mono text-[10px] text-ink">{revision.repository ?? 'Todos los repos del proyecto'}</dd></div>
                    <div><dt className="text-ink-muted">Creada</dt><dd className="mt-0.5 text-ink">{formatDate(revision.created_at)}</dd></div>
                    {revision.change_set_id ? <div><dt className="text-ink-muted">Change-set</dt><dd className="mt-0.5 font-mono text-[10px] text-ink">{revision.change_set_id}</dd></div> : null}
                    {revision.expires_at ? <div><dt className="text-ink-muted">Expira</dt><dd className="mt-0.5 text-ink">{formatDate(revision.expires_at)}</dd></div> : null}
                  </dl>
                  {revision.reason ? <p className="rounded-xl border border-border-subtle bg-surface-soft p-3 text-xs leading-5 text-ink-secondary"><span className="font-semibold text-ink">Razón:</span> {revision.reason}</p> : null}
                </div>
                <aside className="rounded-xl border border-border-subtle bg-surface-soft p-3">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Gate humano</p>
                  <p className="mt-2 break-all font-mono text-[10px] leading-4 text-ink">sha256:{revision.content_sha256}</p>
                  {revision.status === 'pending' ? (
                    <><label className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink-secondary"><input type="checkbox" className="mt-1" checked={Boolean(confirmations[revision.id])} onChange={(event) => setConfirmations((current) => ({ ...current, [revision.id]: event.target.checked }))} />Confirmo que revisé alcance, patch y digest exacto con una identidad independiente.</label><Button color="indigo" type="button" className="mt-3 w-full" disabled={busy !== null || query.isLoading || unavailable || !confirmations[revision.id]} onClick={() => void decide(revision, 'approved')}>{busy === `approved:${revision.id}` ? <ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" /> : <CheckCircleIcon data-slot="icon" />}Aprobar digest</Button></>
                  ) : revision.status === 'approved' ? (
                    <><PolicyInput label="Razón de revocación" value={revocationReasons[revision.id] ?? ''} onChange={(value) => setRevocationReasons((current) => ({ ...current, [revision.id]: value }))} placeholder="Riesgo o configuración reemplazada" /><Button color="red" type="button" className="mt-3 w-full" disabled={busy !== null || query.isLoading || unavailable || !(revocationReasons[revision.id]?.trim())} onClick={() => void decide(revision, 'revoked')}>{busy === `revoked:${revision.id}` ? <ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" /> : <XCircleIcon data-slot="icon" />}Revocar permanentemente</Button></>
                  ) : <div className="mt-3 flex items-start gap-2 rounded-lg bg-surface-raised p-2.5 text-xs leading-5 text-ink-muted"><LockClosedIcon className="mt-0.5 size-4 shrink-0" />No reactivable. Crea una revisión nueva para corregir.</div>}
                </aside>
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="border-t border-border-subtle px-4 py-3 text-[11px] leading-4 text-ink-muted sm:px-5">El backend vuelve a verificar permisos, independencia, Vault, estado monotónico y digest; la interfaz no puede evadir esas puertas.</p>
    </section>
  )
}

function PolicyInput({ label, value, onChange, placeholder, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return <label className="block text-xs font-semibold text-ink-secondary"><span>{label}</span><input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-xs font-normal text-ink outline-none focus:border-(--tenant-accent)" /></label>
}

function PolicySelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block text-xs font-semibold text-ink-secondary"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-xs font-normal text-ink outline-none focus:border-(--tenant-accent)">{options.map(([option, copy]) => <option key={option} value={option}>{copy}</option>)}</select></label>
}

function PolicyPatchSummary({ patch }: { patch: DeliveryPolicyPatch }) {
  const entries = Object.entries(patch)
  return <div className="rounded-xl border border-border-subtle bg-surface-soft p-3"><p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Patch propuesto</p><div className="mt-2 flex flex-wrap gap-1.5">{entries.length ? entries.map(([key, value]) => <Badge key={key} color="zinc">{key}: {Array.isArray(value) ? value.join(', ') : value}</Badge>) : <span className="text-xs text-ink-muted">Sin campos</span>}</div></div>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha no verificable' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
