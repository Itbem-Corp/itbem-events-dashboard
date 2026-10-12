import { describe, expect, it } from 'vitest'

import { publishResultMessage, publishWindowState, studioPublishState } from '@/features/events/studio/publish-state'

const NOW = Date.parse('2026-10-11T12:00:00Z')

describe('studio publish state (SET-3)', () => {
  it('is not published while the event is inactive, even if it is public', () => {
    const state = studioPublishState({ is_active: false }, { is_public: true }, NOW)
    expect(state.published).toBe(false)
    expect(state.reachable).toBe(false)
    expect(publishResultMessage(state).tone).toBe('warning')
  })

  it('is published and reachable when active, public and inside the window', () => {
    const state = studioPublishState(
      { is_active: true },
      { is_public: true, active_from: '2026-10-01T00:00:00Z', active_until: '2026-12-01T00:00:00Z' },
      NOW
    )
    expect(state).toMatchObject({ published: true, reachable: true, window: 'open' })
    expect(publishResultMessage(state)).toEqual({
      tone: 'success',
      message: '¡Evento publicado! Ya está visible para los invitados.',
    })
  })

  it('warns instead of claiming visibility when the access window is closed', () => {
    expect(publishWindowState({ active_from: '2026-11-01T00:00:00Z' }, NOW)).toBe('not_started')
    expect(publishWindowState({ active_until: '2026-10-01T00:00:00Z' }, NOW)).toBe('ended')
    expect(publishWindowState({ active_from: 'not-a-date' }, NOW)).toBe('open')

    const ended = studioPublishState({ is_active: true }, { is_public: true, active_until: '2026-10-01T00:00:00Z' }, NOW)
    expect(ended.published).toBe(true)
    expect(ended.reachable).toBe(false)
    expect(publishResultMessage(ended).tone).toBe('warning')
    expect(publishResultMessage(ended).message).toMatch(/ya terminó/)
  })
})
