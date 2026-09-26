'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import type { AutomationAgentProfile } from '@/features/automation/agent-directory'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { automationAgentInstancePath, automationAgentInstancesPath } from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { ArrowPathIcon, ClipboardDocumentIcon, FingerPrintIcon, ShieldCheckIcon } from '@heroicons/react/20/solid'
import { useState, type FormEvent } from 'react'
import useSWR from 'swr'

type AgentInstanceProfileOption = Pick<AutomationAgentProfile, 'agent_key' | 'name'>

export type RegisteredAgentInstance = {
  id: string
  agent_key: string
  machine_id: string
  public_key_fingerprint: string
  status: string
  created_at: string
  last_seen_at?: string
  revoked_at?: string
}

type RegistryPayload = { instances: RegisteredAgentInstance[] }
type RegistryMutation = { kind: 'register' } | { kind: 'revoke'; id: string } | null
type RegistryFeedback = { tone: 'success' | 'error'; text: string }

const MACHINE_ID_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const INSTANCE_ID_UUID_PATTERN = MACHINE_ID_UUID_PATTERN
const AGENT_KEY_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/
const MACHINE_ID_UUID_LENGTH = 36
const MAX_AGENT_INSTANCE_ID_LENGTH = 128
const ED25519_PUBLIC_KEY_LENGTH = 32
const ED25519_PUBLIC_KEY_BASE64URL_LENGTH = 43
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength
}

function parseOptionalTimestamp(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`invalid agent instance ${field}`)
  }
  return value
}

function parseRegisteredAgentInstance(value: unknown): RegisteredAgentInstance {
  if (!isRecord(value)) throw new Error('invalid agent instance')
  if (
    typeof value.id !== 'string' ||
    value.id.length > MAX_AGENT_INSTANCE_ID_LENGTH ||
    !INSTANCE_ID_UUID_PATTERN.test(value.id) ||
    typeof value.agent_key !== 'string' ||
    !AGENT_KEY_PATTERN.test(value.agent_key) ||
    typeof value.machine_id !== 'string' ||
    !isValidAgentMachineID(value.machine_id) ||
    value.machine_id !== value.machine_id.trim() ||
    !requiredString(value.public_key_fingerprint, 256) ||
    !requiredString(value.status, 64) ||
    typeof value.created_at !== 'string' ||
    Number.isNaN(Date.parse(value.created_at))
  ) {
    throw new Error('invalid agent instance')
  }
  return {
    id: value.id,
    agent_key: value.agent_key,
    machine_id: value.machine_id,
    public_key_fingerprint: value.public_key_fingerprint,
    status: value.status,
    created_at: value.created_at,
    last_seen_at: parseOptionalTimestamp(value.last_seen_at, 'last_seen_at'),
    revoked_at: parseOptionalTimestamp(value.revoked_at, 'revoked_at'),
  }
}

export function parseAgentInstanceRegistry(payload: unknown): RegistryPayload {
  const data = readApiData<unknown>(payload)
  if (!isRecord(data) || !Array.isArray(data.instances)) throw new Error('invalid agent instance registry')
  return { instances: data.instances.map(parseRegisteredAgentInstance) }
}

export function parseCreatedAgentInstance(payload: unknown): RegisteredAgentInstance {
  const data = readApiData<unknown>(payload)
  if (!isRecord(data) || !('instance' in data)) throw new Error('invalid agent instance response')
  return parseRegisteredAgentInstance(data.instance)
}

export function isValidAgentMachineID(value: string): boolean {
  const machineID = value.trim()
  return MACHINE_ID_UUID_PATTERN.test(machineID)
}

export function isValidEd25519PublicKey(value: string): boolean {
  const publicKey = value.trim()
  if (publicKey.length !== ED25519_PUBLIC_KEY_BASE64URL_LENGTH || !BASE64URL_PATTERN.test(publicKey)) return false

  try {
    const standardBase64 = publicKey.replaceAll('-', '+').replaceAll('_', '/')
    const decoded = atob(`${standardBase64}=`)
    if (decoded.length !== ED25519_PUBLIC_KEY_LENGTH) return false
    const canonical = btoa(decoded).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
    return canonical === publicKey
  } catch {
    return false
  }
}

