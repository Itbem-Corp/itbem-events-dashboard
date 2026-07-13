import { normalizeKeys, toSnakeCase } from '@/lib/normalizer'
import { describe, expect, it } from 'vitest'

describe('toSnakeCase', () => {
  it('converts simple PascalCase to snake_case', () => {
    expect(toSnakeCase('FirstName')).toBe('first_name')
    expect(toSnakeCase('LastName')).toBe('last_name')
  })

  it('converts camelCase to snake_case', () => {
    expect(toSnakeCase('cognitoSub')).toBe('cognito_sub')
    expect(toSnakeCase('isActive')).toBe('is_active')
  })

  it('handles consecutive uppercase letters (acronyms)', () => {
    expect(toSnakeCase('HTMLParser')).toBe('html_parser')
    expect(toSnakeCase('APIKey')).toBe('api_key')
  })

  it('returns already snake_case strings unchanged', () => {
    expect(toSnakeCase('first_name')).toBe('first_name')
    expect(toSnakeCase('is_active')).toBe('is_active')
  })

  it('converts single word correctly', () => {
    expect(toSnakeCase('Email')).toBe('email')
    expect(toSnakeCase('Id')).toBe('id')
  })
})

describe('normalizeKeys', () => {
  it('normalizes keys of a flat object', () => {
    const result = normalizeKeys({ FirstName: 'John', LastName: 'Doe' })
    expect(result).toEqual({ first_name: 'John', last_name: 'Doe' })
  })

  it('passes through null', () => {
    expect(normalizeKeys(null)).toBeNull()
  })

  it('passes through primitives', () => {
    expect(normalizeKeys(42)).toBe(42)
    expect(normalizeKeys('hello')).toBe('hello')
    expect(normalizeKeys(true)).toBe(true)
  })

  it('normalizes keys recursively in nested objects', () => {
    const result = normalizeKeys({
      UserData: {
        FirstName: 'Jane',
        Address: { StreetName: 'Main St' },
      },
    })
    expect(result).toEqual({
      user_data: {
        first_name: 'Jane',
        address: { street_name: 'Main St' },
      },
    })
  })

  it('normalizes keys in arrays of objects', () => {
    const result = normalizeKeys([
      { EventName: 'Party', IsActive: true },
      { EventName: 'Concert', IsActive: false },
    ])
    expect(result).toEqual([
      { event_name: 'Party', is_active: true },
      { event_name: 'Concert', is_active: false },
    ])
  })

  it('handles arrays nested inside objects', () => {
    const result = normalizeKeys({
      EventList: [{ EventId: 1 }, { EventId: 2 }],
    })
    expect(result).toEqual({
      event_list: [{ event_id: 1 }, { event_id: 2 }],
    })
  })

  it('adds dashboard aliases for guest response fields', () => {
    const result = normalizeKeys({
      GuestStatusID: 'status-1',
      GuestStatus: { Code: 'CONFIRMED' },
      Image1URL: 'one.jpg',
      Image2URL: 'two.jpg',
      Image3URL: 'three.jpg',
    })

    expect(result).toMatchObject({
      guest_status_id: 'status-1',
      status_id: 'status-1',
      guest_status: { code: 'CONFIRMED' },
      status: { code: 'CONFIRMED' },
      image1_url: 'one.jpg',
      image_1_url: 'one.jpg',
      image2_url: 'two.jpg',
      image_2_url: 'two.jpg',
      image3_url: 'three.jpg',
      image_3_url: 'three.jpg',
    })
  })

  it('does not overwrite explicit alias fields', () => {
    const result = normalizeKeys({
      GuestStatusID: 'status-1',
      StatusID: 'status-2',
    })

    expect(result).toMatchObject({
      guest_status_id: 'status-1',
      status_id: 'status-2',
    })
  })

  it('adds dashboard aliases for design template previews', () => {
    const result = normalizeKeys({
      Identifier: 'classic-elegant',
      PreviewURL: 'https://cdn.example.com/template.webp',
      PreviewViewURL: 'https://signed.example.com/template.webp',
      PreviewViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
      ColorPaletteID: 'palette-1',
      ColorPalette: { Name: 'Dorada' },
      FontSetID: 'font-1',
      FontSet: {
        Name: 'Elegante',
        Patterns: [
          {
            Role: 'HEADING',
            Font: {
              Name: 'Cormorant Garamond',
              URL: 'base/fonts/cormorant.woff2',
              ViewURL: 'https://signed.example.com/cormorant.woff2',
              ViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
            },
          },
        ],
      },
    })

    expect(result).toMatchObject({
      preview_url: 'https://cdn.example.com/template.webp',
      preview_image_url: 'https://cdn.example.com/template.webp',
      preview_view_url: 'https://signed.example.com/template.webp',
      preview_view_url_expires_at: '2026-03-01T12:05:00.000Z',
      color_palette_id: 'palette-1',
      default_color_palette_id: 'palette-1',
      color_palette: { name: 'Dorada' },
      default_color_palette: { name: 'Dorada' },
      font_set_id: 'font-1',
      default_font_set_id: 'font-1',
      font_set: {
        name: 'Elegante',
        patterns: [
          {
            role: 'HEADING',
            font: {
              name: 'Cormorant Garamond',
              url: 'base/fonts/cormorant.woff2',
              view_url: 'https://signed.example.com/cormorant.woff2',
              view_url_expires_at: '2026-03-01T12:05:00.000Z',
            },
          },
        ],
      },
      default_font_set: {
        name: 'Elegante',
        patterns: [
          {
            role: 'HEADING',
            font: {
              name: 'Cormorant Garamond',
              url: 'base/fonts/cormorant.woff2',
              view_url: 'https://signed.example.com/cormorant.woff2',
              view_url_expires_at: '2026-03-01T12:05:00.000Z',
            },
          },
        ],
      },
    })
  })

  it('does not turn EventConfig overrides into design-template defaults', () => {
    const result = normalizeKeys({
      ID: 'event-1',
      EventID: 'event-1',
      Identifier: 'boda-demo',
      IsPublic: true,
      ColorPaletteID: 'palette-override',
      ColorPalette: { Name: 'Override palette' },
      FontSetID: 'font-override',
      FontSet: { Name: 'Override fonts' },
    })

    expect(result).toMatchObject({
      event_id: 'event-1',
      color_palette_id: 'palette-override',
      color_palette: { name: 'Override palette' },
      font_set_id: 'font-override',
      font_set: { name: 'Override fonts' },
    })
    expect(result).not.toHaveProperty('default_color_palette_id')
    expect(result).not.toHaveProperty('default_color_palette')
    expect(result).not.toHaveProperty('default_font_set_id')
    expect(result).not.toHaveProperty('default_font_set')
  })

  it('normalizes EventSection API keys used by studio and public PageSpec tooling', () => {
    const result = normalizeKeys({
      ID: 'section-1',
      EventID: 'event-1',
      ComponentType: 'AgendaSection',
      ContentJSON: { Title: 'Programa' },
      Config: {
        targetDate: '2026-08-15T20:30',
        venueText: 'Salon Central',
        mapUrl: 'https://maps.example.com/embed',
      },
      IsVisible: true,
      CreatedAt: '2026-07-08T00:00:00Z',
    })

    expect(result).toEqual({
      id: 'section-1',
      event_id: 'event-1',
      component_type: 'AgendaSection',
      content_json: { Title: 'Programa' },
      config: {
        targetDate: '2026-08-15T20:30',
        venueText: 'Salon Central',
        mapUrl: 'https://maps.example.com/embed',
      },
      is_visible: true,
      created_at: '2026-07-08T00:00:00Z',
    })
  })

  it('normalizes event config aliases while preserving only section JSON config values', () => {
    const result = normalizeKeys({
      ID: 'event-1',
      Config: {
        IsPublic: true,
        ShowMomentWall: false,
        ShareUploadsEnabled: true,
      },
      EventConfig: {
        IsPublic: false,
      },
      Sections: [
        {
          ID: 'section-1',
          ComponentType: 'EventVenue',
          Config: {
            VenueText: 'Salon Central',
            mapUrl: 'https://maps.example.com/embed',
          },
        },
      ],
    })

    expect(result).toEqual({
      id: 'event-1',
      config: {
        is_public: true,
        show_moment_wall: false,
        share_uploads_enabled: true,
      },
      event_config: {
        is_public: false,
      },
      sections: [
        {
          id: 'section-1',
          component_type: 'EventVenue',
          config: {
            VenueText: 'Salon Central',
            mapUrl: 'https://maps.example.com/embed',
          },
        },
      ],
    })
  })
})
