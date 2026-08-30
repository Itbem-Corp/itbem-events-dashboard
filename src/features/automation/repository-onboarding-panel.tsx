'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  deliveryProjectRepositoryOnboardingApprovePath,
  deliveryProjectRepositoryOnboardingInspectPath,
  deliveryProjectRepositoryOnboardingProbesPath,
  deliveryProjectRepositoryOnboardingsPath,
  deliveryProjectVaultRevisionsPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CircleStackIcon,
  CodeBracketSquareIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  PlusIcon,
} from '@heroicons/react/20/solid'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import type {
  DeliveryProjectVaultRevision,
  DeliveryRepositoryCapabilityProbeFeed,
  DeliveryRepositoryOnboarding,
} from './delivery-types'
import { ProjectEffectivePolicyPanel } from './effective-policy-panel'
import {
  capabilityLabels,
  capabilityTone,
  latestVaultByRepository,
  onboardingIsApprovable,
  repositoryInspectionPayload,
  shortRevision,
  validOptionalGitRevision,
  vaultManifestDiff,
} from './repository-onboarding'

type RepositoryOnboardingPanelProps = {
  projectId: string
  onContextPublished: () => Promise<unknown>
}

const readinessCopy = {
  ready: 'Lista',
  partially_ready: 'Parcialmente lista',
  blocked: 'Bloqueada',
} as const

function onboardingTone(readiness: DeliveryRepositoryOnboarding['readiness']) {
  return readiness === 'ready' ? ('emerald' as const) : readiness === 'blocked' ? ('rose' as const) : ('amber' as const)
}

const commandProbeCapabilities = [
  'unit',
  'integration',
  'contract',
  'e2e',
  'preview',
  'staging',
  'health',
  'recovery',
] as const

type CommandProbeCapability = (typeof commandProbeCapabilities)[number]

const activeProbeStatuses = new Set(['queued', 'running', 'cancel_requested'])

