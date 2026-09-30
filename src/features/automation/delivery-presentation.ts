import type { DeliveryWorkItem } from './delivery-types'
import { blockedReasonPresentation, latestTaskByOperation, workflowTasks } from './delivery-task-status'

/** Presentation only. Never use this projection to authorize a mutation. */
export const deliveryStateLabels: Record<string, string> = {
  planning: 'Preparando el plan', plan_review: 'Plan por revisar',
  implementation: 'Construyendo el cambio', code_review: 'Cambio por revisar',
  preview_pending: 'Esperando preview', qa_running: 'Verificando el resultado',
  qa_review: 'Validación por revisar', release_review: 'Entrega por autorizar',
  released: 'Entregado', blocked: 'Necesita atención', cancelled: 'Cancelado',
}

export type DeliveryDestination = 'overview' | 'activity' | 'evidence' | 'control'
export function deliveryStageIndex(state?: string): number {
  if (state === 'released') return 3
  if (['implementation', 'code_review', 'preview_pending', 'qa_running', 'qa_review', 'release_review'].includes(state ?? '')) return 2
  if (state === 'planning' || state === 'plan_review') return 1
  return 0
}
export function deliveryPresentation(item: Pick<DeliveryWorkItem, 'state' | 'agent_progress' | 'blocked_reason' | 'automation_tasks' | 'workflow_projection'>) {
  const serverProjection = item.workflow_projection
  if (serverProjection) {
    const tone = serverProjection.state_kind === 'active' ? 'active'
      : serverProjection.state_kind === 'terminal' ? 'complete'
        : serverProjection.state_kind === 'review' || serverProjection.state_kind === 'blocked' || serverProjection.state_kind === 'uncertain' ? 'attention'
          : 'neutral'
    // The summary button only navigates. Mutating affordances are rendered by
    // the control surface, where they can be wired to their real endpoint and
    // re-authorized; never label a navigation click as if it already executed
    // a cancellation, transition or agent run.
    // A summary card only navigates. Never borrow the label of a transition or
    // another mutating action when the projection has no navigation affordance;
    // that would make a click look like it already approved or resumed work.
    const primaryAction = serverProjection.available_actions.find(action => action.kind === 'navigation')
    const fallbackAction = serverProjection.state_kind === 'review'
      ? 'Abrir controles'
      : serverProjection.state_kind === 'terminal'
        ? 'Ver evidencia'
        : 'Ver actividad'
    return {
      title: serverProjection.summary,
      detail: serverProjection.waiting_reason || serverProjection.detail,
      action: primaryAction?.label ?? fallbackAction,
      destination: (serverProjection.state_kind === 'review' ? 'control' : serverProjection.state_kind === 'terminal' ? 'evidence' : 'overview') as DeliveryDestination,
      tone,
    }
  }
  const tasks = latestTaskByOperation(workflowTasks(item.automation_tasks ?? []))
  const stopping = tasks.some(task => task.status === 'cancel_requested')
  const active = tasks.some(task => task.status === 'running' || task.status === 'queued')
  const uncertain = tasks.some(task => task.status === 'failed' && /uncertain|durable answer|private recovery|response storage unavailable/i.test(task.error_message ?? ''))
  const result = (title: string, detail: string, action: string, destination: DeliveryDestination, tone: 'neutral' | 'active' | 'attention' | 'complete') => ({ title, detail, action, destination, tone })
  if (item.state === 'released') return result('Entregado', 'La entrega y su evidencia permanecen disponibles.', 'Ver evidencia', 'evidence', 'complete')
  if (item.state === 'cancelled') return result('Cancelado', 'El historial se conserva. Cancelar no deshace efectos externos ya realizados.', 'Ver historial', 'activity', 'neutral')
  if (stopping) return result('Deteniéndose', 'Una operación en curso puede necesitar reconciliación antes de cerrar.', 'Ver cierre', 'activity', 'attention')
  if (uncertain) return result('Resultado por confirmar', 'Verifica la operación anterior antes de repetirla para evitar efectos duplicados.', 'Inspeccionar resultado', 'activity', 'attention')
  if (active) return result(deliveryStateLabels[item.state] ?? 'Trabajando', 'El trabajo continúa aunque cierres esta página.', 'Ver avance', 'overview', 'active')
  if (item.agent_progress === 'blocked' || item.state === 'blocked') {
    const blocked = blockedReasonPresentation(item.blocked_reason)
    return result(blocked.title, blocked.detail, blocked.kind === 'conflict' ? 'Revisar ramas' : 'Resolver bloqueo', 'activity', 'attention')
  }
  switch (item.state) {
    case 'plan_review': return result('Plan por revisar', 'Revisa alcance y validaciones. Aprobar permite pasar a implementación.', 'Revisar plan', 'control', 'attention')
    case 'code_review': return result('Cambio por revisar', 'Las pruebas no sustituyen tu revisión. Aprobar habilita el paso a preview controlado; producción requiere otra autorización.', 'Revisar cambio', 'control', 'attention')
    case 'qa_review': return result('Validación por revisar', 'Contrasta lo esperado con las pruebas de uso antes de avanzar.', 'Revisar validación', 'control', 'attention')
    case 'release_review': return result('Entrega por autorizar', 'Revisa el resumen y la evidencia. La autorización final es independiente de la revisión de código.', 'Revisar entrega', 'control', 'attention')
    case 'preview_pending': return result('Esperando preview', 'Falta una publicación autorizada o un preview verificable. No es una ejecución activa.', 'Preparar preview', 'control', 'attention')
  }
  if (item.agent_progress === 'queued') return result('Siguiente paso en cola', 'La continuación está guardada. Espera capacidad disponible.', 'Ver avance', 'overview', 'active')
  if (tasks.some(task => task.status === 'failed' || task.status === 'dispatch_failed')) return result('Intento por revisar', 'Consulta el último intento y su causa antes de continuar.', 'Revisar intento', 'activity', 'attention')
  return result(deliveryStateLabels[item.state] ?? 'Estado por verificar', 'Revisa la preparación y el último resultado disponible.', 'Ver siguiente paso', 'control', 'neutral')
}
