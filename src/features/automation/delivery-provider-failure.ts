import type { DeliveryAutomationTask } from './delivery-types'

export function providerFailureGuidance(task: Pick<DeliveryAutomationTask, 'status' | 'error_message'>) {
  if (task.status !== 'failed') return null
  if (/provider request rejected \(401\)/i.test(task.error_message ?? '')) {
    return {
      title: 'No se pudo verificar la credencial del proveedor',
      detail: 'La ejecución se detuvo y no avanzó ningún gate. Revisa la credencial del entorno activo, su acceso a la API y los créditos o permisos de la cuenta antes de generar un nuevo plan.',
    }
  }
  return {
    title: 'El agente detuvo este intento',
    detail: 'La ejecución se detuvo y no avanzó ningún gate. Revisa el diagnóstico y el resultado privado antes de decidir si corresponde reintentar o aportar contexto.',
  }
}
