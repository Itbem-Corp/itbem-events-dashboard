'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'
import { deliveryProjectContextMetadataPath } from '@/lib/api-paths'
import type { DeliveryContextSource } from './delivery-types'

const deploymentLabels: Record<string, string> = {
  automatic: 'Automático al cambiar la rama',
  manual: 'Manual, tras aprobación',
  none: 'Sin despliegue',
}

const workflowRules = [
  ['technologies', 'Tecnologías y versiones'],
  ['issue_workflow', 'Issues y planeación'],
  ['branch_workflow', 'Ramas y puntos de partida'],
  ['pull_request_workflow', 'Pull requests y revisión'],
  ['release_workflow', 'Promoción y publicación'],
] as const

function textValue(source: DeliveryContextSource, key: string) {
  const value = source.metadata?.[key]
  return typeof value === 'string' ? value : ''
}

export function ProjectContextConfiguration({
  projectId,
  source,
  onSaved,
}: {
  projectId: string
  source: DeliveryContextSource
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (source.kind !== 'environment' && source.kind !== 'runbook') return null

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const metadata = source.kind === 'environment'
      ? {
          branch: String(form.get('branch') ?? ''),
          deployment: String(form.get('deployment') ?? 'none'),
          url: String(form.get('url') ?? ''),
          promotion: String(form.get('promotion') ?? ''),
        }
      : Object.fromEntries(workflowRules.map(([key]) => [key, String(form.get(key) ?? '')]))

    if (source.kind === 'runbook' && !Object.values(metadata).some((value) => value.trim())) {
      setMessage('Deja al menos una regla del proyecto antes de guardar.')
      setError('')
      return
    }

    setSaving(true)
    setMessage('')
    setError('')
    try {
      await api.patch(deliveryProjectContextMetadataPath(projectId, source.id), { metadata })
      setMessage('Configuración guardada. Las tareas existentes conservan su versión; las nuevas usarán estos cambios.')
      onSaved()
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'No se pudo guardar. Revisa los datos y vuelve a intentarlo.'))
    } finally {
      setSaving(false)
    }
  }

  if (source.kind === 'environment') {
    const branch = textValue(source, 'branch')
    const deployment = textValue(source, 'deployment')
    const url = textValue(source, 'url')
    const promotion = textValue(source, 'promotion')
    const fieldId = (field: string) => `environment-${source.id}-${field}`

    return (
      <div className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
        <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Rama conectada</dt>
            <dd className="mt-0.5 font-mono font-medium text-ink">{branch || 'Por definir'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Despliegue</dt>
            <dd className="mt-0.5 font-medium text-ink">{deploymentLabels[deployment] ?? 'Por definir'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">URL del ambiente</dt>
            <dd className="mt-0.5 break-all text-ink">{url || 'Sin URL registrada'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Siguiente promoción</dt>
            <dd className="mt-0.5 text-ink">{promotion || 'Sin paso siguiente definido'}</dd>
          </div>
        </dl>
        <details className="group mt-3 border-t border-border-subtle pt-3">
          <summary className="min-h-9 cursor-pointer text-xs font-semibold text-(--tenant-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">
            Editar ambiente: {source.name}
          </summary>
          <form onSubmit={save} onChange={() => { setMessage(''); setError('') }} className="mt-3 grid gap-3">
            <label htmlFor={fieldId('branch')} className="text-xs font-medium text-ink-secondary">
              Rama de {source.name}
              <input id={fieldId('branch')} name="branch" required maxLength={120} defaultValue={branch} className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 font-mono text-sm text-ink" />
            </label>
            <label htmlFor={fieldId('deployment')} className="text-xs font-medium text-ink-secondary">
              Despliegue de {source.name}
              <select id={fieldId('deployment')} name="deployment" defaultValue={deployment || 'none'} className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink">
                <option value="automatic">Automático al cambiar la rama</option>
                <option value="manual">Manual, tras aprobación</option>
                <option value="none">Sin despliegue</option>
              </select>
            </label>
            <label htmlFor={fieldId('url')} className="text-xs font-medium text-ink-secondary">
              URL de {source.name} <span className="font-normal text-ink-muted">(opcional)</span>
              <input id={fieldId('url')} name="url" type="url" maxLength={500} defaultValue={url} placeholder="https://staging.ejemplo.com" className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink" />
            </label>
            <label htmlFor={fieldId('promotion')} className="text-xs font-medium text-ink-secondary">
              Paso siguiente <span className="font-normal text-ink-muted">(opcional)</span>
              <input id={fieldId('promotion')} name="promotion" maxLength={2000} defaultValue={promotion} placeholder="Tras QA, abrir PR hacia main" className="mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 text-sm text-ink" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-xl text-[11px] leading-5 text-ink-muted">Sólo actualiza las reglas del proyecto; no concede acceso a GitHub ni permisos para desplegar.</p>
              <button type="submit" disabled={saving} className="min-h-10 rounded-xl bg-(--tenant-accent) px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                {saving ? 'Guardando…' : `Guardar ambiente ${source.name}`}
              </button>
            </div>
            {message && <p role="status" className="rounded-lg bg-emerald-500/[0.08] px-3 py-2 text-xs leading-5 text-emerald-900">{message}</p>}
            {error && <p role="alert" className="rounded-lg bg-rose-500/[0.08] px-3 py-2 text-xs leading-5 text-rose-900">{error}</p>}
          </form>
        </details>
      </div>
    )
  }

  const fieldId = (field: string) => `runbook-${source.id}-${field}`
  return (
    <div className="mt-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
      <dl className="grid gap-3 sm:grid-cols-2">
        {workflowRules.map(([key, label]) => {
          const value = textValue(source, key)
          return (
            <div key={key}>
              <dt className="text-[11px] font-medium text-ink-muted">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-ink">{value || 'Sin definir'}</dd>
            </div>
          )
        })}
      </dl>
      <details className="group mt-3 border-t border-border-subtle pt-3">
        <summary className="min-h-9 cursor-pointer text-xs font-semibold text-(--tenant-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">
          Editar guía: {source.name}
        </summary>
        <form onSubmit={save} onChange={() => { setMessage(''); setError('') }} className="mt-3 grid gap-3">
          {workflowRules.map(([key, label]) => (
            <label key={key} htmlFor={fieldId(key)} className="text-xs font-medium text-ink-secondary">
              {label}
              <textarea id={fieldId(key)} name={key} maxLength={1200} rows={2} defaultValue={textValue(source, key)} className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-soft px-3 py-2 text-sm text-ink" />
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-xl text-[11px] leading-5 text-ink-muted">La guía es específica de este proyecto. No otorga permisos de push, merge ni despliegue.</p>
            <button type="submit" disabled={saving} className="min-h-10 rounded-xl bg-(--tenant-accent) px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
              {saving ? 'Guardando…' : `Guardar guía ${source.name}`}
            </button>
          </div>
          {message && <p role="status" className="rounded-lg bg-emerald-500/[0.08] px-3 py-2 text-xs leading-5 text-emerald-900">{message}</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-500/[0.08] px-3 py-2 text-xs leading-5 text-rose-900">{error}</p>}
        </form>
      </details>
    </div>
  )
}
