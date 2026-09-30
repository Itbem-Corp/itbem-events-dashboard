'use client'

import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { api } from '@/lib/api'
import { automationProjectProviderCredentialPath } from '@/lib/api-paths'
import { ArrowPathIcon, CheckCircleIcon, KeyIcon, ShieldCheckIcon } from '@heroicons/react/20/solid'
import { useEffect, useRef, useState, type FormEvent } from 'react'

const providers = [
  { id: 'minimax', name: 'MiniMax' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'opencode-go', name: 'OpenCode Go' },
] as const

type ProviderID = (typeof providers)[number]['id']
type StoredCredentialStatus = 'stored' | 'not_configured'
type CredentialStatus = StoredCredentialStatus | 'loading' | 'error' | 'forbidden'
type CredentialStatuses = Record<ProviderID, CredentialStatus>
type CredentialInputs = Record<ProviderID, string>
type Mutation = { provider: ProviderID; action: 'save' | 'remove' } | null
type Feedback = { tone: 'success' | 'error'; text: string }

const initialStatuses = (): CredentialStatuses => Object.fromEntries(providers.map(({ id }) => [id, 'loading'])) as CredentialStatuses
const emptyInputs = (): CredentialInputs => Object.fromEntries(providers.map(({ id }) => [id, ''])) as CredentialInputs

function unwrapResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const response = value as { data?: unknown }
  if (!response.data || typeof response.data !== 'object') return response.data ?? value
  return (response.data as { data?: unknown }).data ?? response.data
}

function isStoredStatus(value: unknown): value is StoredCredentialStatus {
  return value === 'stored' || value === 'not_configured'
}

async function readProjectCredentialStatus(targetProjectId: string, provider: ProviderID): Promise<StoredCredentialStatus> {
  const response = await api.get(automationProjectProviderCredentialPath(targetProjectId, provider))
  const payload = unwrapResponse(response)
  if (!payload || typeof payload !== 'object') throw new Error('invalid project credential status')
  const record = payload as Record<string, unknown>
  if (record.project_id !== targetProjectId || record.provider !== provider || !isStoredStatus(record.status)) {
    throw new Error('invalid project credential status')
  }
  return record.status
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return 0
  const value = error as { status?: unknown; response?: { status?: unknown } }
  const status = value.response?.status ?? value.status
  return typeof status === 'number' ? status : 0
}

function safeFailureMessage(error: unknown, action: 'read' | 'save' | 'remove') {
  if (errorStatus(error) === 403) return 'El servidor no autorizó esta acción para tu acceso al proyecto.'
  if (action === 'read') return 'No se pudo verificar el estado de la credencial de este proyecto.'
  if (action === 'save') return 'No se pudo guardar la credencial de este proyecto.'
  return 'No se pudo quitar la credencial de este proyecto.'
}

function statusPresentation(status: CredentialStatus) {
  if (status === 'stored') return { label: 'Guardada', color: 'emerald' as const }
  if (status === 'not_configured') return { label: 'No configurada', color: 'zinc' as const }
  if (status === 'forbidden') return { label: 'Sin permiso para consultar', color: 'amber' as const }
  if (status === 'error') return { label: 'No se pudo verificar', color: 'amber' as const }
  return { label: 'Consultando…', color: 'indigo' as const }
}

/**
 * Project-only provider credential controls. The backend is authoritative for
 * write permission; this UI never reads a key back or exposes global settings.
 */
