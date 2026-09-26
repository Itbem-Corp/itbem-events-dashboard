'use client'

import { ArrowRightIcon, BoltIcon, DocumentTextIcon } from '@heroicons/react/20/solid'
import { deliveryEvidencePurpose, deliveryEvidenceTitle, formatDeliveryEvidenceDate } from './delivery-evidence-presentation'
import type { DeliveryEvidence, DeliveryWorkItem } from './delivery-types'

const recordedCostFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 6,
})

const phaseLabels: Record<string, string> = {
  'delivery.plan': 'Planeación',
  plan: 'Planeación',
  'delivery.implementation': 'Implementación',
  implementation: 'Implementación',
  'delivery.qa': 'Validación y QA',
  qa: 'Validación y QA',
  'delivery.summary': 'Resumen de entrega',
  summary: 'Resumen de entrega',
  'delivery.publish': 'Preparación de publicación',
  publish: 'Preparación de publicación',
  'delivery.chat': 'Conversación',
  chat: 'Conversación',
}

const providerLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  google: 'Google',
  minimax: 'MiniMax',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  xai: 'xAI',
}

function formatRecordedCost(microusd: number) {
  return recordedCostFormat.format(microusd / 1_000_000)
}

function formatCount(value: number) {
  return value.toLocaleString('es-MX')
}

function callCountLabel(value: number) {
  return `${formatCount(value)} ${value === 1 ? 'llamada' : 'llamadas'}`
}

export function deliveryWorkExecutionCountLabel(value: number) {
  return `${formatCount(value)} ${value === 1 ? 'ejecución' : 'ejecuciones'}`
}

export function deliveryWorkProviderLabel(provider?: string) {
  const normalized = provider?.trim().toLocaleLowerCase('es-MX') ?? ''
  return providerLabels[normalized] ?? humanizeKey(normalized || 'Proveedor')
}

function humanizeKey(value: string) {
  const normalized = value.replace(/^delivery\./, '').replace(/[._-]+/g, ' ').trim()
  if (!normalized) return 'Otra fase'
  return normalized.charAt(0).toLocaleUpperCase('es-MX') + normalized.slice(1)
}

export function deliveryWorkPhaseLabel(stepKey: string) {
  return phaseLabels[stepKey] ?? humanizeKey(stepKey)
}

export function deliveryWorkToolLabel(tool?: string) {
  if (!tool) return 'Herramienta'
  return humanizeKey(tool)
}

