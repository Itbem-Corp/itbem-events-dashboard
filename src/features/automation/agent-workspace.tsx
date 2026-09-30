'use client'

import type { AuthenticatedSSEStatus } from '@/hooks/useAuthenticatedSSE'
import { ArrowUpIcon, ChatBubbleLeftRightIcon, CheckCircleIcon, PauseCircleIcon } from '@heroicons/react/20/solid'
import { useRef, useState } from 'react'
import { agentWorkspaceState } from './agent-workspace-state'
import type { DeliveryMessage, DeliveryMessageAttachment, DeliveryWorkItem } from './delivery-types'

type Props = {
  conversationOnly?: boolean
  item: DeliveryWorkItem
  streamStatus: AuthenticatedSSEStatus
  onSend: (body: string, resume: boolean, id: string, attachments?: DeliveryMessageAttachment[]) => Promise<void>
  onInspect: (id: string) => void
  onReview: () => void
  onStop: (id: string) => void
}
const actionStyle =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent) disabled:cursor-not-allowed disabled:opacity-50'

function messageIntentLabel(message: DeliveryMessage) {
  if (message.author_type === 'agent' && message.intent === 'agent_answer') return 'Respuesta informativa'
  if (message.author_type === 'agent') return 'Actualización del agente'
  if (message.intent === 'question') return 'Pregunta · no ejecuta'
  if (message.intent === 'action_request' && message.receipt?.requires_human_gate) return 'Petición sensible · requiere gate'
  if (message.intent === 'action_request') return message.resume_requested ? 'Continuación validada' : 'Instrucción · siguiente punto seguro'
  return 'Contexto guardado'
}

function messageIntentTone(message: DeliveryMessage) {
  if (message.author_type === 'agent' && message.intent === 'agent_answer') return 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (message.author_type === 'agent') return 'bg-surface-soft text-ink-secondary'
  if (message.intent === 'question') return 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (message.receipt?.requires_human_gate) return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (message.intent === 'action_request') return 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
  return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
}

function receiptItems(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).slice(0, 4)
}

