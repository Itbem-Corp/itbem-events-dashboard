'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  deliveryProjectRepositoryOnboardingApprovePath,
  deliveryProjectRepositoryOnboardingInspectPath,
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
import { useState } from 'react'
import useSWR from 'swr'
import type { DeliveryProjectVaultRevision, DeliveryRepositoryOnboarding } from './delivery-types'
import { ProjectEffectivePolicyPanel } from './effective-policy-panel'
import {
  capabilityLabels,
  capabilityTone,
  latestVaultByRepository,
  onboardingIsApprovable,
  shortRevision,
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
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const values = onboardings.data ?? []
  const latestVault = latestVaultByRepository(vault.data ?? [])
  const loading = onboardings.isLoading || vault.isLoading
  const unavailable = !loading && (onboardings.error || vault.error)

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = repositoryURL.trim()
    if (!normalized) return
    setBusy('inspect')
    setFeedback('')
    try {
      await api.post(deliveryProjectRepositoryOnboardingInspectPath(projectId), { repository_url: normalized })
      setRepositoryURL('')
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
      })
      await Promise.all([onboardings.mutate(), vault.mutate(), onContextPublished()])
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
        <form onSubmit={inspect} className="mt-4 flex flex-col gap-2 sm:flex-row">
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
            className="h-11 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-soft px-3 font-mono text-xs text-ink outline-none focus:border-(--tenant-accent)"
          />
          <Button color="indigo" type="submit" disabled={busy !== null || repositoryURL.trim() === ''}>
            {busy === 'inspect' ? (
              <ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <PlusIcon data-slot="icon" />
            )}
            {busy === 'inspect' ? 'Inspeccionando…' : 'Inspeccionar'}
          </Button>
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
            const approvable = onboardingIsApprovable(onboarding)
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
                      <Button
                        color="indigo"
                        type="button"
                        className="mt-4 w-full"
                        disabled={busy !== null}
                        onClick={() => void approve(onboarding)}
                      >
                        {busy === onboarding.id ? (
                          <ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" />
                        ) : (
                          <CheckCircleIcon data-slot="icon" />
                        )}
                        {busy === onboarding.id ? 'Publicando…' : `Aprobar ${shortRevision(onboarding.revision)}`}
                      </Button>
                    ) : (
                      <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink-muted">
                        <LockClosedIcon className="size-4" aria-hidden="true" />
                        {onboarding.status === 'approved' ? 'Vault publicado' : 'No aprobable'}
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