export function DeliveryWorkUsage({
  summary,
  onOpenUsage,
}: {
  summary?: DeliveryWorkItem['cost_summary']
  onOpenUsage?: () => void
}) {
  const hasRecordedCalls = (summary?.executions ?? 0) > 0
  const steps = [...(summary?.steps ?? [])].sort((left, right) => right.total_cost_microusd - left.total_cost_microusd)
  const conversation = summary?.conversation

  return (
    <section aria-label="Consumo de IA de esta tarea" className="premium-surface min-w-0 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--tenant-accent)/10 text-(--tenant-accent)">
            <BoltIcon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Consumo de IA</p>
            <h2 className="mt-1 text-base font-semibold text-ink">Costo y tokens registrados</h2>
          </div>
        </div>
        {onOpenUsage && (
          <button type="button" onClick={onOpenUsage} className="min-h-11 rounded-xl border border-border-subtle bg-surface-raised px-3 text-xs font-semibold text-ink transition hover:bg-surface-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">
            Ver límites y llamadas
          </button>
        )}
      </div>

      {!hasRecordedCalls ? (
        <p className="mt-4 rounded-2xl border border-border-subtle bg-surface-soft px-4 py-3 text-sm leading-6 text-ink-secondary">
          Aún no hay ejecuciones registradas; no se muestra un costo como si fuera un consumo confirmado.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl bg-surface-soft p-3">
              <dt className="text-[11px] text-ink-muted">Costo registrado (USD)</dt>
              <dd className="mt-1 text-base font-semibold text-ink tabular-nums">{formatRecordedCost(summary!.total_cost_microusd)}</dd>
            </div>
            <div className="rounded-2xl bg-surface-soft p-3">
              <dt className="text-[11px] text-ink-muted">Llamadas</dt>
              <dd className="mt-1 text-base font-semibold text-ink tabular-nums">{formatCount(summary!.executions)}</dd>
            </div>
            <div className="rounded-2xl bg-surface-soft p-3">
              <dt className="text-[11px] text-ink-muted">Entrada</dt>
              <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">{formatCount(summary!.input_tokens)} tokens</dd>
            </div>
            <div className="rounded-2xl bg-surface-soft p-3">
              <dt className="text-[11px] text-ink-muted">Salida</dt>
              <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">{formatCount(summary!.output_tokens)} tokens</dd>
            </div>
          </dl>

          {(summary!.cached_input_tokens > 0 || summary!.cache_write_tokens > 0 || summary!.reasoning_tokens > 0) && (
            <p className="mt-3 text-xs leading-5 text-ink-secondary">
              {summary!.cached_input_tokens > 0 && `${formatCount(summary!.cached_input_tokens)} tokens de caché leída`}
              {summary!.cached_input_tokens > 0 && summary!.cache_write_tokens > 0 ? ' · ' : ''}
              {summary!.cache_write_tokens > 0 && `${formatCount(summary!.cache_write_tokens)} de caché escrita`}
              {(summary!.cached_input_tokens > 0 || summary!.cache_write_tokens > 0) && summary!.reasoning_tokens > 0 ? ' · ' : ''}
              {summary!.reasoning_tokens > 0 && `${formatCount(summary!.reasoning_tokens)} de razonamiento`}
            </p>
          )}

          {(conversation?.executions ?? 0) > 0 || steps.length > 0 ? (
            <div className="mt-4 border-t border-border-subtle pt-4">
              <h3 className="text-xs font-semibold text-ink">Dónde se consumió</h3>
              <ul className="mt-2 divide-y divide-border-subtle rounded-2xl border border-border-subtle">
                {(conversation?.executions ?? 0) > 0 && (
                  <li className="grid gap-1 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-ink">Conversación</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {callCountLabel(conversation!.executions)} · {formatCount(conversation!.input_tokens)} entrada · {formatCount(conversation!.output_tokens)} salida
                        {conversation!.cached_input_tokens > 0 ? ` · ${formatCount(conversation!.cached_input_tokens)} caché` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-ink tabular-nums">{formatRecordedCost(conversation!.total_cost_microusd)}</span>
                  </li>
                )}
                {steps.map((step) => (
                  <li key={`${step.execution_kind}-${step.tool ?? 'agent'}-${step.step_key}`} className="grid gap-1 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {step.execution_kind === 'tool' ? `${deliveryWorkToolLabel(step.tool)} · ${deliveryWorkPhaseLabel(step.step_key)}` : deliveryWorkPhaseLabel(step.step_key)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {callCountLabel(step.executions)} · {formatCount(step.input_tokens)} entrada · {formatCount(step.output_tokens)} salida
                        {step.cached_input_tokens > 0 ? ` · ${formatCount(step.cached_input_tokens)} caché` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-ink tabular-nums">{formatRecordedCost(step.total_cost_microusd)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                Agrupado por fase operativa; no atribuye consumo a cada paso escrito del plan. Actividad conserva el detalle por llamada.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-ink-muted">El total está registrado; el desglose por conversación o fase aún no está disponible.</p>
          )}
        </>
      )}
    </section>
  )
}

export function DeliveryEvidencePreview({
  evidence,
  onOpen,
}: {
  evidence?: DeliveryEvidence[]
  onOpen: () => void
}) {
  const latest = [...(evidence ?? [])].sort((left, right) => {
    const leftTime = left.captured_at ? Date.parse(left.captured_at) : 0
    const rightTime = right.captured_at ? Date.parse(right.captured_at) : 0
    return rightTime - leftTime
  })[0]
  const count = evidence?.length ?? 0

  return (
    <section aria-label="Evidencia de esta tarea" className="premium-surface min-w-0 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-(--tenant-accent)">
            <DocumentTextIcon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">Evidencia</p>
            <h2 className="mt-1 text-base font-semibold text-ink">Lo que dejó el agente</h2>
          </div>
        </div>
        <span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-semibold text-ink-secondary">
          {count} {count === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      {latest ? (
        <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-soft p-4">
          <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{deliveryEvidencePurpose(latest)}</p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-ink">{deliveryEvidenceTitle(latest)}</p>
          <p className="mt-1 text-xs text-ink-muted">{formatDeliveryEvidenceDate(latest.captured_at)}</p>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-border-subtle bg-surface-soft px-4 py-3 text-sm leading-6 text-ink-secondary">
          La primera comprobación añadirá aquí su resultado; todavía no hay evidencia registrada.
        </p>
      )}

      <button type="button" onClick={onOpen} className="mt-3 inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-(--tenant-accent) transition hover:bg-surface-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)">
        Abrir evidencia <ArrowRightIcon className="ml-1 size-3.5" aria-hidden="true" />
      </button>
    </section>
  )
}