export function AgentWorkspace({ item, streamStatus, onSend, onInspect, onReview, onStop, conversationOnly = false }: Props) {
  const state = agentWorkspaceState(item)
  const blockedReason = item.blocked_reason?.trim()
  const connectionLabel = state.closed
    ? 'Historial'
    : state.awaitingHumanDecision
      ? 'Decisión pendiente'
    : (
        {
          live: 'Canal en vivo',
          offline: 'Sin conexión activa',
          idle: 'Actualización pausada',
          connecting: 'Conectando',
          reconnecting: 'Reconectando',
          error: 'Actualización interrumpida',
        } as const
      )[streamStatus]
  const connectionDotClass = state.closed
    ? 'bg-zinc-400'
    : state.awaitingHumanDecision
      ? 'bg-amber-500'
    : ({
        live: 'bg-emerald-500',
        connecting: 'bg-amber-500',
        reconnecting: 'bg-amber-500',
        idle: 'bg-zinc-400',
        offline: 'bg-rose-500',
        error: 'bg-rose-500',
      } as const)[streamStatus]
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef<{ body: string; resume: boolean; id: string; attachments: DeliveryMessageAttachment[] } | null>(null)
  const locked = useRef(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedAttachments, setSelectedAttachments] = useState<string[]>([])
  const messages = [...(item.messages ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const visibleMessages = showHistory ? messages : messages.slice(-4)
  const attachmentOptions: DeliveryMessageAttachment[] = [
    ...(item.context_snapshots ?? []).map((source) => ({
      kind: 'context', id: source.id, name: source.name, reference: source.reference, revision: source.revision,
    })),
    ...(item.evidence ?? []).map((evidence) => ({
      kind: 'evidence', id: evidence.id, name: evidence.title, reference: evidence.reference,
    })),
  ].filter((entry, index, all) => all.findIndex((candidate) => `${candidate.kind}:${candidate.id}` === `${entry.kind}:${entry.id}`) === index).slice(0, 16)
  const selectedAttachmentObjects = selectedAttachments
    .map((key) => attachmentOptions.find((entry) => `${entry.kind}:${entry.id}` === key))
    .filter((entry): entry is DeliveryMessageAttachment => Boolean(entry))
  const submit = async (resume: boolean) => {
    const body = draft.trim()
    if (!body || locked.current || state.closed || (resume && !state.canContinue)) return
    locked.current = true
    setSending(true)
    setError('')
    setNotice('')
    const attachmentKey = selectedAttachmentObjects.map((entry) => `${entry.kind}:${entry.id}`).sort().join('|')
    if (
      pending.current?.body !== body ||
      pending.current.resume !== resume ||
      pending.current.attachments.map((entry) => `${entry.kind}:${entry.id}`).sort().join('|') !== attachmentKey
    )
      pending.current = { body, resume, id: crypto.randomUUID(), attachments: selectedAttachmentObjects }
    try {
      await onSend(body, resume, pending.current.id, pending.current.attachments)
      setDraft('')
      setSelectedAttachments([])
      pending.current = null
      setNotice(
        resume
          ? 'Contexto guardado. El nuevo intento quedó solicitado; no es una aprobación ni una publicación.'
          : 'Mensaje recibido. Su clasificación y, si aplica, la respuesta aparecerán aquí. No interrumpe la ejecución actual.'
      )
    } catch {
      setError(
        'No pudimos confirmar el envío. Conservamos tu texto. Puedes reintentar sin duplicar el mensaje; si la fase cambió, actualiza y revisa el estado.'
      )
    } finally {
      locked.current = false
      setSending(false)
    }
  }
  return (
    <section aria-label="Espacio del agente" className="premium-surface mt-5 overflow-hidden rounded-3xl">
      <div className={conversationOnly ? '' : 'grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'}>
        <div hidden={conversationOnly} className="border-b border-border-subtle bg-surface-soft/45 p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-ink-muted uppercase">
              <ChatBubbleLeftRightIcon className="size-4" /> Tu agente
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <span
                aria-hidden="true"
                data-testid="agent-connection-indicator"
                className={`size-1.5 rounded-full ${connectionDotClass}`}
              />
              {connectionLabel}
            </span>
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink sm:text-2xl" aria-live="polite">
            {state.title}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-ink-secondary">{state.detail}</p>
          {state.active?.progress_call ? (
            <p className="mt-3 text-xs text-ink-muted tabular-nums">
              {state.active.progress_call} llamadas realizadas · el avance se verifica con resultados, no con un
              porcentaje estimado
            </p>
          ) : null}
          {blockedReason && blockedReason !== state.detail.trim() ? (
            <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm leading-6 text-ink">
              {blockedReason}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {state.latest ? (
              <button
                type="button"
                className={`${actionStyle} border border-border-subtle bg-surface-raised text-ink`}
                onClick={() => onInspect(state.latest!.id)}
              >
                Ver ejecución
              </button>
            ) : null}
            {state.active && !state.stopping ? (
              <button
                type="button"
                className={`${actionStyle} text-ink-secondary hover:bg-surface-interactive`}
                onClick={() => onStop(state.active!.id)}
              >
                <PauseCircleIcon className="size-4" />
                Detener intento
              </button>
            ) : !state.closed ? (
              <button
                type="button"
                className={`${actionStyle} text-ink-secondary hover:bg-surface-interactive`}
                onClick={onReview}
              >
                Revisar siguiente paso
              </button>
            ) : null}
          </div>
          <p className="mt-5 text-[11px] leading-5 text-ink-muted">
            Las decisiones de alcance, publicación y entrega siguen en tus manos.
          </p>
        </div>
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Conversación de trabajo</h3>
            {messages.length > 4 ? (
              <button
                type="button"
                className="min-h-9 rounded-lg px-2 text-xs text-ink-secondary hover:bg-surface-soft"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? 'Ver recientes' : `Ver historial (${messages.length})`}
              </button>
            ) : null}
          </div>
          <div
            className="mt-4 max-h-80 space-y-3 overflow-y-auto overscroll-contain"
            role="log"
            aria-label="Mensajes del trabajo"
            aria-relevant="additions"
            tabIndex={0}
          >
            {visibleMessages.length ? (
              visibleMessages.map((entry) => (
                <article
                  key={entry.id}
                  className={`rounded-2xl px-4 py-3 ${entry.author_type === 'human' ? 'ml-6 bg-surface-soft' : 'mr-6 border border-border-subtle bg-surface-raised'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      <span>{entry.author_type === 'human' ? 'Equipo' : 'Agente'}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${messageIntentTone(entry)}`}>
                        {messageIntentLabel(entry)}
                      </span>
                    </span>
                    <time dateTime={entry.created_at}>
                      {new Date(entry.created_at).toLocaleString('es-MX', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 break-words whitespace-pre-wrap text-ink">{entry.body}</p>
                  {entry.attachments?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Referencias adjuntas">
                      {entry.attachments.slice(0, 8).map((attachment) => (
                        <span key={`${attachment.kind}:${attachment.id}`} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border-subtle bg-surface-soft px-2 py-1 text-[10px] text-ink-secondary">
                          <span aria-hidden="true">{attachment.kind === 'evidence' ? '◈' : '↗'}</span>
                          <span className="max-w-48 truncate">{attachment.name}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {entry.receipt?.next ? (
                    <p className="mt-2 text-[11px] leading-5 text-ink-muted">{entry.receipt.next}</p>
                  ) : null}
                  {receiptItems(entry.receipt?.next_steps).length ? (
                    <div className="mt-3 rounded-xl bg-surface-soft/70 p-3">
                      <p className="text-[10px] font-bold tracking-[.12em] text-ink-muted uppercase">Siguientes pasos</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-5 text-ink-secondary">
                        {receiptItems(entry.receipt?.next_steps).map((step) => <li key={step}>{step}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {receiptItems(entry.receipt?.questions).length ? (
                    <div className="mt-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3">
                      <p className="text-[10px] font-bold tracking-[.12em] text-ink-muted uppercase">Por resolver</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-5 text-ink-secondary">
                        {receiptItems(entry.receipt?.questions).map((question) => <li key={question}>{question}</li>)}
                      </ul>
                    </div>
                  ) : null}
				  {receiptItems(entry.receipt?.repairs).length ? (
					<div className="mt-2 rounded-xl border border-sky-500/15 bg-sky-500/5 p-3 text-[11px] leading-5 text-ink-secondary">
					  <span className="font-semibold text-ink">Respuesta normalizada:</span>{' '}
					  {receiptItems(entry.receipt?.repairs).join(' ')}
					</div>
				  ) : null}
                  {entry.resume_requested ? (
                    <span className="mt-2 block text-[10px] text-ink-muted">Continuación solicitada</span>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-border-subtle p-4 text-sm leading-6 text-ink-secondary">
                Un lugar para resolver bloqueos, aportar contexto y conservar las decisiones. Los mensajes no sustituyen
                las aprobaciones.
              </p>
            )}
          </div>
          {!state.closed ? (
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submit(false)
              }}
            >
              <label htmlFor={`agent-message-${item.id}`} className="sr-only">
                Mensaje para el agente
              </label>
              <textarea
                id={`agent-message-${item.id}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={sending}
                maxLength={12000}
                rows={3}
                placeholder="Aclara el resultado esperado, responde al bloqueo o añade una referencia…"
                className="w-full resize-y rounded-2xl border border-border-subtle bg-surface-soft/60 p-3.5 text-sm leading-6 text-ink placeholder:text-ink-muted focus:border-(--tenant-accent) focus:ring-2 focus:ring-(--tenant-accent)/15 focus:outline-none disabled:opacity-60"
              />
              <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                Sin contraseñas ni secretos. El agente clasifica tu mensaje: una pregunta recibe respuesta; guardar contexto no cambia una ejecución en curso; continuar sólo crea un nuevo intento cuando hace falta actuar.
              </p>
              {attachmentOptions.length ? (
                <fieldset className="mt-3 rounded-2xl border border-border-subtle bg-surface-soft/55 p-3">
                  <legend className="px-1 text-[10px] font-bold tracking-[.12em] text-ink-muted uppercase">Referencias autorizadas</legend>
                  <p className="mt-1 text-[11px] leading-5 text-ink-muted">Adjunta evidencia o contexto ya congelado en este trabajo. No se cargan archivos ni se amplían permisos.</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {attachmentOptions.map((entry) => {
                      const key = `${entry.kind}:${entry.id}`
                      const checked = selectedAttachments.includes(key)
                      return (
                        <label key={key} className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition ${checked ? 'border-(--tenant-accent)/40 bg-(--tenant-accent)/[.07]' : 'border-border-subtle bg-surface-raised hover:border-(--tenant-accent)/25'}`}>
                          <input
                            type="checkbox"
                            aria-label={entry.name}
                            checked={checked}
                            disabled={sending || (!checked && selectedAttachments.length >= 8)}
                            onChange={() => setSelectedAttachments((current) => checked ? current.filter((value) => value !== key) : current.length >= 8 ? current : [...current, key])}
                            className="mt-0.5 size-4 rounded border-border-subtle text-(--tenant-accent) focus:ring-(--tenant-accent)"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-ink">{entry.name}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-ink-muted">{entry.kind === 'evidence' ? 'Evidencia' : 'Contexto'}{entry.revision ? ` · ${entry.revision.slice(0, 12)}` : ''}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className={`${actionStyle} border border-border-subtle text-ink`}
                >
                  {sending ? 'Enviando…' : 'Enviar al agente'}
                  <ArrowUpIcon className="size-4" />
                </button>
                {state.canContinue ? (
                  <button
                    type="button"
                    disabled={sending || !draft.trim()}
                    onClick={() => void submit(true)}
                    className={`${actionStyle} bg-ink text-surface-raised shadow-sm`}
                  >
                    Enviar y continuar
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-right text-[10px] leading-5 text-ink-muted">
                ¿Sólo quieres aclarar algo? Usa <span className="font-semibold text-ink-secondary">Enviar al agente</span>. La conversación no aprueba cambios ni publicación.
              </p>
              {state.canContinue ? (
                <p className="mt-2 text-right text-[10px] leading-5 text-ink-muted">
                  Continuar crea un nuevo intento y puede consumir presupuesto.
                </p>
              ) : null}
            </form>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-xs leading-5 text-rose-600 dark:text-rose-300">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink-secondary">
              <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
