import type { AuthenticatedSSEStatus } from '@/hooks/useAuthenticatedSSE'

export type ProjectStreamPresentation = {
  unavailable: boolean
  reconnecting: boolean
  label: string
  badge: string
  tone: 'rose' | 'amber' | 'indigo' | 'zinc' | 'emerald'
}

/**
 * A quiet project waiting on a human gate does not need to look disconnected.
 * Only an active execution with no live channel is an operational incident.
 */
export function projectStreamPresentation(
  status: AuthenticatedSSEStatus,
  hasActiveExecution: boolean,
): ProjectStreamPresentation {
  const reconnecting = status === 'connecting' || status === 'reconnecting'
  if (reconnecting) {
    return { unavailable: false, reconnecting: true, label: 'Reconectando al agente', badge: 'Reconectando', tone: 'amber' }
  }

  if ((status === 'offline' || status === 'error') && hasActiveExecution) {
    return { unavailable: true, reconnecting: false, label: 'El pulso se actualizará al reconectar', badge: 'Sin señal', tone: 'rose' }
  }

  if (hasActiveExecution) {
    return { unavailable: false, reconnecting: false, label: status === 'live' ? 'Ejecución en vivo' : 'Esperando señal del agente', badge: status === 'live' ? 'En vivo' : 'Esperando señal', tone: status === 'live' ? 'indigo' : 'amber' }
  }

  return { unavailable: false, reconnecting: false, label: 'Seguimiento bajo demanda', badge: status === 'live' ? 'Canal listo' : 'Bajo demanda', tone: status === 'live' ? 'emerald' : 'zinc' }
}