function errorStatus(error: unknown): number {
  if (!isRecord(error)) return 0
  const response = isRecord(error.response) ? error.response : undefined
  const status = response?.status ?? error.status
  return typeof status === 'number' ? status : 0
}

function failureMessage(error: unknown, action: 'read' | 'register' | 'revoke'): string {
  if (errorStatus(error) === 403)
    return 'Sólo el admin raíz puede consultar, registrar o revocar identidades de máquinas.'
  if (action === 'read') return 'No se pudieron cargar las identidades de máquinas registradas.'
  if (action === 'register') return 'No se pudo registrar esta máquina. Verifica el identificador y la clave pública.'
  return 'No se pudo revocar esta identidad de máquina.'
}

function dateTime(value?: string): string {
  if (!value) return 'Sin dato'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Sin dato'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function statusPresentation(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'active' || normalized === 'registered') return { label: 'Activa', color: 'emerald' as const }
  if (normalized === 'revoked') return { label: 'Revocada', color: 'rose' as const }
  return { label: status, color: 'zinc' as const }
}

export function AgentInstanceRegistry({ profiles }: { profiles: AgentInstanceProfileOption[] }) {
  const [expanded, setExpanded] = useState(false)
  const [agentKey, setAgentKey] = useState('')
  const [machineID, setMachineID] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [activationConfirmed, setActivationConfirmed] = useState(false)
  const [setupInstance, setSetupInstance] = useState<RegisteredAgentInstance | null>(null)
  const [copiedSetup, setCopiedSetup] = useState(false)
  const [mutation, setMutation] = useState<RegistryMutation>(null)
  const [confirmingRevokeID, setConfirmingRevokeID] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<RegistryFeedback | null>(null)
  const registry = useSWR<RegistryPayload>(
    expanded ? automationAgentInstancesPath() : null,
    async (path) => parseAgentInstanceRegistry(await fetcher<unknown>(path)),
    { dedupingInterval: 5_000, revalidateOnFocus: true }
  )
  const readForbidden = errorStatus(registry.error) === 403
  const validMachineID = isValidAgentMachineID(machineID)
  const validPublicKey = isValidEd25519PublicKey(publicKey)
  const selectedProfileExists = profiles.some((profile) => profile.agent_key === agentKey)
  const canRegister =
    selectedProfileExists && validMachineID && validPublicKey && activationConfirmed && mutation === null && !readForbidden

  async function registerInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedMachineID = machineID.trim()
    if (
      !selectedProfileExists ||
      !isValidAgentMachineID(normalizedMachineID) ||
      !isValidEd25519PublicKey(publicKey) ||
      mutation ||
      readForbidden
    )
      return

    setMutation({ kind: 'register' })
    setConfirmingRevokeID(null)
    setFeedback(null)
    try {
      const response = await api.post(automationAgentInstancesPath(), {
        agent_key: agentKey,
        machine_id: normalizedMachineID,
        public_key: publicKey.trim(),
      })
      const created = parseCreatedAgentInstance(response)
      if (created.agent_key !== agentKey || created.machine_id !== normalizedMachineID) {
        throw new Error('agent instance response does not match request')
      }
      setMachineID('')
      setPublicKey('')
      setActivationConfirmed(false)
      setSetupInstance(created)
      setCopiedSetup(false)
      setFeedback({ tone: 'success', text: `Máquina registrada. Huella: ${created.public_key_fingerprint}` })
      void registry.mutate().catch(() => undefined)
    } catch (error) {
      setFeedback({ tone: 'error', text: failureMessage(error, 'register') })
    } finally {
      setMutation(null)
    }
  }

  async function copyLocalSetup() {
    if (!setupInstance) return
    const snippet = `ITBEM_AGENT_INSTANCE_ID=${setupInstance.id}\nITBEM_AI_AGENT_KEY=${setupInstance.agent_key}`
    try {
      await navigator.clipboard.writeText(snippet)
      setCopiedSetup(true)
    } catch {
      setFeedback({ tone: 'error', text: 'No fue posible copiarlo. Selecciona el bloque de configuración manualmente.' })
    }
  }

  async function revokeInstance(instance: RegisteredAgentInstance) {
    if (mutation || readForbidden || confirmingRevokeID !== instance.id || instance.status.toLowerCase() === 'revoked')
      return
    setMutation({ kind: 'revoke', id: instance.id })
    setConfirmingRevokeID(null)
    setFeedback(null)
    try {
      await api.delete(automationAgentInstancePath(instance.id))
      setFeedback({ tone: 'success', text: `Identidad revocada para ${instance.machine_id}.` })
      void registry.mutate().catch(() => undefined)
    } catch (error) {
      setFeedback({ tone: 'error', text: failureMessage(error, 'revoke') })
    } finally {
      setMutation(null)
    }
  }

  return (
    <section
      className="premium-surface mt-5 overflow-hidden rounded-[1.5rem]"
      aria-labelledby="agent-instance-registry-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
            <FingerPrintIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Identidad criptográfica</p>
            <h2 id="agent-instance-registry-title" className="mt-1 text-lg font-semibold text-ink">
              Registro de máquinas locales
            </h2>
            <p className="mt-1 text-sm leading-5 text-ink-secondary">
              Vincula la clave pública Ed25519 de cada equipo con un perfil de agente.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="amber">
            <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
            Sólo admin raíz
          </Badge>
          <Button
            outline
            type="button"
            aria-expanded={expanded}
            aria-controls="agent-instance-registry-panel"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Ocultar registro' : 'Gestionar identidades'}
          </Button>
        </div>
      </header>

      <div id="agent-instance-registry-panel" hidden={!expanded}>
        {expanded ? (
          <div
            className="border-t border-border-subtle px-5 py-5 sm:px-6"
            aria-busy={registry.isValidating || Boolean(mutation)}
          >
            <p className="rounded-xl border border-border-subtle bg-surface-soft px-4 py-3 text-xs leading-5 text-ink-secondary">
              Ejecuta <code>-ShowMachineIdentity</code> en el equipo que vas a registrar y pega aquí su ID de máquina
              y clave pública. Esta alta activa inmediatamente la identidad para callbacks firmados. La clave privada
              permanece en el equipo; nunca se solicita ni se muestra aquí una clave privada o API key.
            </p>

            {registry.error ? (
              <div
                className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4"
                role="alert"
              >
                <p className="text-sm text-ink-secondary">{failureMessage(registry.error, 'read')}</p>
                <Button outline type="button" onClick={() => void registry.mutate()} disabled={registry.isValidating}>
                  <ArrowPathIcon
                    data-slot="icon"
                    aria-hidden="true"
                    className={registry.isValidating ? 'animate-spin motion-reduce:animate-none' : ''}
                  />
                  Reintentar
                </Button>
              </div>
            ) : registry.isLoading && !registry.data ? (
              <p
                className="mt-4 rounded-xl border border-dashed border-border-subtle p-4 text-sm text-ink-muted"
                role="status"
                aria-live="polite"
              >
                Cargando identidades registradas…
              </p>
            ) : null}

            {registry.data && !readForbidden ? (
              <>
                <form
                  className="mt-4 grid gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4 lg:grid-cols-[minmax(10rem,.7fr)_minmax(12rem,1fr)_minmax(16rem,1.3fr)_auto] lg:items-end"
                  onSubmit={registerInstance}
                >
                  <label className="block text-xs font-semibold text-ink-secondary" htmlFor="agent-instance-profile">
                    Perfil de agente
                    <select
                      id="agent-instance-profile"
                      value={agentKey}
                      onChange={(event) => setAgentKey(event.target.value)}
                      disabled={profiles.length === 0 || mutation !== null}
                      required
                      className="mt-1 block min-h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal text-ink disabled:opacity-60"
                    >
                      <option value="">Selecciona un perfil</option>
                      {profiles.map((profile) => (
                        <option key={profile.agent_key} value={profile.agent_key}>
                          {profile.name} · {profile.agent_key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-ink-secondary" htmlFor="agent-instance-machine-id">
                    ID de máquina
                    <input
                      id="agent-instance-machine-id"
                      type="text"
                      value={machineID}
                      onChange={(event) => setMachineID(event.target.value)}
                      maxLength={MACHINE_ID_UUID_LENGTH}
                      autoComplete="off"
                      spellCheck={false}
                      required
                      aria-invalid={machineID.length > 0 && !validMachineID}
                      aria-describedby="agent-instance-machine-help"
                      disabled={mutation !== null}
                      className="mt-1 block min-h-11 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm font-normal text-ink disabled:opacity-60"
                    />
                    <span
                      id="agent-instance-machine-help"
                      className="mt-1 block text-[11px] font-normal text-ink-muted"
                    >
                      UUID canónico en minúsculas, con guiones.
                    </span>
                  </label>
                  <label className="block text-xs font-semibold text-ink-secondary" htmlFor="agent-instance-public-key">
                    Clave pública Ed25519
                    <textarea
                      id="agent-instance-public-key"
                      value={publicKey}
                      onChange={(event) => setPublicKey(event.target.value)}
                      maxLength={ED25519_PUBLIC_KEY_BASE64URL_LENGTH}
                      rows={2}
                      autoComplete="off"
                      spellCheck={false}
                      required
                      aria-invalid={publicKey.length > 0 && !validPublicKey}
                      aria-describedby="agent-instance-key-help"
                      disabled={mutation !== null}
                      className="mt-1 block min-h-11 w-full resize-y rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 font-mono text-xs font-normal text-ink disabled:opacity-60"
                    />
                    <span id="agent-instance-key-help" className="mt-1 block text-[11px] font-normal text-ink-muted">
                      Base64url sin padding, 43 caracteres (32 bytes). Nunca pegues claves privadas.
                    </span>
                  </label>
                  <Button type="submit" disabled={!canRegister}>
                    {mutation?.kind === 'register' ? 'Registrando…' : 'Registrar máquina'}
                  </Button>
                  <label className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-5 text-ink-secondary lg:col-span-4">
                    <input
                      type="checkbox"
                      checked={activationConfirmed}
                      onChange={(event) => setActivationConfirmed(event.target.checked)}
                      disabled={mutation !== null}
                      className="mt-0.5 size-4 shrink-0 accent-(--tenant-accent)"
                    />
                    <span>
                      Confirmo que esta clave pública se generó en un equipo bajo nuestro control. Registrar activa
                      esa identidad; si sospecho que la clave privada se expuso, detendré el worker y revocaré esta
                      instancia.
                    </span>
                  </label>
                  {profiles.length === 0 ? (
                    <p className="text-xs text-ink-muted lg:col-span-4">No hay perfiles disponibles para vincular.</p>
                  ) : null}
                </form>

                {feedback ? (
                  <p
                    className={`mt-3 rounded-xl px-4 py-3 text-sm ${feedback.tone === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-800 dark:text-rose-300'}`}
                    role={feedback.tone === 'error' ? 'alert' : 'status'}
                  >
                    {feedback.text}
                  </p>
                ) : null}

                {setupInstance ? (
                  <section
                    className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"
                    aria-labelledby="agent-instance-local-setup-title"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 id="agent-instance-local-setup-title" className="text-sm font-semibold text-ink">
                          Siguiente paso: configurar el equipo local
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-ink-secondary">
                          Añade estas dos líneas a <code>.env.ai.local</code> en ese equipo. Son identificadores de
                          configuración, no incluyen credenciales ni la clave privada.
                        </p>
                      </div>
                      <Button outline type="button" onClick={() => void copyLocalSetup()}>
                        <ClipboardDocumentIcon data-slot="icon" aria-hidden="true" />
                        {copiedSetup ? 'Copiado' : 'Copiar configuración'}
                      </Button>
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-border-subtle bg-surface-raised p-3 font-mono text-xs leading-5 text-ink">
                      {`ITBEM_AGENT_INSTANCE_ID=${setupInstance.id}\nITBEM_AI_AGENT_KEY=${setupInstance.agent_key}`}
                    </pre>
                    <p className="mt-2 text-xs leading-5 text-ink-muted">
                      Conserva la identidad privada únicamente en el usuario/host que la generó. Revocar aquí bloquea
                      sus callbacks; también debes detener allí el proceso local.
                    </p>
                  </section>
                ) : null}

                <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Equipos registrados</h3>
                    <p className="mt-1 text-xs text-ink-muted">
                      La huella identifica la clave pública; la clave completa no se vuelve a mostrar.
                    </p>
                  </div>
                  <Badge color="zinc">{registry.data.instances.length} identidades</Badge>
                </div>
                {registry.data.instances.length > 0 ? (
                  <ul className="mt-3 space-y-3">
                    {registry.data.instances.map((instance) => {
                      const profile = profiles.find((item) => item.agent_key === instance.agent_key)
                      const status = statusPresentation(instance.status)
                      const revoked = instance.status.toLowerCase() === 'revoked'
                      const confirming = confirmingRevokeID === instance.id
                      const revoking = mutation?.kind === 'revoke' && mutation.id === instance.id
                      return (
                        <li key={instance.id}>
                          <article className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="truncate text-sm font-semibold text-ink">
                                  {profile?.name ?? instance.agent_key}
                                </h4>
                                <p className="mt-1 text-xs break-all text-ink-muted">
                                  Perfil · {instance.agent_key} · Máquina · {instance.machine_id}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge color={status.color}>{status.label}</Badge>
                                {!revoked ? (
                                  confirming ? (
                                    <>
                                      <Button
                                        plain
                                        type="button"
                                        onClick={() => setConfirmingRevokeID(null)}
                                        disabled={mutation !== null}
                                      >
                                        Cancelar
                                      </Button>
                                      <Button
                                        color="red"
                                        type="button"
                                        onClick={() => void revokeInstance(instance)}
                                        disabled={mutation !== null}
                                        aria-label={`Confirmar revocación de ${instance.machine_id}`}
                                      >
                                        {revoking ? 'Revocando…' : 'Confirmar revocación'}
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      outline
                                      type="button"
                                      onClick={() => {
                                        setConfirmingRevokeID(instance.id)
                                        setFeedback(null)
                                      }}
                                      disabled={mutation !== null || readForbidden}
                                      aria-label={`Revocar ${instance.machine_id}`}
                                    >
                                      Revocar
                                    </Button>
                                  )
                                ) : null}
                              </div>
                            </div>
                            <dl className="mt-4 grid gap-3 border-t border-border-subtle pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <dt className="text-ink-muted">ID de instancia</dt>
                                <dd className="mt-1 font-mono break-all text-ink">{instance.id}</dd>
                              </div>
                              <div>
                                <dt className="text-ink-muted">Huella de clave pública</dt>
                                <dd className="mt-1 font-mono break-all text-ink">{instance.public_key_fingerprint}</dd>
                              </div>
                              <div>
                                <dt className="text-ink-muted">Registrada</dt>
                                <dd className="mt-1 text-ink">{dateTime(instance.created_at)}</dd>
                              </div>
                              <div>
                                <dt className="text-ink-muted">Último contacto</dt>
                                <dd className="mt-1 text-ink">{dateTime(instance.last_seen_at)}</dd>
                              </div>
                              {instance.revoked_at ? (
                                <div>
                                  <dt className="text-ink-muted">Revocada</dt>
                                  <dd className="mt-1 text-ink">{dateTime(instance.revoked_at)}</dd>
                                </div>
                              ) : null}
                            </dl>
                            {confirming ? (
                              <p className="mt-3 text-xs text-amber-800 dark:text-amber-300" role="status">
                                La máquina dejará de autenticarse con esta identidad. Esta acción no se puede deshacer.
                              </p>
                            ) : null}
                          </article>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-2xl border border-dashed border-border-subtle p-5 text-sm text-ink-muted">
                    Aún no hay identidades criptográficas registradas.
                  </p>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
