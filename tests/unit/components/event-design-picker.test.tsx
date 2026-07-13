import { EventDesignPicker } from '@/components/events/event-design-picker'
import { api } from '@/lib/api'
import type { ColorPalette } from '@/models/ColorPalette'
import type { DesignTemplate } from '@/models/DesignTemplate'
import type { EventConfig } from '@/models/EventConfig'
import type { FontSet } from '@/models/FontSet'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
}))

vi.mock('swr', () => ({
  default: mocks.useSWR,
  mutate: mocks.mutate,
}))

vi.mock('@/lib/api', () => ({
  api: {
    put: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}))

const config: EventConfig = {
  id: 'event-1',
  event_id: 'event-1',
  created_at: '2026-07-05T00:00:00.000Z',
  updated_at: '2026-07-05T00:00:00.000Z',
  is_public: true,
  design_template_id: 'tpl-1',
}

const ts = {
  created_at: '2026-07-05T00:00:00.000Z',
  updated_at: '2026-07-05T00:00:00.000Z',
}

const templates: DesignTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Clasica',
    identifier: 'classic',
    ...ts,
  },
  {
    id: 'tpl-2',
    name: 'Moderna',
    identifier: 'modern',
    preview_image_url: 'https://cdn.example.com/modern.webp',
    default_font_set: {
      id: 'font-1',
      name: 'Elegante',
      ...ts,
    },
    ...ts,
  },
]

const palettes: ColorPalette[] = [
  {
    id: 'palette-1',
    name: 'Dorada',
    is_premium: false,
    patterns: [
      {
        id: 'pattern-1',
        color_palette_id: 'palette-1',
        color_id: 'color-1',
        key: 'PRIMARY',
        color: { id: 'color-1', name: 'Oro', value: '#c8a45d', ...ts },
        ...ts,
      },
    ],
    ...ts,
  },
]

const fontSets: FontSet[] = [
  {
    id: 'fontset-1',
    name: 'Editorial',
    patterns: [
      {
        id: 'font-pattern-1',
        font_set_id: 'fontset-1',
        font_id: 'font-2',
        key: 'HEADING',
        font: { id: 'font-2', name: 'Cormorant', family: 'Cormorant Garamond', ...ts },
        ...ts,
      },
    ],
    ...ts,
  },
]