export function ProjectProviderCredentials({
  projectId,
  projectName,
  authenticated,
}: {
  /** Must be the ID from the project record currently loaded by its parent. */
  projectId: string
  projectName: string
  authenticated: boolean
}) {
  const scopedProjectId = projectId.trim()
  const projectIdRef = useRef(scopedProjectId)
  const authenticatedRef = useRef(authenticated)
  projectIdRef.current = scopedProjectId
  authenticatedRef.current = authenticated

  const [statuses, setStatuses] = useState<CredentialStatuses>(initialStatuses)
  const [inputs, setInputs] = useState<CredentialInputs>(emptyInputs)
  const [mutation, setMutation] = useState<Mutation>(null)
  const [confirmingRemoval, setConfirmingRemoval] = useState<ProviderID | null>(null)
  const [feedback, setFeedback] = useState<Partial<Record<ProviderID, Feedback>>>({})

  useEffect(() => {
    if (!authenticated || !scopedProjectId) return
    let active = true
    setStatuses(initialStatuses())
    setInputs(emptyInputs())
    setMutation(null)
    setConfirmingRemoval(null)
    setFeedback({})

    for (const provider of providers) {
      void readProjectCredentialStatus(scopedProjectId, provider.id)
        .then((status) => {
          if (active && projectIdRef.current === scopedProjectId && authenticatedRef.current) {
            setStatuses((current) => ({ ...current, [provider.id]: status }))
          }
        })
        .catch((error: unknown) => {
          if (active && projectIdRef.current === scopedProjectId && authenticatedRef.current) {
            setStatuses((current) => ({ ...current, [provider.id]: errorStatus(error) === 403 ? 'forbidden' : 'error' }))
          }
        })
    }

    return () => { active = false }
  }, [authenticated, scopedProjectId])

  if (!authenticated || !scopedProjectId) return null

  async function refreshStatus(provider: ProviderID) {
    const targetProjectId = scopedProjectId
    if (mutation) return
    setStatuses((current) => ({ ...current, [provider]: 'loading' }))
    setFeedback((current) => ({ ...current, [provider]: undefined }))
    try {
      const status = await readProjectCredentialStatus(targetProjectId, provider)
      if (projectIdRef.current === targetProjectId && authenticatedRef.current) {
        setStatuses((current) => ({ ...current, [provider]: status }))
      }
    } catch (error) {
      if (projectIdRef.current === targetProjectId && authenticatedRef.current) {
        setStatuses((current) => ({ ...current, [provider]: errorStatus(error) === 403 ? 'forbidden' : 'error' }))
        setFeedback((current) => ({ ...current, [provider]: { tone: 'error', text: safeFailureMessage(error, 'read') } }))
      }
    }
  }

  async function saveCredential(provider: ProviderID, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetProjectId = scopedProjectId
    const apiKey = inputs[provider].trim()
    if (!authenticated || !targetProjectId || !apiKey || mutation || !isStoredStatus(statuses[provider])) return

    setMutation({ provider, action: 'save' })
    setFeedback((current) => ({ ...current, [provider]: undefined }))
    try {
      const response = await api.put(automationProjectProviderCredentialPath(targetProjectId, provider), { api_key: apiKey })
      const payload = unwrapResponse(response)
      if (!payload || typeof payload !== 'object') throw new Error('invalid project credential save response')
      const record = payload as Record<string, unknown>
      if (record.project_id !== targetProjectId || record.provider !== provider || record.status !== 'stored') {
        throw new Error('invalid project credential save response')
      }
      if (projectIdRef.current === targetProjectId && authenticatedRef.current) {
        setStatuses((current) => ({ ...current, [provider]: 'stored' }))
        setFeedback((current) => ({ ...current, [provider]: { tone: 'success', text: 'Credencial guardada para este proyecto. El valor no se puede volver a mostrar.' } }))
      }
    } catch (error) {
      if (projectIdRef.current === targetProjectId && authenticatedRef.current) {
        setFeedback((current) => ({ ...current, [provider]: { tone: 'error', text: safeFailureMessage(error, 'save') } }))
      }
    } finally {
      if (projectIdRef.current === targetProjectId) {
        setInputs((current) => ({ ...current, [provider]: '' }))
        setMutation(null)
      }
    }
  }

  async function removeCredential(provider: ProviderID) {
    const targetProjectId = scopedProjectId
    if (!authenticated || !targetProjectId || statuses[provider] !== 'stored' || mutation || confirmingRemoval !== provider) return

    setMutation({ provider, action: 'remove' })
    setConfirmingRemoval(null)
    setFeedback((current) => ({ ...current, [provider]: undefined }))
    try {
      const response = await api.delete(automationProjectProviderCredentialPath(targetProjectId, provider))
      const payload = unwrapResponse(response)
      if (!payload || typeof payload !== 'object') throw new Error('invalid project credential removal response')
      const record = payload as Record<string, unknown>
      if (record.project_id !== targetProjectId || record.provider !== provider || record.status !== 'not_configured') {
        throw new Error('invalid project credential removal response')
      }
      if (projectIdRef.current === targetProjectId && authenticatedRef.current) {
        setStatuses((current) => ({ ...current, [provider]: 'not_configured' }))
        setFeedback((current) => ({ ...current, [provider]: { tone: 'success', text: 'Credencial quitada de este proyecto.' } }))
      }
    } catch (error) {
      if (projectIdRef.current === targetProjectId && authenticatedRef.current) {
        setFeedback((current) => ({ ...current, [provider]: { tone: 'error', text: safeFailureMessage(error, 'remove') } }))
      }
    } finally {
      if (projectIdRef.current === targetProjectId) setMutation(null)
    }
  }

  return (
    <section aria-labelledby="project-provider-credentials-title" className="premium-surface mt-5 rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
          <KeyIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[.14em] text-ink-muted uppercase">Acceso de IA del proyecto</p>
          <h2 id="project-provider-credentials-title" className="mt-1 text-lg font-semibold text-ink">Credenciales de proveedores</h2>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">
            Gestiona sólo las claves de <span className="font-medium text-ink">{projectName}</span>. Nunca se leen de vuelta ni se muestran tras guardarlas.
          </p>
        </div>
        <Badge color="emerald"><ShieldCheckIcon aria-hidden="true" className="size-3.5" />Ámbito de proyecto</Badge>
      </div>
      <p className="mt-4 rounded-xl border border-border-subtle bg-surface-soft px-3 py-2.5 text-xs leading-5 text-ink-secondary">
        El servidor decide quién puede consultar, guardar o retirar cada credencial. Esta vista no modifica claves globales ni rutas de modelos.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {providers.map((provider) => {
          const status = statuses[provider.id]
          const presentation = statusPresentation(status)
          const activeMutation = mutation?.provider === provider.id ? mutation.action : null
          const disabled = mutation !== null || status === 'loading' || status === 'error' || status === 'forbidden'

          return (
            <article key={provider.id} aria-labelledby={`project-credential-${provider.id}-title`} className="rounded-2xl border border-border-subtle bg-surface-raised p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`project-credential-${provider.id}-title`} className="font-semibold text-ink">{provider.name}</h3>
                <Badge color={presentation.color}>
                  {activeMutation ? <ArrowPathIcon aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : status === 'stored' ? <CheckCircleIcon aria-hidden="true" className="size-3.5" /> : null}
                  {activeMutation === 'save' ? 'Guardando…' : activeMutation === 'remove' ? 'Quitando…' : presentation.label}
                </Badge>
              </div>

              {status === 'error' || status === 'forbidden' ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/[0.08] px-3 py-2" role="status">
                  <p className="text-xs leading-5 text-amber-900">{status === 'forbidden' ? 'El servidor no autorizó consultar esta credencial.' : 'No se pudo verificar el estado. No se asume que esté configurada.'}</p>
                  <Button outline type="button" onClick={() => void refreshStatus(provider.id)} disabled={mutation !== null}>Reintentar</Button>
                </div>
              ) : (
                <form className="mt-3 space-y-3" onSubmit={(event) => void saveCredential(provider.id, event)}>
                  <Field>
                    <Label htmlFor={`project-credential-${provider.id}-key`}>Clave API de {provider.name}</Label>
                    <Description>Se envía sólo al endpoint de credenciales de este proyecto; no existe vista ni precarga del valor guardado.</Description>
                    <Input
                      id={`project-credential-${provider.id}-key`}
                      name={`project-${provider.id}-api-key`}
                      type="password"
                      autoComplete="new-password"
                      value={inputs[provider.id]}
                      onChange={(event) => setInputs((current) => ({ ...current, [provider.id]: event.target.value }))}
                      placeholder={status === 'stored' ? 'Pega una clave nueva para rotarla' : 'Pega una clave para este proyecto'}
                      disabled={disabled}
                      spellCheck={false}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] leading-5 text-ink-muted">Proyecto: {projectName}</p>
                    <Button color="indigo" type="submit" disabled={disabled || !inputs[provider.id].trim()}>
                      {activeMutation === 'save' ? <><ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" />Guardando…</> : status === 'stored' ? 'Guardar y rotar' : 'Guardar en proyecto'}
                    </Button>
                  </div>
                  {status === 'stored' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
                      <p className="text-xs text-ink-secondary">La clave almacenada no se puede consultar desde el dashboard.</p>
                      {confirmingRemoval === provider.id ? (
                        <div role="group" aria-label={`Confirmar retiro de credencial ${provider.name}`} className="flex flex-wrap items-center gap-2">
                          <span className="sr-only">Quitar la credencial de {provider.name} de {projectName}.</span>
                          <Button outline type="button" disabled={mutation !== null} onClick={() => setConfirmingRemoval(null)}>Cancelar</Button>
                          <Button color="red" type="button" disabled={mutation !== null} onClick={() => void removeCredential(provider.id)}>
                            {activeMutation === 'remove' ? <><ArrowPathIcon data-slot="icon" className="animate-spin motion-reduce:animate-none" />Quitando…</> : 'Confirmar quitar'}
                          </Button>
                        </div>
                      ) : (
                        <Button outline type="button" disabled={mutation !== null} onClick={() => setConfirmingRemoval(provider.id)}>Quitar credencial del proyecto</Button>
                      )}
                    </div>
                  )}
                  {feedback[provider.id] && (
                    <p role={feedback[provider.id]?.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-xs leading-5 ${feedback[provider.id]?.tone === 'error' ? 'bg-rose-500/[0.08] text-rose-900' : 'bg-emerald-500/[0.08] text-emerald-900'}`}>
                      {feedback[provider.id]?.text}
                    </p>
                  )}
                </form>
              )}
              {(status === 'error' || status === 'forbidden') && feedback[provider.id] && (
                <p role="alert" className="mt-2 rounded-lg bg-rose-500/[0.08] px-3 py-2 text-xs leading-5 text-rose-900">{feedback[provider.id]?.text}</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
