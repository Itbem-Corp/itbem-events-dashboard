import { describe, expect, it } from 'vitest'
import { projectCostAmountLabel, projectCostCoverage, projectCostCoverageNote } from './project-cost-coverage'

describe('projectCostCoverage', () => {
  it('confirms an empty ledger only when the API reports zero executions and zero subtotal', () => {
    const coverage = projectCostCoverage({ executions: 0, unpricedExecutions: 0, totalCostMicros: 0 })

    expect(coverage).toEqual({ status: 'empty', verifiedSubtotalMicros: 0 })
    expect(projectCostAmountLabel(coverage, (micros) => `$${(micros / 1_000_000).toFixed(4)}`)).toBe('$0.0000 USD')
    expect(projectCostCoverageNote(coverage)).toBeUndefined()
  })

  it('marks all executions priced only when the API explicitly reports zero unpriced records', () => {
    expect(projectCostCoverage({ executions: 4, unpricedExecutions: 0, totalCostMicros: 1250 })).toEqual({
      status: 'complete',
      verifiedSubtotalMicros: 1250,
    })
  })

  it('keeps priced USD as a subtotal when legacy, foreign-currency or missing-price calls exist', () => {
    const coverage = projectCostCoverage({ executions: 5, unpricedExecutions: 2, totalCostMicros: 2500 })

    expect(coverage).toEqual({ status: 'incomplete', verifiedSubtotalMicros: 2500, unpricedExecutions: 2 })
    expect(projectCostAmountLabel(coverage, (micros) => `$${(micros / 1_000_000).toFixed(4)}`)).toBe(
      'Subtotal USD verificable: $0.0025'
    )
    expect(projectCostCoverageNote(coverage)).toMatch(/2 llamadas sin precio USD verificable/)
  })

  it('treats transitional responses without unpriced_executions as unknown coverage', () => {
    const coverage = projectCostCoverage({ executions: 3, totalCostMicros: 0 })

    expect(coverage).toEqual({ status: 'unknown', verifiedSubtotalMicros: 0 })
    expect(projectCostAmountLabel(coverage, (micros) => `$${(micros / 1_000_000).toFixed(4)}`)).toBe(
      'Subtotal USD verificable: $0.0000'
    )
    expect(projectCostCoverageNote(coverage)).toContain('no representa necesariamente todo el gasto')
  })

  it('does not convert absent or inconsistent totals to a confirmed zero', () => {
    expect(projectCostCoverage({ executions: 2, unpricedExecutions: 0 })).toEqual({ status: 'unknown', unpricedExecutions: 0 })
    expect(projectCostCoverage({ executions: 2, unpricedExecutions: 3, totalCostMicros: 500 })).toEqual({
      status: 'unknown',
      verifiedSubtotalMicros: 500,
      unpricedExecutions: 3,
    })
    expect(projectCostCoverage({ executions: 0, unpricedExecutions: 1, totalCostMicros: 0 })).toEqual({
      status: 'unknown',
      verifiedSubtotalMicros: 0,
      unpricedExecutions: 1,
    })
  })
})