function OnboardingCapabilityProbePanel({
  projectId,
  onboarding,
  onProposalChanged,
  onActivityChange,
}: {
  projectId: string
  onboarding: DeliveryRepositoryOnboarding
  onProposalChanged: () => Promise<unknown>
  onActivityChange: (onboardingId: string, active: boolean) => void
}) {
  const path = deliveryProjectRepositoryOnboardingProbesPath(projectId, onboarding.id)
  const feed = useSWR<DeliveryRepositoryCapabilityProbeFeed>(path, fetcher, {
    refreshInterval: (data) => (data?.tasks.some((task) => activeProbeStatuses.has(task.status)) ? 5_000 : 15_000),
    revalidateOnFocus: true,
  })
  const [workspaceReference, setWorkspaceReference] = useState('')
  const [selected, setSelected] = useState<CommandProbeCapability[]>(() => {
    const proposed = new Set(
      onboarding.proposal.commands.map((command) => command.capability as CommandProbeCapability)
    )
    return commandProbeCapabilities.filter((capability) => proposed.has(capability))
  })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const tasks = feed.data?.tasks ?? []
  const probes = feed.data?.probes ?? []
  const hasActiveTask = tasks.some((task) => activeProbeStatuses.has(task.status))

  useEffect(() => {
    onActivityChange(onboarding.id, hasActiveTask)
  }, [hasActiveTask, onboarding.id, onActivityChange])

  function toggleCapability(capability: CommandProbeCapability) {
    setSelected((current) =>
      current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]
    )
  }

  async function submitProbe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspaceReference.trim() || selected.length === 0 || hasActiveTask) return
    setSubmitting(true)
    setFeedback('')
    try {
      await api.post(path, {
        expected_revision: onboarding.revision,
        workspace_reference: workspaceReference.trim(),
        capabilities: selected,
      })
      await Promise.all([feed.mutate(), onProposalChanged()])
      setFeedback('Probe encolado para el SHA exacto. La evidencia actualizará esta propuesta al terminar.')
    } catch (error) {
      setFeedback(getApiErrorMessage(error, 'El probe falló cerrado y no modificó la propuesta aprobable.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-soft p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
            Dry-run exacto · execution plane
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-secondary">
            Ejecuta únicamente comandos registrados por el operador en un worktree efímero del SHA inspeccionado.
          </p>
        </div>
        <Badge color={hasActiveTask ? 'amber' : probes.length > 0 ? 'emerald' : 'zinc'}>
          {hasActiveTask ? 'Probe activo' : `${probes.length} evidencias`}
        </Badge>
      </div>
      <form onSubmit={submitProbe} className="mt-3 space-y-3">
        <div>
          <label htmlFor={`probe-workspace-${onboarding.id}`} className="text-[10px] font-semibold text-ink-muted">
            Referencia del workspace Linux
          </label>
          <input
            id={`probe-workspace-${onboarding.id}`}
            value={workspaceReference}
            onChange={(event) => setWorkspaceReference(event.target.value)}
            placeholder="workspace://qa/project/repository"
            required
            className="mt-1 h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 font-mono text-xs text-ink outline-none focus:border-(--tenant-accent)"
          />
        </div>
        <fieldset>
          <legend className="text-[10px] font-semibold text-ink-muted">Capacidades allow-listed</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {commandProbeCapabilities.map((capability) => (
              <label
                key={capability}
                className="flex min-h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-2.5 text-xs text-ink-secondary"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(capability)}
                  onChange={() => toggleCapability(capability)}
                />
                {capabilityLabels[capability]}
              </label>
            ))}
          </div>
        </fieldset>
        <Button
          type="submit"
          color="indigo"
          disabled={submitting || hasActiveTask || selected.length === 0 || !workspaceReference.trim()}
        >
          <ArrowPathIcon
            data-slot="icon"
            className={submitting || hasActiveTask ? 'animate-spin motion-reduce:animate-none' : undefined}
          />
          {submitting
            ? 'Encolando…'
            : hasActiveTask
              ? 'Ejecución en curso'
              : `Probar ${shortRevision(onboarding.revision)}`}
        </Button>
      </form>
      {feedback ? <p className="mt-2 text-xs leading-5 text-ink-secondary">{feedback}</p> : null}
      {tasks.length > 0 ? (
        <ol className="mt-3 space-y-1.5" aria-label="Ejecuciones recientes del probe">
          {tasks.slice(0, 5).map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
              <span className="font-mono">
                {task.id.slice(0, 8)} · intento {task.attempt_count}
              </span>
              <Badge
                color={
                  activeProbeStatuses.has(task.status) ? 'amber' : task.status === 'completed' ? 'emerald' : 'rose'
                }
              >
                {task.status}
              </Badge>
            </li>
          ))}
        </ol>
      ) : null}
      {probes.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {probes.slice(0, 8).map((probe) => (
            <div key={probe.id} className="rounded-lg border border-border-subtle bg-surface-raised p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">{capabilityLabels[probe.capability]}</span>
                <Badge color={probe.state === 'ready' ? 'emerald' : 'rose'}>{probe.state}</Badge>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-ink-muted">{probe.reason}</p>
              <p className="mt-1 font-mono text-[10px] text-ink-muted">
                {probe.executor_role} · evidence:{probe.evidence_sha256.slice(0, 12)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function RepositoryOnboardingPanel({ projectId, onContextPublished }: RepositoryOnboardingPanelProps) {
  const onboardings = useSWR<DeliveryRepositoryOnboarding[]>(
    deliveryProjectRepositoryOnboardingsPath(projectId),
    fetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
    }
  )
  const vault = useSWR<DeliveryProjectVaultRevision[]>(deliveryProjectVaultRevisionsPath(projectId), fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  })
  const [repositoryURL, setRepositoryURL] = useState('')
  const [revision, setRevision] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [approvalConfirmed, setApprovalConfirmed] = useState<Record<string, string>>({})
  const [activeProbes, setActiveProbes] = useState<Record<string, boolean>>({})

  const reportProbeActivity = useCallback((onboardingId: string, active: boolean) => {
    setActiveProbes((current) => (current[onboardingId] === active ? current : { ...current, [onboardingId]: active }))
  }, [])

  const values = onboardings.data ?? []
  const latestVault = latestVaultByRepository(vault.data ?? [])
  const loading = onboardings.isLoading || vault.isLoading
  const unavailable = !loading && (onboardings.error || vault.error)

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = repositoryURL.trim()
    if (!normalized || !validOptionalGitRevision(revision)) return
    setBusy('inspect')
    setFeedback('')
    try {
      await api.post(
        deliveryProjectRepositoryOnboardingInspectPath(projectId),
        repositoryInspectionPayload(normalized, revision)
      )
      setRepositoryURL('')
      setRevision('')
      await onboardings.mutate()
      setFeedback('Inspección estática terminada. Revisa el SHA, las capacidades y el diff del Vault antes de aprobar.')
    } catch (error) {
      setFeedback(
        getApiErrorMessage(error, 'No se pudo inspeccionar el repositorio con las instalaciones autorizadas.')
      )
    } finally {
      setBusy(null)
    }
  }

  async function approve(onboarding: DeliveryRepositoryOnboarding) {
    setBusy(onboarding.id)
    setFeedback('')
    try {
      await api.post(deliveryProjectRepositoryOnboardingApprovePath(projectId, onboarding.id), {
        expected_revision: onboarding.revision,
        expected_proposal_sha256: onboarding.proposal_sha256,
      })
      await Promise.all([onboardings.mutate(), vault.mutate(), onContextPublished()])
      setApprovalConfirmed((current) => ({ ...current, [onboarding.id]: '' }))
      setFeedback(
        `Vault v${latestVersionFor(onboarding.repository_reference, vault.data ?? []) + 1} publicado para ${onboarding.repository_reference}.`
      )
    } catch (error) {
      setFeedback(
        getApiErrorMessage(error, 'La aprobación falló cerrada. Vuelve a inspeccionar el SHA antes de reintentar.')
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className="mt-5 overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised"
      aria-labelledby="project-vault-heading"
    >
      <div className="border-b border-border-subtle bg-[linear-gradient(135deg,color-mix(in_oklab,var(--app-surface-soft)_88%,transparent),color-mix(in_oklab,var(--tenant-accent)_8%,transparent))] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-(--tenant-accent)">
              <CircleStackIcon className="size-4" aria-hidden="true" />
              <p className="text-xs font-semibold tracking-[0.12em] uppercase">Project Vault</p>
            </div>
            <h3 id="project-vault-heading" className="mt-1 text-base font-semibold text-ink">
              Onboarding verificable por repositorio
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
              GitHub y el SHA exacto son la evidencia. El contenido se trata como dato no confiable; aquí no se clona ni
              se ejecuta código.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge color="indigo">
              {values.length} inspección{values.length === 1 ? '' : 'es'}
            </Badge>
            <Badge color="emerald">
              {latestVault.length} repo{latestVault.length === 1 ? '' : 's'} en Vault
            </Badge>
          </div>
        </div>
        <form onSubmit={inspect} className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)_auto]">
          <div className="min-w-0">
            <label htmlFor="repository-onboarding-url" className="sr-only">
              URL del repositorio GitHub
            </label>
            <input
              id="repository-onboarding-url"
              type="url"
              inputMode="url"
              required
              value={repositoryURL}
              onChange={(event) => setRepositoryURL(event.target.value)}
              placeholder="https://github.com/organizacion/repositorio"
              className="h-11 w-full min-w-0 rounded-xl border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink outline-none focus:border-(--tenant-accent)"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="repository-onboarding-revision" className="sr-only">
              Head SHA completo opcional
            </label>
            <input
              id="repository-onboarding-revision"
              type="text"
              inputMode="text"
              spellCheck={false}
              autoComplete="off"
              aria-describedby="repository-onboarding-revision-help"
              aria-invalid={!validOptionalGitRevision(revision)}
              value={revision}
              onChange={(event) => setRevision(event.target.value)}
              placeholder="Head SHA completo (opcional)"
              className="h-11 w-full min-w-0 rounded-xl border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink outline-none focus:border-(--tenant-accent) aria-invalid:border-rose-500"
            />
          </div>
          <Button
            color="indigo"
            type="submit"
            disabled={busy !== null || repositoryURL.trim() === '' || !validOptionalGitRevision(revision)}
          >
            {busy === 'inspect' ? (
              <ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <PlusIcon data-slot="icon" />
            )}
            {busy === 'inspect' ? 'Inspeccionando…' : 'Inspeccionar'}
          </Button>
          <p id="repository-onboarding-revision-help" className="text-[10px] leading-4 text-ink-muted lg:col-span-3">
            Vacío inspecciona la branch principal. Para reconciliar un PR pega sus 40 caracteres; nombres de branch y
            SHAs cortos fallan cerrados.
          </p>
        </form>
      </div>

      {feedback ? (
        <p
          role="status"
          className="border-b border-border-subtle bg-surface-soft px-4 py-3 text-xs leading-5 text-ink-secondary"
        >
          {feedback}
        </p>
      ) : null}
      {unavailable ? (
        <div role="alert" className="flex gap-3 px-4 py-5 text-sm text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            El contrato de onboarding/Vault aún no está disponible en este entorno. No se modificó ningún repositorio.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-3 px-4 py-5 text-sm text-ink-muted" role="status">
          <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Leyendo el ledger del Vault…
        </div>
      ) : values.length === 0 ? (
        <div className="px-4 py-6 text-center sm:px-5">
          <LockClosedIcon className="mx-auto size-6 text-ink-muted" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-ink">Aún no hay repositorios inspeccionados</p>
          <p className="mt-1 text-xs text-ink-muted">
            Empieza con una URL GitHub autorizada; la propuesta se detiene antes de cualquier ejecución.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {values.map((onboarding) => {
            const proposal = onboarding.proposal
            const hasActiveProbe = Boolean(activeProbes[onboarding.id])
            const approvable = onboardingIsApprovable(onboarding) && !hasActiveProbe
            const currentVault = latestVault.find(
              (revision) => revision.repository_reference === onboarding.repository_reference
            )
            const vaultDiff = vaultManifestDiff(proposal.vault, currentVault?.manifest)
            const vaultSummary = proposal.vault_diff ?? {
              added: vaultDiff.filter(({ status }) => status === 'added').map(({ entry }) => entry.key),
              modified: vaultDiff.filter(({ status }) => status === 'changed').map(({ entry }) => entry.key),
              unchanged: vaultDiff.filter(({ status }) => status === 'unchanged').map(({ entry }) => entry.key),
              removed: vaultDiff.filter(({ status }) => status === 'removed').map(({ entry }) => entry.key),
            }
            return (
              <details key={onboarding.id} className="group px-4 py-4 [content-visibility:auto] sm:px-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 marker:hidden focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-xs font-semibold text-ink">
                        {onboarding.repository_reference}
                      </span>
                      <Badge color={onboardingTone(onboarding.readiness)}>{readinessCopy[onboarding.readiness]}</Badge>
                      <Badge color={onboarding.status === 'approved' ? 'emerald' : 'zinc'}>{onboarding.status}</Badge>
                    </span>
                    <span className="mt-1 block text-xs text-ink-muted">
                      {onboarding.default_branch} · {shortRevision(onboarding.revision)} ·{' '}
                      {proposal.inventory_file_count} archivos
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-(--tenant-accent) group-open:hidden">
                    Revisar
                  </span>
                </summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="min-w-0 space-y-4">
                    <div>
                      <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
                        Capability matrix
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {proposal.capabilities.map((capability) => (
                          <div
                            key={capability.name}
                            className="rounded-xl border border-border-subtle bg-surface-soft p-2.5"
                            title={capability.reason}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-ink">
                                {capabilityLabels[capability.name]}
                              </span>
                              <Badge color={capabilityTone(capability.state)}>{capability.state}</Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-ink-muted">
                              {capability.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border-subtle bg-surface-soft p-3">
                        <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
                          Stacks observados
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {proposal.stacks.length > 0 ? (
                            proposal.stacks.map((stack) => (
                              <Badge key={stack.name} color="indigo">
                                {stack.name} · {Math.round(stack.confidence * 100)}%
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-ink-muted">Sin evidencia suficiente.</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-subtle bg-surface-soft p-3">
                        <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
                          Vault propuesto
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {proposal.vault.entries.length} entrada{proposal.vault.entries.length === 1 ? '' : 's'} curada
                          {proposal.vault.entries.length === 1 ? '' : 's'}
                        </p>
                        <p className="mt-1 truncate font-mono text-[10px] text-ink-muted" title={proposal.vault_sha256}>
                          sha256:{proposal.vault_sha256}
                        </p>
                        {proposal.previous_revision ? (
                          <p className="mt-1 text-[10px] text-ink-muted">
                            Reconciliado desde {shortRevision(proposal.previous_revision)} · +
                            {vaultSummary.added.length} ~{vaultSummary.modified.length} −{vaultSummary.removed.length}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
                          Diff aprobable del Vault
                        </p>
                        <span className="text-[10px] text-ink-muted">
                          Base: {currentVault ? `v${currentVault.version}` : 'Vault vacío'}
                        </span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {vaultDiff.map(({ status, entry, previous }) => (
                          <details
                            key={`${status}:${entry.key}`}
                            className="rounded-xl border border-border-subtle bg-surface-soft px-3 py-2.5"
                          >
                            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 marker:hidden focus-visible:ring-2 focus-visible:ring-(--tenant-accent) focus-visible:outline-none">
                              <span className="min-w-0 truncate font-mono text-xs font-semibold text-ink">
                                {entry.key}
                              </span>
                              <Badge color={vaultDiffTone(status)}>{vaultDiffLabel(status)}</Badge>
                            </summary>
                            <div className="mt-2 grid gap-3 border-t border-border-subtle pt-3 lg:grid-cols-2">
                              {previous && status === 'changed' ? (
                                <VaultEntryValue label="Antes" value={previous.value} />
                              ) : null}
                              <VaultEntryValue
                                label={status === 'removed' ? 'Valor retirado' : 'Propuesta'}
                                value={entry.value}
                              />
                            </div>
                            <div className="mt-3">
                              <div className="mb-2 flex flex-wrap gap-1.5">
                                <Badge color={vaultLifecycleTone(entry.lifecycle)}>{entry.lifecycle}</Badge>
                                {entry.valid_from_sha && entry.valid_through_sha ? (
                                  <Badge color="zinc">
                                    {shortRevision(entry.valid_from_sha)} → {shortRevision(entry.valid_through_sha)}
                                  </Badge>
                                ) : null}
                                {entry.history?.length ? (
                                  <Badge color="indigo">{entry.history.length} históricas</Badge>
                                ) : null}
                              </div>
                              <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-muted uppercase">
                                Provenance
                              </p>
                              <ul className="mt-1 space-y-1 text-[10px] text-ink-muted">
                                {entry.provenance.map((proof, index) => (
                                  <li
                                    key={`${proof.source}:${proof.path}:${proof.revision}:${index}`}
                                    className="font-mono break-all"
                                  >
                                    {proof.source} · {proof.path} · {shortRevision(proof.revision)} ·{' '}
                                    {Math.round(proof.confidence * 100)}%
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                    {proposal.commands.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
                          Comandos detectados · no ejecutados
                        </p>
                        <div className="mt-2 space-y-2">
                          {proposal.commands.map((command) => (
                            <div
                              key={`${command.working_directory}-${command.capability}-${command.command.join('-')}`}
                              className="flex min-w-0 items-start gap-2 rounded-xl border border-border-subtle bg-surface-soft p-3"
                            >
                              <CodeBracketSquareIcon
                                className="mt-0.5 size-4 shrink-0 text-ink-muted"
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="font-mono text-[10px] text-ink-muted">{command.working_directory}</p>
                                <p className="mt-1 overflow-x-auto font-mono text-xs text-ink">
                                  {command.command.join(' ')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {onboarding.status === 'proposed' ? (
                      <OnboardingCapabilityProbePanel
                        projectId={projectId}
                        onboarding={onboarding}
                        onProposalChanged={onboardings.mutate}
                        onActivityChange={reportProbeActivity}
                      />
                    ) : null}
                  </div>
                  <aside className="rounded-xl border border-border-subtle bg-surface-soft p-3">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Gate humano</p>
                    <p className="mt-2 text-xs leading-5 text-ink-secondary">
                      Aprobar publica exactamente este SHA como contexto y crea una revisión inmutable del Vault. No
                      autoriza merge ni deploy.
                    </p>
                    <dl className="mt-3 space-y-2 text-[10px]">
                      <div>
                        <dt className="text-ink-muted">Branch detectada</dt>
                        <dd className="mt-0.5 font-mono text-ink">{onboarding.default_branch}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">SHA final</dt>
                        <dd className="mt-0.5 font-mono break-all text-ink">{onboarding.revision}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Trust boundary</dt>
                        <dd className="mt-0.5 text-ink">Contenido no confiable</dd>
                      </div>
                    </dl>
                    {approvable ? (
                      <>
                        <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-ink-secondary">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={approvalConfirmed[onboarding.id] === onboarding.proposal_sha256}
                            onChange={(event) =>
                              setApprovalConfirmed((current) => ({
                                ...current,
                                [onboarding.id]: event.target.checked ? onboarding.proposal_sha256 : '',
                              }))
                            }
                          />
                          Confirmo que revisé el SHA, el diff, los valores y su provenance.
                        </label>
                        <Button
                          color="indigo"
                          type="button"
                          className="mt-3 w-full"
                          disabled={busy !== null || approvalConfirmed[onboarding.id] !== onboarding.proposal_sha256}
                          onClick={() => void approve(onboarding)}
                        >
                          {busy === onboarding.id ? (
                            <ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" />
                          ) : (
                            <CheckCircleIcon data-slot="icon" />
                          )}
                          {busy === onboarding.id ? 'Publicando…' : `Aprobar ${shortRevision(onboarding.revision)}`}
                        </Button>
                      </>
                    ) : (
                      <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink-muted">
                        <LockClosedIcon className="size-4" aria-hidden="true" />
                        {onboarding.status === 'approved'
                          ? 'Vault publicado'
                          : hasActiveProbe
                            ? 'Espera la evidencia del probe'
                            : 'No aprobable'}
                      </div>
                    )}
                  </aside>
                </div>
              </details>
            )
          })}
        </div>
      )}

      {latestVault.length > 0 ? (
        <div className="border-t border-border-subtle bg-surface-soft px-4 py-4 sm:px-5">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
            Revisiones vigentes por repositorio
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {latestVault.map((revision) => (
              <div
                key={revision.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-raised p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] font-semibold text-ink">
                    {revision.repository_reference}
                  </p>
                  <p className="mt-1 text-[10px] text-ink-muted">
                    v{revision.version} · {shortRevision(revision.revision)}
                  </p>
                </div>
                <CheckCircleIcon className="size-5 shrink-0 text-emerald-600" aria-label="Vault aprobado" />
              </div>
            ))}
          </div>
          <ProjectEffectivePolicyPanel projectId={projectId} vaultRevisions={latestVault} />
        </div>
      ) : null}
    </section>
  )
}

function latestVersionFor(repository: string, revisions: DeliveryProjectVaultRevision[]) {
  let version = 0
  for (const revision of revisions) {
    if (revision.repository_reference === repository && revision.version > version) version = revision.version
  }
  return version
}

function vaultDiffTone(status: 'added' | 'changed' | 'unchanged' | 'removed') {
  if (status === 'added') return 'emerald' as const
  if (status === 'changed') return 'amber' as const
  if (status === 'removed') return 'rose' as const
  return 'zinc' as const
}

function vaultDiffLabel(status: 'added' | 'changed' | 'unchanged' | 'removed') {
  return { added: 'Agregada', changed: 'Modificada', unchanged: 'Sin cambio', removed: 'Eliminada' }[status]
}

function vaultLifecycleTone(lifecycle: 'active' | 'deprecated' | 'removed') {
  if (lifecycle === 'active') return 'emerald' as const
  if (lifecycle === 'deprecated') return 'amber' as const
  return 'rose' as const
}

function VaultEntryValue({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-ink-muted">{label}</p>
      <pre className="mt-1 max-h-52 overflow-auto rounded-lg border border-border-subtle bg-surface-raised p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-ink-secondary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}
