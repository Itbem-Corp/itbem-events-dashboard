import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const detail = read('src/app/(app)/events/[id]/page.tsx')
const tabs = read('src/components/events/event-detail-tabs.tsx')
const share = read('src/components/events/event-share-panel.tsx')
const form = read('src/components/events/forms/event-form-modal.tsx')
const clients = read('src/app/(app)/clients/page.tsx')
const users = read('src/app/(app)/users/page.tsx')

describe('event detail header and summary (wave-2 visual/copy)', () => {
  it('uses theme tokens for KPI values instead of text-white (EVT-33)', () => {
    expect(detail).not.toMatch(/text-white tabular-nums/)
    expect(detail).toContain('break-words text-ink tabular-nums')
  })

  it('drops the removed event guest maximum from the summary (EVT-34)', () => {
    expect(detail).not.toContain("label: 'Máx. invitados'")
  })

  it('keeps the permission warning readable in light theme (EVT-32)', () => {
    expect(detail).toContain('text-amber-900 dark:text-amber-100')
    expect(detail).not.toMatch(/'border-amber-400\/25 bg-amber-400\/10 text-amber-100'/)
  })

  it('describes check-in and guest scopes accurately (ROLES-79)', () => {
    expect(detail).not.toContain('Puedes operar check-in y RSVP')
    expect(detail).toContain('Puedes registrar llegadas en check-in')
    expect(detail).toContain("eventCapabilities?.['guest:manage']")
  })

  it('wraps a very long event name inside the header (EVT-25)', () => {
    expect(detail).toContain('[overflow-wrap:anywhere]')
  })

  it('wraps tab groups on desktop instead of cutting the last tab (EVT-35)', () => {
    expect(tabs).toContain('md:flex-wrap')
  })
})

describe('Spanish copy in shared and event screens', () => {
  it('fixes accents and leftovers', () => {
    expect(share).not.toMatch(/pestana|codigo para/)
    expect(form).not.toContain('capacidad y publicación')
    expect(clients).not.toContain("'es'}")
    expect(users).not.toContain('clientes asociados')
    expect(users).not.toContain('${user.first_name} ${user.last_name}`')
  })
})

describe('home next-event card (ROLES-118)', () => {
  const home = read('src/app/(app)/page.tsx')
  it('keeps the Studio and open-event buttons on one aligned line', () => {
    expect(home).toContain('flex shrink-0 items-center gap-2 whitespace-nowrap')
  })
  it('uses readable status colors in light theme', () => {
    expect(home).toContain('text-emerald-700 dark:text-emerald-400')
    expect(home).toContain('text-amber-700 dark:text-amber-400')
  })
})
