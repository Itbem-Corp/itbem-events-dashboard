import type { DeliveryWorkItem } from './delivery-types'
import { deliveryPresentation } from './delivery-presentation'

const stepLabels: Record<string, string> = {
  thinking: 'Preparando el siguiente movimiento',
  reading: 'Leyendo el código necesario',
  validating: 'Aplicando el cambio y ejecutando pruebas',
  repairing: 'Corrigiendo el resultado',
  acceptance: 'Verificando los criterios de aceptación',
}
export function agentWorkspaceState(item: DeliveryWorkItem) {
  const tasks = [...(item.automation_tasks ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const stopping = tasks.find((task) => task.status === 'cancel_requested')
  const active = tasks.find((task) => task.status === 'running' || task.status === 'queued')
  const latest = tasks[0]
  const closed = item.state === 'released' || item.state === 'cancelled'
  const uncertain = /uncertain|durable answer|private recovery|response storage unavailable/i.test(
    latest?.error_message ?? ''
  )
  const canContinue =
    !closed &&
    !stopping &&
    !active &&
    !uncertain &&
    item.agent_progress !== 'queued' &&
    ['planning', 'implementation', 'qa_running', 'release_review'].includes(item.state)
  const title = closed
    ? 'Trabajo cerrado'
    : stopping
      ? 'Deteniéndose de forma segura'
      : active?.status === 'running'
        ? (stepLabels[active.progress_step ?? ''] ?? 'El agente está trabajando')
        : active || item.agent_progress === 'queued'
          ? 'Siguiente movimiento en cola'
          : uncertain
            ? 'Verifica el resultado anterior'
            : item.agent_progress === 'blocked' || latest?.status === 'failed' || latest?.status === 'dispatch_failed'
              ? 'Necesita tu atención'
              : 'Listo para el siguiente paso'
  const detail = closed
    ? 'El historial y la evidencia siguen disponibles.'
    : stopping
      ? 'No se iniciarán más acciones. Una llamada en curso puede tardar en cerrar su auditoría.'
      : active
        ? 'Puedes salir de esta página. El trabajo no depende del navegador.'
        : uncertain
          ? 'No repetiremos una llamada cuyo resultado no está confirmado. Revisa la evidencia antes de autorizar otro intento.'
          : canContinue
            ? 'Añade la corrección o el contexto que falta y solicita un nuevo intento de esta fase.'
            : 'El siguiente avance puede requerir una decisión humana, una dependencia o un preview verificado.'
  const presentation = deliveryPresentation(item)
  return { active, stopping, latest, closed, uncertain, canContinue,
    title: active?.status === 'running' ? title : presentation.title,
    detail: active ? detail : presentation.detail }
}
