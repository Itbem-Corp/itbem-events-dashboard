import { getTypeMeta } from '@/components/studio/studio-constants'
import { describe, expect, it } from 'vitest'

describe('studio section type metadata', () => {
  it('recognizes legacy public section types editable from Studio', () => {
    expect(getTypeMeta('MAP').label).toBe('Mapa')
    expect(getTypeMeta('AgendaSection').label).toBe('Agenda')
    expect(getTypeMeta('SCHEDULE').label).toBe('Agenda legacy')
    expect(getTypeMeta('Hosts').label).toBe('Anfitriones')
    expect(getTypeMeta('HostSection').label).toBe('Anfitriones')
    expect(getTypeMeta('HostsSection').label).toBe('Anfitriones')
    expect(getTypeMeta('Contact').label).toBe('Contacto')
    expect(getTypeMeta('ContactSection').label).toBe('Contacto')
    expect(getTypeMeta('LegacyHero').label).toBe('Portada clasica')
    expect(getTypeMeta('LegacyText').label).toBe('Texto libre')
    expect(getTypeMeta('LegacyGallery').label).toBe('Galeria')
    expect(getTypeMeta('LegacyMap').label).toBe('Mapa')
    expect(getTypeMeta('LegacySchedule').label).toBe('Agenda legacy')
    expect(getTypeMeta('LegacyMusic').label).toBe('Musica')
  })
})
