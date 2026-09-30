import { providerFailureGuidance } from '@/features/automation/delivery-provider-failure'
import { describe, expect, it } from 'vitest'

describe('delivery provider failure guidance', () => {
  it('shows no failure guidance for a running task', () => {
    expect(providerFailureGuidance({ status: 'running', error_message: 'old error' })).toBeNull()
  })
  it('identifies only an explicit provider 401 as a credential failure', () => {
    expect(providerFailureGuidance({ status: 'failed', error_message: 'Provider request rejected (401)' })?.title).toBe('No se pudo verificar la credencial del proveedor')
  })
  it.each([undefined, 'network unavailable', 'Provider request rejected (500)'])('keeps a failed task without a provider 401 generic (%s)', (error) => {
    const guidance = providerFailureGuidance({ status: 'failed', error_message: error })
    expect(guidance?.title).toBe('El agente detuvo este intento')
    expect(guidance?.detail).toContain('no avanzó ningún gate')
  })
})
