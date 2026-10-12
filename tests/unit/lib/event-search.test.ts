import { describe, expect, it } from 'vitest'

import { eventMatchesSearch, normalizeEventSearchText } from '@/lib/event-search'

// EVT-10: "nandu" did not find "Ñandú".
describe('event search text', () => {
  it('ignores accents and case', () => {
    expect(normalizeEventSearchText('  Ñandú ÉXITO ')).toBe('nandu exito')
    expect(eventMatchesSearch({ name: 'Boda Ñandú' }, 'nandu')).toBe(true)
    expect(eventMatchesSearch({ name: 'XV años', identifier: 'xv-anos-sofia' }, 'SOFÍA')).toBe(true)
    expect(eventMatchesSearch({ name: 'Boda Ana' }, 'luis')).toBe(false)
    expect(eventMatchesSearch({ name: 'Boda Ana' }, '   ')).toBe(true)
  })
})
