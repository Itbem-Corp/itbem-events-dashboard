import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EventDetailSettingsPanel } from '@/components/events/event-detail-settings-panel'
import { EVENT_SECTIONS_SETTINGS_ANCHOR, eventSectionsSettingsHref } from '@/lib/event-settings-anchor'
import type { Event } from '@/models/Event'

vi.mock('@/components/events/event-config-panel', () => ({ EventConfigPanel: () => null }))
vi.mock('@/components/events/event-design-picker', () => ({ EventDesignPicker: () => null }))
vi.mock('@/components/events/event-sections-manager', () => ({ EventSectionsManager: () => <p>gestor</p> }))
vi.mock('@/components/events/event-share-panel', () => ({ EventSharePanel: () => null }))

// QA STU-6: Studio's "Agregar secciones" landed on Configuración with the
// sections block closed and further down the page.
describe('sections block anchor', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('links Studio to the sections block of Configuración', () => {
    expect(eventSectionsSettingsHref('evt-1')).toBe(`/events/evt-1?tab=configuracion#${EVENT_SECTIONS_SETTINGS_ANCHOR}`)
  })

  it('opens the sections block when the URL hash points at it', () => {
    window.history.replaceState(null, '', `/events/evt-1?tab=configuracion#${EVENT_SECTIONS_SETTINGS_ANCHOR}`)
    Element.prototype.scrollIntoView = vi.fn()
    render(<EventDetailSettingsPanel event={{ id: 'evt-1' } as Event} onPublicContentChanged={() => {}} />)
    const block = document.getElementById(EVENT_SECTIONS_SETTINGS_ANCHOR) as HTMLDetailsElement
    expect(block).not.toBeNull()
    expect(block.open).toBe(true)
    expect(screen.getByText('gestor')).toBeTruthy()
  })

  it('keeps the sections block closed without the hash', () => {
    render(<EventDetailSettingsPanel event={{ id: 'evt-1' } as Event} onPublicContentChanged={() => {}} />)
    const block = document.getElementById(EVENT_SECTIONS_SETTINGS_ANCHOR) as HTMLDetailsElement
    expect(block.open).toBe(false)
  })
})
