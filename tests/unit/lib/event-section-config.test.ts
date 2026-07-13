import { hasEventSectionConfig, readEventSectionConfig } from '@/lib/event-section-config'
import type { EventSection } from '@/models/EventSection'
import { describe, expect, it } from 'vitest'

describe('event-section-config', () => {
  it('reads object configs from the backend EventSection contract', () => {
    expect(readEventSectionConfig({ config: { title: 'Mapa' } } as unknown as EventSection)).toEqual({
      title: 'Mapa',
    })
  })

  it('falls back to the legacy content_json alias when config is missing', () => {
    expect(readEventSectionConfig({ content_json: { subtitle: 'Fotos' } } as unknown as EventSection)).toEqual({
      subtitle: 'Fotos',
    })
  })

  it('falls back to content_json when canonical config is empty', () => {
    expect(
      readEventSectionConfig({
        config: {},
        content_json: { title: 'Agenda legacy' },
      } as unknown as EventSection)
    ).toEqual({
      title: 'Agenda legacy',
    })
  })

  it('unwraps legacy encoded JSON string configs', () => {
    expect(readEventSectionConfig({ config: '{"title":"Ubicacion"}' } as unknown as EventSection)).toEqual({
      title: 'Ubicacion',
    })
  })

  it('reads raw Go and camel aliases when the API interceptor has not normalized keys yet', () => {
    expect(readEventSectionConfig({ Config: { title: 'Hero' } } as unknown as EventSection)).toEqual({
      title: 'Hero',
    })
    expect(readEventSectionConfig({ contentJson: '{"title":"Agenda"}' } as unknown as EventSection)).toEqual({
      title: 'Agenda',
    })
    expect(readEventSectionConfig({ ContentJSON: { title: 'Galeria' } } as unknown as EventSection)).toEqual({
      title: 'Galeria',
    })
  })

  it('keeps public camelCase section config keys after API normalization skips JSONB values', () => {
    expect(
      readEventSectionConfig({
        component_type: 'EventVenue',
        config: {
          text: 'Te esperamos',
          venueText: 'Salon Central',
          mapUrl: 'https://maps.example/embed',
        },
      } as unknown as EventSection)
    ).toEqual({
      text: 'Te esperamos',
      venueText: 'Salon Central',
      mapUrl: 'https://maps.example/embed',
    })
  })

  it('normalizes known section config aliases for dashboard editors', () => {
    expect(
      readEventSectionConfig({
        ComponentType: 'EventVenue',
        Config: {
          Description: 'Te esperamos',
          EventDate: 'Sabado 15 de agosto',
          VenueText: 'Salon Central',
          MapURL: 'https://maps.example/embed',
        },
      } as unknown as EventSection)
    ).toMatchObject({
      text: 'Te esperamos',
      date: 'Sabado 15 de agosto',
      venueText: 'Salon Central',
      mapUrl: 'https://maps.example/embed',
    })

    expect(
      readEventSectionConfig({
        component_type: 'CountdownHeader',
        config: { Heading: 'El gran dia', target_date: '2026-08-15T20:30' },
      } as unknown as EventSection)
    ).toMatchObject({
      heading: 'El gran dia',
      targetDate: '2026-08-15T20:30',
    })
  })

  it('normalizes public renderer aliases used by page-spec section configs', () => {
    expect(
      readEventSectionConfig({
        ComponentType: 'Reception',
        Config: {
          venue: 'Jardin central',
          googleMapsURL: 'https://maps.example.com/reception',
        },
      } as unknown as EventSection)
    ).toMatchObject({
      venueText: 'Jardin central',
      mapUrl: 'https://maps.example.com/reception',
    })

    expect(
      readEventSectionConfig({
        ComponentType: 'RSVPConfirmation',
        Config: {
          DefaultWelcomeMessage: 'Confirma tu asistencia',
          defaultThankYouMessage: 'Gracias por acompanarnos',
          GuestSignatureTitle: 'Tu pase',
        },
      } as unknown as EventSection)
    ).toMatchObject({
      welcome_message: 'Confirma tu asistencia',
      thank_you_message: 'Gracias por acompanarnos',
      guest_signature_title: 'Tu pase',
    })

    expect(
      readEventSectionConfig({
        ComponentType: 'LegacyMap',
        Config: {
          Description: 'Entrada por avenida principal',
          GoogleMapsUrl: 'https://maps.example.com/legacy',
        },
      } as unknown as EventSection)
    ).toMatchObject({
      content: 'Entrada por avenida principal',
      mapUrl: 'https://maps.example.com/legacy',
    })

    expect(
      readEventSectionConfig({
        ComponentType: 'LegacyMusic',
        Config: {
          URL: 'https://cdn.example.com/song.mp3',
        },
      } as unknown as EventSection)
    ).toMatchObject({
      musicUrl: 'https://cdn.example.com/song.mp3',
    })
  })

  it('normalizes MomentWall runtime aliases from backend and public payloads', () => {
    expect(
      readEventSectionConfig({
        ComponentType: 'MomentWall',
        Config: {
          Identifier: 'boda-ana-luis',
          MomentRequestMessage: 'Sube tu foto favorita',
          allowUploads: true,
          AllowMessages: false,
          AutoApproveUploads: true,
          showMomentWall: false,
          sharedUploadsEnabled: true,
          MaxUploadsPerGuest: '25',
        },
      } as unknown as EventSection)
    ).toMatchObject({
      identifier: 'boda-ana-luis',
      moment_request_message: 'Sube tu foto favorita',
      allow_uploads: true,
      allow_messages: false,
      auto_approve_uploads: true,
      moments_wall_published: false,
      show_moment_wall: false,
      share_uploads_enabled: true,
      max_uploads_per_guest: 25,
    })
  })

  it('normalizes MomentWall operational state like the public renderer', () => {
    expect(
      readEventSectionConfig({
        ComponentType: 'MomentWall',
        Config: {
          allow_uploads: true,
          moments_wall_published: true,
          share_uploads_enabled: true,
          maxUploadsPerGuest: '18.7',
        },
      } as unknown as EventSection)
    ).toMatchObject({
      allow_uploads: false,
      moments_wall_published: true,
      show_moment_wall: true,
      share_uploads_enabled: false,
      max_uploads_per_guest: 18,
    })

    expect(
      readEventSectionConfig({
        ComponentType: 'MomentWall',
        Config: {
          sharedUploadsEnabled: true,
          showMomentWall: false,
        },
      } as unknown as EventSection)
    ).toMatchObject({
      allow_uploads: true,
      moments_wall_published: false,
      show_moment_wall: false,
      share_uploads_enabled: true,
    })
  })

  it('normalizes agenda item aliases without dropping raw config fields', () => {
    const config = readEventSectionConfig({
      componentType: 'AgendaSection',
      contentJson: {
        Title: 'Programa',
        Items: [{ Time: '20:00', Name: 'Cena', Location: 'Salon' }],
      },
    } as unknown as EventSection)

    expect(config).toMatchObject({
      Title: 'Programa',
      title: 'Programa',
      Items: [{ Time: '20:00', Name: 'Cena', Location: 'Salon' }],
      items: [{ Time: '20:00', Name: 'Cena', Location: 'Salon', time: '20:00', title: 'Cena', location: 'Salon' }],
    })
  })

  it('falls back to later config aliases when canonical fields are null', () => {
    expect(
      readEventSectionConfig({
        config: null,
        Config: { title: 'Hero desde adapter' },
        content_json: { title: 'Legacy' },
      } as unknown as EventSection)
    ).toEqual({
      title: 'Hero desde adapter',
    })
  })

  it('falls back to later config aliases when canonical fields are blank', () => {
    expect(
      readEventSectionConfig({
        component_type: ' ',
        ComponentType: 'RSVPConfirmation',
        config: ' ',
        Config: {
          DefaultWelcomeMessage: 'Confirma tu asistencia',
        },
        content_json: { title: 'Legacy' },
      } as unknown as EventSection)
    ).toMatchObject({
      DefaultWelcomeMessage: 'Confirma tu asistencia',
      welcome_message: 'Confirma tu asistencia',
    })

    expect(
      readEventSectionConfig({
        config: ' ',
        content_json: ' ',
        ContentJSON: { title: 'Galeria desde Go' },
      } as unknown as EventSection)
    ).toEqual({
      title: 'Galeria desde Go',
    })
  })

  it('falls back to content_json when canonical config is an empty JSON string', () => {
    expect(
      readEventSectionConfig({
        config: '{}',
        content_json: '{"title":"Mapa legacy"}',
      } as unknown as EventSection)
    ).toEqual({
      title: 'Mapa legacy',
    })
  })

  it('returns an empty object for invalid or non-object configs', () => {
    expect(readEventSectionConfig({ config: '{bad json}' } as unknown as EventSection)).toEqual({})
    expect(readEventSectionConfig({ config: ['not', 'an', 'object'] } as unknown as EventSection)).toEqual({})
  })

  it('checks whether a section has editable config data', () => {
    expect(hasEventSectionConfig({ config: { title: 'Mapa' } } as unknown as EventSection)).toBe(true)
    expect(hasEventSectionConfig({ config: {} } as EventSection)).toBe(false)
    expect(hasEventSectionConfig({ config: '{"title":"Mapa"}' } as unknown as EventSection)).toBe(true)
  })
})
