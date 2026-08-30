export type ReleaseGateReason = {
  code: string
  repository?: string
  evidence?: string
}

export type ReleaseGateEvaluation = {
  event_id: string
  sequence: number
  action: 'merge' | 'release'
  change_set_id: string
  matrix_digest?: string
  policy_digest?: string
  vault_digest?: string
  subject_digest?: string
  state: 'allowed' | 'blocked'
  reasons: ReleaseGateReason[]
  occurred_at: string
}

export type ReleaseGateEvaluationSnapshot = {
  schema_version: number
  work_item_id: string
  evaluations: ReleaseGateEvaluation[]
  truncated: boolean
}

export function latestReleaseGateEvaluation(
  snapshot: ReleaseGateEvaluationSnapshot | undefined,
  workItemId: string,
): ReleaseGateEvaluation | null {
  if (!snapshot || snapshot.schema_version !== 1 || snapshot.work_item_id !== workItemId || !Array.isArray(snapshot.evaluations) || typeof snapshot.truncated !== 'boolean') {
    return null
  }
  const digestPattern = /^[a-f0-9]{64}$/
  const validOptionalDigest = (value: unknown) => value === undefined || (typeof value === 'string' && digestPattern.test(value))
  const valid = snapshot.evaluations.filter((evaluation) => (
    Boolean(evaluation.event_id) &&
    Boolean(evaluation.change_set_id) &&
    Number.isSafeInteger(evaluation.sequence) &&
    evaluation.sequence > 0 &&
    (evaluation.action === 'merge' || evaluation.action === 'release') &&
    (evaluation.state === 'allowed' || evaluation.state === 'blocked') &&
    Array.isArray(evaluation.reasons) &&
    ((evaluation.state === 'allowed' && evaluation.reasons.length === 0) || (evaluation.state === 'blocked' && evaluation.reasons.length > 0)) &&
    validOptionalDigest(evaluation.matrix_digest) &&
    validOptionalDigest(evaluation.policy_digest) &&
    validOptionalDigest(evaluation.vault_digest) &&
    validOptionalDigest(evaluation.subject_digest) &&
    (evaluation.state !== 'allowed' || (
      digestPattern.test(evaluation.matrix_digest ?? '') &&
      digestPattern.test(evaluation.policy_digest ?? '') &&
      digestPattern.test(evaluation.vault_digest ?? '') &&
      digestPattern.test(evaluation.subject_digest ?? '')
    )) &&
    Number.isFinite(Date.parse(evaluation.occurred_at))
  ))
  return valid.sort((left, right) => right.sequence - left.sequence)[0] ?? null
}

const reasonLabels: Record<string, string> = {
  invalid_input: 'La solicitud estructurada no es válida.',
  revision_matrix_invalid: 'La matriz exacta de repositorios, branches y commits no es válida.',
  policy_unresolved: 'La política efectiva todavía no está resuelta.',
  branch_evidence_missing: 'Falta evidencia del branch protegido.',
  branch_evidence_stale: 'El commit del branch cambió después de recopilar la evidencia.',
  branch_protection_unknown: 'No se pudo comprobar la protección del branch.',
  branch_not_mergeable: 'El branch tiene conflictos o no es mergeable.',
  required_check_missing: 'Falta un check obligatorio.',
  required_check_stale: 'Un check obligatorio pertenece a otro commit.',
  required_check_failed: 'Un check obligatorio falló.',
  review_evidence_missing: 'Falta una revisión independiente para el commit exacto.',
  review_evidence_stale: 'La revisión pertenece a otro commit.',
  review_not_independent: 'La revisión no es independiente del autor.',
  review_changes_requested: 'Existe una solicitud de cambios sin resolver.',
  vault_evidence_missing: 'Falta una revisión aprobada del Vault para este commit.',
  vault_evidence_digest_invalid: 'La evidencia del Vault no tiene una identidad canónica válida.',
  vault_not_reconciled: 'El Vault no está reconciliado con el commit exacto.',
  secret_scan_failed: 'El escaneo de secretos no pasó.',
  high_or_critical_security_findings: 'Existen hallazgos de seguridad altos o críticos.',
  required_test_missing: 'Falta una prueba requerida por la política.',
  required_test_stale: 'Una prueba no corresponde a la matriz actual.',
  required_test_failed: 'Una prueba requerida falló.',
  compatibility_not_ready: 'La compatibilidad cross-repo no está aprobada.',
  migrations_not_ready: 'Las migraciones no están comprobadas.',
  dependencies_not_ready: 'El orden de dependencias no está comprobado.',
  environment_not_ready: 'El ambiente objetivo no está listo.',
  recovery_not_evaluated: 'No hay una estrategia de recuperación evaluada.',
  human_approval_missing: 'Falta la aprobación de una persona autorizada.',
  human_approval_stale: 'La aprobación humana pertenece a otra revisión o política.',
  irreversible_recovery_approval_missing: 'La recuperación irreversible requiere aprobación explícita.',
}

export function releaseGateReasonLabel(reason: ReleaseGateReason): string {
  const base = reasonLabels[reason.code] ?? `Bloqueo determinista: ${reason.code}`
  const scope = [reason.repository, reason.evidence].filter(Boolean).join(' · ')
  return scope ? `${base} (${scope})` : base
}
