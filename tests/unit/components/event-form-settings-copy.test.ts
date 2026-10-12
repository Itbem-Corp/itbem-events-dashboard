import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const form = readFileSync(resolve(process.cwd(), 'src/components/events/forms/event-form-modal.tsx'), 'utf8')

describe('event form settings that do nothing are gone', () => {
  it('offers no English language option (SET-9)', () => {
    expect(form).not.toContain("label: 'English'")
    expect(form).not.toContain('Idioma del evento')
  })

  it('has no event-level guest maximum (SET-10)', () => {
    expect(form).not.toContain('Máximo de invitados')
    expect(form).not.toContain("register('max_guests'")
  })
})

describe('event active copy (EVT-13 / SET-5)', () => {
  it('says the switch controls guest access and confirms before deactivating', () => {
    expect(form).not.toContain('operación interna')
    expect(form).toContain('Controla el acceso de los invitados')
    expect(form).toContain('window.confirm(DEACTIVATE_EVENT_CONFIRMATION)')
  })
})

describe('event active switch layout (STU-2)', () => {
  it('does not let the flex row squeeze the switch into a 20x20 circle', () => {
    const block = form.slice(form.indexOf('<Label>Evento activo</Label>') - 300, form.indexOf('aria-label="Evento activo:'))
    expect(block).toContain('min-w-0 flex-1')
    expect(block).toContain('className="shrink-0"')
  })
})
