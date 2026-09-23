import { describe, expect, it } from 'vitest'
import { projectStreamPresentation } from '@/features/automation/project-stream-presentation'

describe('projectStreamPresentation', () => {
  it('does not call a human-gated idle project disconnected', () => {
    expect(projectStreamPresentation('offline', false)).toEqual({
      unavailable: false,
      reconnecting: false,
      label: 'Seguimiento bajo demanda',
      badge: 'Bajo demanda',
      tone: 'zinc',
    })
  })

  it('surfaces a lost channel while work is active', () => {
    expect(projectStreamPresentation('error', true)).toMatchObject({
      unavailable: true,
      label: 'El pulso se actualizará al reconectar',
      badge: 'Sin señal',
      tone: 'rose',
    })
  })

  it('keeps reconnection visible without claiming progress', () => {
    expect(projectStreamPresentation('reconnecting', true)).toMatchObject({
      unavailable: false,
      reconnecting: true,
      badge: 'Reconectando',
      tone: 'amber',
    })
  })
})
