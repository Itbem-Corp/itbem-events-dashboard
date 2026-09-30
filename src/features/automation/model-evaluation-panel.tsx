'use client'

import { Button } from '@/components/button'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Subheading } from '@/components/heading'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'
import { automationModelEvaluationDispatchPath, automationModelEvaluationPath, automationModelEvaluationsPath, automationTaskResultPath } from '@/lib/api-paths'
import { useEffect, useRef, useState } from 'react'

export const EVALUATION_CORPUS_VERSION = 'synthetic-screening-20-2026-09-30-v1'
const storageKey = 'itbem.synthetic-evaluation.id'
type EvaluationCall = {
  task_id: string; case_id: string; candidate: string; status: string
  receipt_id?: string; receipt_status: string; actual_provider: string; actual_model: string
  total_cost_microusd: number; result_available: boolean
  [key: string]: unknown
}
type Evaluation = {
  batch: { id: string; status: string; corpus_version: string; reservation_microusd: number; budget_microusd: number }
  calls: EvaluationCall[]
}

export function parseEvaluation(value: unknown): Evaluation {
  const data = readApiData(value) as Evaluation | null
  if (!data?.batch || typeof data.batch.id !== 'string' || typeof data.batch.status !== 'string' || !Array.isArray(data.calls) || data.calls.length !== 60 || data.batch.corpus_version !== EVALUATION_CORPUS_VERSION || !Number.isSafeInteger(data.batch.budget_microusd) || data.batch.budget_microusd <= 0 || data.batch.budget_microusd > 1_000_000 || !Number.isSafeInteger(data.batch.reservation_microusd) || data.batch.reservation_microusd < 0 || data.batch.reservation_microusd > data.batch.budget_microusd || data.calls.some(call => !call || ['task_id', 'case_id', 'candidate', 'status', 'receipt_status', 'actual_provider', 'actual_model'].some(key => typeof call[key] !== 'string') || typeof call.result_available !== 'boolean' || !Number.isSafeInteger(call.total_cost_microusd) || call.total_cost_microusd < 0)) {
    throw new Error('La evaluación no coincide con el contrato de 60 casos y USD 1.')
  }
  return data
}

// Export only the final answer and provenance; provider extensions and private
// reasoning are never copied from a result object into the downloaded report.
export function evaluationFinalAnswer(result: unknown): string {
  const data = readApiData(result) as { content?: unknown } | null
  return typeof data?.content === 'string' ? data.content : ''
}

export function evaluationEvidence(call: EvaluationCall): Record<string, unknown> {
  const keys = ['task_id', 'evaluation_id', 'sequence', 'case_id', 'candidate', 'prompt_sha256', 'messages_sha256', 'route_sha256', 'reservation_microusd', 'created_at', 'status', 'run_id', 'receipt_id', 'receipt_status', 'policy_hash', 'policy_revision', 'sealed_routes_json', 'worker_id', 'agent_key', 'machine_id', 'error_message', 'finish_reason', 'actual_provider', 'actual_model', 'input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_cost_microusd', 'pricing_basis', 'pricing_snapshot_json', 'gateway_latency_ms', 'result_available']
  return Object.fromEntries(keys.filter(key => key in call).map(key => [key, call[key]]))
}

