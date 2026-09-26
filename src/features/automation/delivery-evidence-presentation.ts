import type { DeliveryEvidence } from './delivery-types'

const evidenceDateFormat = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const evidenceKindLabels: Record<DeliveryEvidence['kind'], string> = {
  screenshot: 'Captura visual',
  video: 'Video',
  test_result: 'Resultado de prueba',
  diff: 'Cambio propuesto',
  report: 'Informe',
  log: 'Registro',
  artifact: 'Artefacto',
}

export function deliveryEvidenceTitle(entry: DeliveryEvidence) {
  if (entry.phase === 'plan' && entry.title.trim().toLocaleLowerCase('es-MX') === 'resultado del agente: plan') {
    return 'Propuesta de plan'
  }
  return entry.title
}

export function deliveryEvidencePurpose(entry: DeliveryEvidence) {
  if (entry.phase === 'plan') return 'Plan propuesto · no es prueba de ejecución'
  if (entry.kind === 'test_result') return 'Resultado de prueba registrado'
  return `${evidenceKindLabels[entry.kind]} · evidencia registrada`
}

export function formatDeliveryEvidenceDate(value?: string) {
  if (!value) return 'Fecha no registrada'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha no registrada' : evidenceDateFormat.format(date)
}
