import SectionConfigEditor from '@/components/studio/section-config-editor'
import type { EventSection } from '@/models/EventSection'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
})

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span>,
  },
}))

function section(componentType: string, config: Record<string, unknown> = {}): EventSection {
  return {
    id: `${componentType}-section`,
    event_id: 'event-1',
    created_at: '2026-07-05T00:00:00.000Z',
    updated_at: '2026-07-05T00:00:00.000Z',
    name: componentType,
    component_type: componentType,
    order: 1,
    is_visible: true,
    config,
  }
}

describe('SectionConfigEditor public aliases', () => {
  it('edits ContactSection with the text section form', () => {
    render(
      <SectionConfigEditor
        section={section('ContactSection', { content: 'Contacto' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Contenido')).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('edits HostsSection with the graduates/hosts form', () => {
    render(
      <SectionConfigEditor
        section={section('HostsSection', { closing: 'Gracias' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Texto de cierre')).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('edits HostSection with the graduates/hosts form', () => {
    render(
      <SectionConfigEditor
        section={section('HostSection', { closing: 'Gracias' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Texto de cierre')).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('edits AgendaSection with the agenda form', () => {
    render(<SectionConfigEditor section={section('AgendaSection', { items: [] })} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Actividades')).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('edits LegacyHero with the classic hero form', () => {
    render(
      <SectionConfigEditor section={section('LegacyHero', { title: 'Portada' })} onSave={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByText('Texto de portada')).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('edits LegacyMap with the map form', () => {
    render(
      <SectionConfigEditor
        section={section('LegacyMap', { mapUrl: 'https://maps.example/embed' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('URL de mapa (embed)')).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('edits imported uppercase aliases with public section forms', () => {
    render(
      <SectionConfigEditor section={section('HOSTS', { closing: 'Gracias' })} onSave={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByText('Texto de cierre')).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('edits underscore aliases with the matching public section form', () => {
    render(<SectionConfigEditor section={section('PHOTO_GRID', {})} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText(/Gestiona sus imagenes desde recursos/i)).toBeInTheDocument()
    expect(screen.queryByText('Configuracion (JSON)')).not.toBeInTheDocument()
  })

  it('reports auto-save failures instead of showing a false success', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockRejectedValue(new Error('offline'))
    render(
      <SectionConfigEditor
        section={section('ContactSection', { content: 'Contacto' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: 'Nuevo contenido' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'ContactSection-section' }), {
      content: 'Nuevo contenido',
    })
    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument()
  })
})