describe('EventDesignPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key === '/events/event-1/config') return { data: config, error: null }
      if (key === '/catalogs/design-workspace') return { data: { templates, palettes, font_sets: fontSets }, error: null }
      return { data: undefined, error: null }
    })
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } })
    mocks.mutate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves selected template, palette, and font overrides', async () => {
    const onSaved = vi.fn()
    render(<EventDesignPicker eventId="event-1" onSaved={onSaved} />)

    fireEvent.click(screen.getByText('Moderna').closest('button') as HTMLButtonElement)
    fireEvent.click(screen.getByText('Dorada').closest('button') as HTMLButtonElement)
    fireEvent.click(screen.getByText('Editorial').closest('button') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: /Guardar dise/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/event-1/config', {
        design_template_id: 'tpl-2',
        color_palette_id: 'palette-1',
        font_set_id: 'fontset-1',
      })
    })
    expect(mocks.mutate).toHaveBeenCalledWith('/events/event-1/config')
    expect(onSaved).toHaveBeenCalledTimes(2)
    expect(onSaved).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        design_template_id: 'tpl-2',
        color_palette_id: 'palette-1',
        font_set_id: 'fontset-1',
      })
    )
  })

  it('does not show a false empty state while design catalogs are still loading', () => {
    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key === '/events/event-1/config') return { data: config, error: null, isLoading: false }
      return { data: undefined, error: null, isLoading: true }
    })

    render(<EventDesignPicker eventId="event-1" />)

    expect(screen.queryByText(/No hay catálogos de diseño disponibles/i)).not.toBeInTheDocument()
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('keeps cached design controls visible after a background refresh failure', () => {
    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key === '/events/event-1/config') return { data: config, error: new Error('offline'), isLoading: false }
      if (key === '/catalogs/design-workspace') return { data: { templates, palettes, font_sets: fontSets }, error: null, isLoading: false }
      return { data: undefined, error: null, isLoading: false }
    })

    render(<EventDesignPicker eventId="event-1" />)

    expect(screen.getByRole('status')).toHaveTextContent('Mostrando datos guardados mientras recuperamos el diseño')
    expect(screen.getByText('Moderna')).toBeInTheDocument()
    expect(screen.getByText('Dorada')).toBeInTheDocument()
  })

  it('clears palette and font overrides with null payload values', async () => {
    const configWithOverrides: EventConfig = {
      ...config,
      design_template_id: 'tpl-2',
      color_palette_id: 'palette-1',
      font_set_id: 'fontset-1',
    }

    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key === '/events/event-1/config') {
        return { data: configWithOverrides, error: null }
      }
      if (key === '/catalogs/design-workspace') return { data: { templates, palettes, font_sets: fontSets }, error: null }
      return { data: undefined, error: null }
    })

    render(<EventDesignPicker eventId="event-1" />)

    const useTemplateButtons = screen.getAllByText('Usar plantilla')
    fireEvent.click(useTemplateButtons[0].closest('button') as HTMLButtonElement)
    fireEvent.click(useTemplateButtons[1].closest('button') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: /Guardar dise/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/event-1/config', {
        color_palette_id: null,
        font_set_id: null,
      })
    })
  })

  it('shows persisted palette/font controls and template metadata', () => {
    render(<EventDesignPicker eventId="event-1" />)

    expect(screen.getByText('Paleta de colores')).toBeInTheDocument()
    expect(screen.getByText(/Tipograf/i)).toBeInTheDocument()
    expect(screen.getByText('Dorada')).toBeInTheDocument()
    expect(screen.getByText('Editorial')).toBeInTheDocument()
    expect(screen.getByText('Elegante')).toBeInTheDocument()
  })

  it('renders a useful generated preview for seeded templates without an uploaded image', () => {
    const seededTemplate: DesignTemplate = {
      id: 'tpl-seeded',
      name: 'Editorial Romance',
      identifier: 'editorial-romance',
      default_color_palette: {
        id: 'palette-seeded',
        name: 'Editorial Romance',
        is_premium: false,
        patterns: [
          {
            id: 'pattern-background',
            color_palette_id: 'palette-seeded',
            color_id: 'color-background',
            key: 'background',
            color: { id: 'color-background', name: 'Fondo', value: '#FFF8F5', ...ts },
            ...ts,
          },
          {
            id: 'pattern-surface',
            color_palette_id: 'palette-seeded',
            color_id: 'color-surface',
            key: 'surface',
            color: { id: 'color-surface', name: 'Superficie', value: '#FFFFFF', ...ts },
            ...ts,
          },
          {
            id: 'pattern-heading',
            color_palette_id: 'palette-seeded',
            color_id: 'color-heading',
            key: 'heading',
            color: { id: 'color-heading', name: 'Titular', value: '#102F3F', ...ts },
            ...ts,
          },
          {
            id: 'pattern-accent',
            color_palette_id: 'palette-seeded',
            color_id: 'color-accent',
            key: 'accent',
            color: { id: 'color-accent', name: 'Acento', value: '#DD2284', ...ts },
            ...ts,
          },
        ],
        ...ts,
      },
      ...ts,
    }

    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key === '/events/event-1/config') return { data: config, error: null }
      if (key === '/catalogs/design-workspace') {
        return { data: { templates: [seededTemplate], palettes: [], font_sets: [] }, error: null }
      }
      return { data: undefined, error: null }
    })

    render(<EventDesignPicker eventId="event-1" />)

    const preview = screen.getByRole('img', { name: 'Vista previa de Editorial Romance' })
    expect(preview).toHaveAttribute('data-template-palette-preview', 'editorial-romance')
    expect(preview).toHaveStyle({ backgroundColor: '#FFF8F5', borderColor: '#DD2284' })
    expect(screen.queryByAltText('Editorial Romance')).not.toBeInTheDocument()
  })

  it('normalizes raw Go design catalog payloads before rendering previews', () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.example.com/api')

    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key === '/events/event-1/config') {
        return {
          data: {
            ID: 'event-1',
            EventID: 'event-1',
            CreatedAt: '2026-07-05T00:00:00.000Z',
            UpdatedAt: '2026-07-05T00:00:00.000Z',
            IsPublic: true,
            DesignTemplateID: 'tpl-raw',
          } as unknown as EventConfig,
          error: null,
        }
      }
      if (key === '/catalogs/design-workspace') {
        return {
          data: { templates: [
            {
              ID: 'tpl-raw',
              Name: 'Raw Moderna',
              Identifier: 'raw-modern',
              PreviewURL: 'base/templates/raw-fallback.webp',
              PreviewViewURL: 'base/templates/raw.webp',
              ColorPaletteID: 'palette-raw',
              ColorPalette: {
                ID: 'palette-raw',
                Name: 'Raw Dorada',
                IsPremium: false,
                Patterns: [
                  {
                    ID: 'pattern-raw',
                    ColorPaletteID: 'palette-raw',
                    ColorID: 'color-raw',
                    Key: 'PRIMARY',
                    Color: {
                      ID: 'color-raw',
                      Name: 'Oro',
                      Value: '#d4af37',
                      HexCode: '#d4af37',
                    },
                  },
                ],
              },
              FontSetID: 'fontset-raw',
              FontSet: {
                ID: 'fontset-raw',
                Name: 'Raw Editorial',
              },
            },
          ] as unknown as DesignTemplate[], palettes, font_sets: fontSets },
          error: null,
        }
      }
      if (key === '/catalogs/color-palettes') {
        return {
          data: [
            {
              ID: 'palette-raw',
              Name: 'Raw Dorada',
              IsPremium: false,
              Patterns: [
                {
                  ID: 'pattern-raw',
                  ColorPaletteID: 'palette-raw',
                  ColorID: 'color-raw',
                  Role: 'PRIMARY',
                  Color: { ID: 'color-raw', Name: 'Oro', HexCode: '#d4af37' },
                },
              ],
            },
          ] as unknown as ColorPalette[],
          error: null,
        }
      }
      if (key === '/catalogs/font-sets') {
        return {
          data: [
            {
              ID: 'fontset-raw',
              Name: 'Raw Editorial',
              Patterns: [
                {
                  ID: 'font-pattern-raw',
                  FontSetID: 'fontset-raw',
                  FontID: 'font-raw',
                  Role: 'HEADING',
                  Font: {
                    ID: 'font-raw',
                    Name: 'Cormorant',
                    Family: 'Cormorant Garamond',
                    URL: 'base/fonts/cormorant.woff2',
                  },
                },
              ],
            },
          ] as unknown as FontSet[],
          error: null,
        }
      }
      return { data: undefined, error: null }
    })

    render(<EventDesignPicker eventId="event-1" />)

    expect(screen.getByText('Raw Moderna')).toBeInTheDocument()
    expect(screen.getByText('raw-modern')).toBeInTheDocument()
    expect(screen.getAllByText('Raw Dorada').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Raw Editorial').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('#d4af37').length).toBeGreaterThan(0)
    expect(screen.getByText('heading: Cormorant Garamond')).toBeInTheDocument()
    expect(screen.getByAltText('Raw Moderna')).toHaveAttribute(
      'src',
      'https://api.example.com/storage/base/templates/raw.webp'
    )
  })

  it('revalidates signed design catalogs before preview or font URLs expire', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'))

    mocks.useSWR.mockImplementation((key: string | null) => {
      if (key === '/events/event-1/config') return { data: config, error: null }
      if (key === '/catalogs/design-workspace') {
        return {
          data: { templates: [
            {
              ...templates[0],
              preview_view_url: 'https://signed.example.com/classic.webp',
              preview_view_url_expires_at: '2026-03-01T12:02:00.000Z',
            },
          ], palettes, font_sets: [
            {
              ...fontSets[0],
              patterns: [
                {
                  ...fontSets[0].patterns![0],
                  font: {
                    ...fontSets[0].patterns![0].font!,
                    view_url: 'https://signed.example.com/cormorant.woff2',
                    view_url_expires_at: '2026-03-01T12:05:00.000Z',
                  },
                },
              ],
            },
          ] },
          error: null,
        }
      }
      return { data: undefined, error: null }
    })

    render(<EventDesignPicker eventId="event-1" />)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(mocks.mutate).not.toHaveBeenCalledWith('/catalogs/design-workspace')

    await vi.advanceTimersByTimeAsync(1)

    expect(mocks.mutate).toHaveBeenCalledWith('/catalogs/design-workspace')
  })
})
