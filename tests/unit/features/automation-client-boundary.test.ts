import { describe, expect, it } from 'vitest'
import { automationClientOption, isAutomationClient } from '@/features/automation/automation-client-boundary'

describe('automation client boundary', () => {
  it('allows only the ITBEM product organization', () => {
    expect(isAutomationClient({ code: 'itbem' })).toBe(true)
    expect(isAutomationClient({ code: ' ITBEM ' })).toBe(true)
    expect(isAutomationClient({ code: 'eventiapp' })).toBe(false)
    expect(isAutomationClient({ code: 'cafettonhouse' })).toBe(false)
  })

  it('makes protected organizations visible but not selectable', () => {
    expect(automationClientOption({ code: 'itbem' })).toEqual({ selectable: true })
    expect(automationClientOption({ code: 'eventiapp' })).toEqual({
      selectable: false,
      reason: expect.stringContaining('protegido'),
    })
  })
})
