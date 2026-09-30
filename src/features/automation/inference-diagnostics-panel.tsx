'use client'

import { useState } from 'react'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { readApiData } from '@/lib/api-envelope'

type Attempt = { index: number; provider: string; model: string; reasoning_enabled: boolean; reasoning_effort: string; duration_ms: number; timeout_ms?: number; failure_code?: string; finish_reason?: string }
type Receipt = { receipt_id: string; call_id: string; run_id: string; status: string; input_tokens?: number | null; output_tokens?: number | null; total_cost_microusd?: number | null; pricing_basis?: string; diagnostics: null | { stage?: string; validation_ms?: number; request_hash: string; request_bytes: number; message_count: number; max_completion_tokens: number; duration_ms: number; gateway_status: number; failure_code?: string; request_capture: string; response_capture: string; attempts: Attempt[] } }
type Content = { request_available: boolean; response_available: boolean; request?: { messages?: { role: string; content: string }[]; redactions?: number }; response?: { final_answer?: string; redactions?: number } }

export function InferenceDiagnosticsPanel({ taskId, runId }: { taskId: string; runId?: string | null }) {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null)
  const [content, setContent] = useState<{ id: string; value: Content } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = `/automation/tasks/${encodeURIComponent(taskId)}`
  async function load() {
    setBusy(true); setError(''); setContent(null)
    try {
      const response = await api.get(`${path}/inference-diagnostics${runId ? `?run_id=${encodeURIComponent(runId)}` : ''}`)
      const rows = readApiData<Receipt[]>(response.data)
      if (!Array.isArray(rows)) throw new Error('Invalid diagnostics')
      setReceipts(rows.filter(row => row && (!runId || row.run_id === runId)))
    } catch { setError('No se pudo cargar el diagnóstico autorizado.') }
    finally { setBusy(false) }
  }
  async function inspect(id: string) {
    setBusy(true); setError(''); setContent(null)
    try {
      const response = await api.post(`${path}/inference-receipts/${encodeURIComponent(id)}/inspect-content`)
      const value = readApiData<Content>(response.data)
      if (!value || typeof value.request_available !== 'boolean' || typeof value.response_available !== 'boolean'
        || (value.request?.messages !== undefined && (!Array.isArray(value.request.messages) || value.request.messages.some(message => typeof message?.role !== 'string' || typeof message?.content !== 'string')))
        || (value.response?.final_answer !== undefined && typeof value.response.final_answer !== 'string')) throw new Error('Invalid inspection')
      setContent({ id, value })
    } catch { setError('No se pudo abrir el contenido privado. Revisa el acceso o la auditoría.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Diagnóstico de inferencia" className="mt-4 space-y-3 border-t border-border-subtle pt-4">
    <h3 className="font-semibold">Detalle de llamadas a IA</h3>
    <p className="text-xs">Hasta 100 receipts recientes de la ejecución seleccionada.</p>
    <Button outline disabled={busy} onClick={() => void load()}>{busy ? 'Cargando…' : 'Consultar llamadas'}</Button>
    {error && <p role="alert">{error}</p>}
    {receipts?.length === 0 && <p>No hay receipts registrados para este evento.</p>}
    {receipts?.map(row => <article key={row.receipt_id} className="space-y-2 rounded-xl border border-border-subtle p-3 text-sm">
      <p className="break-all">Receipt: {row.receipt_id}</p><p className="break-all">Call: {row.call_id}</p>
      <p>Contabilidad: {row.status}. Un resultado ambiguo no confirma un cobro de cero.</p>
      <p>Tokens de entrada / salida: {row.input_tokens ?? 'no verificados'} / {row.output_tokens ?? 'no verificados'} · costo registrado: {typeof row.total_cost_microusd === 'number' ? `$${(row.total_cost_microusd / 1_000_000).toFixed(6)} USD` : 'no verificado'} · base de precio: {row.pricing_basis || 'no registrada'}</p>
      {row.diagnostics ? <>
        <p>Gateway: HTTP {row.diagnostics.gateway_status || 'sin resultado'} · {row.diagnostics.duration_ms} ms · {row.diagnostics.failure_code || 'sin fallo registrado'}</p>
        <p>Última etapa: {row.diagnostics.stage || 'no registrada'} · validación {row.diagnostics.validation_ms ?? '—'} ms</p>
        <p>{row.diagnostics.message_count} mensajes · {row.diagnostics.request_bytes} bytes · máximo {row.diagnostics.max_completion_tokens} tokens</p>
        <p className="break-all">Hash de mensajes de la solicitud: {row.diagnostics.request_hash}</p>
        {(Array.isArray(row.diagnostics.attempts) ? row.diagnostics.attempts : []).map(attempt => <p key={attempt.index}>Ruta {attempt.index + 1}: {attempt.provider} / {attempt.model} · razonamiento {attempt.reasoning_enabled ? 'activado' : 'desactivado'} · esfuerzo {attempt.reasoning_effort || 'vacío'} · {attempt.duration_ms} ms · timeout {attempt.timeout_ms ?? '—'} ms · {attempt.failure_code || 'sin fallo registrado'} · finalización {attempt.finish_reason || 'no observada'}</p>)}
        <p>Captura de solicitud: {row.diagnostics.request_capture || 'no registrada'} · respuesta: {row.diagnostics.response_capture || 'no registrada'}</p>
        <Button outline disabled={busy} onClick={() => void inspect(row.receipt_id)}>Abrir contenido privado y registrar acceso</Button>
      </> : <p>Este receipt es anterior a la captura detallada. No se reconstruye contenido histórico.</p>}
      {content?.id === row.receipt_id && <div className="space-y-2">
        <Button plain onClick={() => setContent(null)}>Ocultar contenido</Button>
        <p>Vista sanitizada: oculta patrones de credenciales detectados y campos de razonamiento privado.</p>
        <h4>Solicitud preparada</h4>
        {content.value.request_available ? content.value.request?.messages?.map((message, index) => <pre key={index} className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{message.role}{'\n'}{message.content}</pre>) : <p>Solicitud no disponible.</p>}
        <h4>Respuesta final</h4>
        {content.value.response_available ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{content.value.response?.final_answer}</pre> : <p>No se observó una respuesta final guardada.</p>}
      </div>}
    </article>)}
  </section>
}
