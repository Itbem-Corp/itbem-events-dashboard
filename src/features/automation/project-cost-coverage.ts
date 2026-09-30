export type ProjectCostCoverageInput = {
  executions?: number
  unpricedExecutions?: number
  totalCostMicros?: number
}

export type ProjectCostCoverage =
  | { status: 'empty'; verifiedSubtotalMicros: number }
  | { status: 'complete'; verifiedSubtotalMicros: number }
  | { status: 'incomplete'; verifiedSubtotalMicros: number; unpricedExecutions: number }
  | {
      status: 'unknown'
      verifiedSubtotalMicros?: number
      unpricedExecutions?: number
    }

function nonNegativeSafeInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * The cost API totals only priced USD records. Coverage is complete only when
 * the API explicitly reports zero unpriced executions; older API responses
 * must remain unknown rather than turning missing prices into a confirmed $0.
 */
export function projectCostCoverage(input: ProjectCostCoverageInput): ProjectCostCoverage {
  const executions = input.executions
  const unpricedExecutions = input.unpricedExecutions
  const totalCostMicros = input.totalCostMicros
  const verifiedSubtotalMicros = nonNegativeSafeInteger(totalCostMicros) ? totalCostMicros : undefined

  if (!nonNegativeSafeInteger(executions)) {
    return { status: 'unknown', ...(verifiedSubtotalMicros === undefined ? {} : { verifiedSubtotalMicros }) }
  }

  if (executions === 0) {
    if (nonNegativeSafeInteger(unpricedExecutions) && unpricedExecutions > 0) {
      return { status: 'unknown', ...(verifiedSubtotalMicros === undefined ? {} : { verifiedSubtotalMicros }), unpricedExecutions }
    }
    if (verifiedSubtotalMicros === 0) return { status: 'empty', verifiedSubtotalMicros }
    return { status: 'unknown', ...(verifiedSubtotalMicros === undefined ? {} : { verifiedSubtotalMicros }) }
  }

  if (
    verifiedSubtotalMicros === undefined ||
    !nonNegativeSafeInteger(unpricedExecutions) ||
    unpricedExecutions > executions
  ) {
    return {
      status: 'unknown',
      ...(verifiedSubtotalMicros === undefined ? {} : { verifiedSubtotalMicros }),
      ...(nonNegativeSafeInteger(unpricedExecutions) ? { unpricedExecutions } : {}),
    }
  }

  if (unpricedExecutions === 0) return { status: 'complete', verifiedSubtotalMicros }

  return { status: 'incomplete', verifiedSubtotalMicros, unpricedExecutions }
}

export function projectCostAmountLabel(coverage: ProjectCostCoverage, formatUsd: (micros: number) => string) {
  if (coverage.verifiedSubtotalMicros === undefined) return 'Subtotal USD no disponible'
  const amount = formatUsd(coverage.verifiedSubtotalMicros)
  return coverage.status === 'complete' || coverage.status === 'empty' ? `${amount} USD` : `Subtotal USD verificable: ${amount}`
}

export function projectCostCoverageNote(coverage: ProjectCostCoverage) {
  if (coverage.status === 'incomplete') {
    const count = coverage.unpricedExecutions
    return `${count.toLocaleString('es-MX')} ${count === 1 ? 'llamada' : 'llamadas'} sin precio USD verificable; no se incluyen en el subtotal.`
  }
  if (coverage.status === 'unknown') {
    return 'No se pudo confirmar la cobertura de precios USD; el subtotal no representa necesariamente todo el gasto.'
  }
  return undefined
}