export function ModelEvaluationPanel() {
  const [id, setId] = useState('')
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const stop = useRef(true)
  useEffect(() => {
    setId(localStorage.getItem(storageKey) ?? '')
    return () => { stop.current = true }
  }, [])

  const load = async (batchId = id) => {
    const response = await api.get(automationModelEvaluationPath(batchId))
    const next = parseEvaluation(response.data)
    setEvaluation(next)
    return next
  }
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() } catch { setError('La operación se detuvo. Conserva el ID y consulta el estado antes de intentar otro despacho.') }
    finally { setBusy(false) }
  }
  const admit = () => act(async () => {
    const batchId = id || crypto.randomUUID()
    setId(batchId); localStorage.setItem(storageKey, batchId)
    // Repeating admission uses the same idempotency ID; it never starts calls.
    await api.post(automationModelEvaluationsPath(), { id: batchId, corpus_version: EVALUATION_CORPUS_VERSION })
    await load(batchId)
  })
  const run = async () => {
    stop.current = false; setRunning(true); setError('')
    let dispatchedFrom = ''
    try {
      while (!stop.current) {
        const current = await load()
        if (current.batch.status !== 'active' || stop.current) break
        const progress = JSON.stringify(current.calls.map(call => [call.task_id, call.status, call.run_id, call.receipt_id, call.receipt_status]))
        if (progress === dispatchedFrom) throw new Error('Dispatch did not advance the evaluation')
        if (current.calls.some(call => ['queued', 'running', 'cancel_requested'].includes(call.status))) {
          await new Promise(resolve => setTimeout(resolve, 5000))
          continue
        }
        // No retry surrounds this write. A lost response or any rejection stops
        // the runner; the server independently enforces quota and exclusivity.
        await api.post(automationModelEvaluationDispatchPath(id), {})
        dispatchedFrom = progress
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    } catch { setError('Ejecución detenida. Revisa el estado y los receipts; no se reintentó el despacho.') }
    finally { stop.current = true; setRunning(false) }
  }
  const download = () => act(async () => {
    const current = await load()
    const calls = []
    for (const call of current.calls) {
      let finalAnswer = '', resultError = ''
      if (call.result_available) {
        try { finalAnswer = evaluationFinalAnswer((await api.get(automationTaskResultPath(call.task_id))).data) }
        catch { resultError = 'final_result_unavailable' }
      }
      calls.push({ ...evaluationEvidence(call), final_answer: finalAnswer, result_error: resultError })
    }
    const blob = new Blob([JSON.stringify({ batch: { id: current.batch.id, status: current.batch.status, corpus_version: current.batch.corpus_version, budget_microusd: current.batch.budget_microusd, reservation_microusd: current.batch.reservation_microusd }, calls, screening_only: true }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `itbem-evaluation-${id}.json`
    document.body.appendChild(link)
    try { link.click() }
    finally {
      link.remove()
      // Allow the browser to begin the download before releasing its URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  })
  const completed = evaluation?.calls.filter(call => call.status === 'completed').length ?? 0
  return <section aria-label="Evaluación sintética aislada" className="mt-8 rounded-2xl border border-border-subtle bg-surface-raised p-5 sm:p-6">
    <Subheading>Evaluación sintética aislada</Subheading>
    <p className="mt-2 text-sm text-ink-secondary">20 casos por modelo: MiniMax M3 con razonamiento, DeepSeek Flash high y GPT-6 Luna high. Máximo 60 llamadas, una a la vez, 4096 tokens de salida y USD 1 API-equivalente. MiniMax usa cuota de suscripción.</p>
    <p className="mt-2 text-sm text-ink-secondary">La admisión reserva el lote completo. Ejecutar continúa los casos pendientes por el gateway. Detener deja terminar la llamada en curso. Este screening acotado no certifica calidad general.</p>
    <Field className="mt-4"><Label>ID de evaluación</Label><Input value={id} disabled={busy || running} onChange={event => { setId(event.target.value); setEvaluation(null) }} placeholder="Se genera al admitir o pega un ID existente" /></Field>
    <div className="mt-4 flex flex-wrap gap-3">
      <Button outline disabled={busy || running || Boolean(evaluation)} onClick={admit}>Admitir evaluación</Button>
      <Button outline disabled={!id || busy || running} onClick={() => void act(async () => { localStorage.setItem(storageKey, id); await load() })}>Consultar evaluación</Button>
      <Button color="indigo" disabled={busy || running || evaluation?.batch.status !== 'active'} onClick={() => void run()}>Ejecutar evaluación</Button>
      {running && <Button outline onClick={() => { stop.current = true }}>Detener después de esta llamada</Button>}
      <Button outline disabled={!evaluation || busy || running} onClick={download}>Descargar evidencia final</Button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {evaluation && <div className="mt-4">
      <p role="status" className="text-sm">Estado: {evaluation.batch.status} · {completed}/60 completadas · reserva ${(evaluation.batch.reservation_microusd / 1_000_000).toFixed(6)} API-equivalente</p>
      <div className="mt-3 max-h-96 overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Resultados y receipts de las 60 llamadas</caption><thead><tr><th>Caso</th><th>Candidato</th><th>Estado</th><th>Modelo usado</th><th>Costo USD</th></tr></thead><tbody>{evaluation.calls.map(call => <tr key={call.task_id} className="border-t border-border-subtle"><td className="py-2">{call.case_id}</td><td>{call.candidate}</td><td>{call.status} · {call.receipt_status}</td><td>{call.actual_provider} / {call.actual_model}</td><td>{(call.total_cost_microusd / 1_000_000).toFixed(6)}</td></tr>)}</tbody></table></div>
    </div>}
  </section>
}
