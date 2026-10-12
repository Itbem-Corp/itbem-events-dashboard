import SectionConfigEditor, { SECTION_DISCARD_UNSAVED_MESSAGE } from '@/components/studio/section-config-editor'
import { SectionConflictError } from '@/lib/section-conflict'
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
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
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
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
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
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
  })

  it('edits AgendaSection with the agenda form', () => {
    render(<SectionConfigEditor section={section('AgendaSection', { items: [] })} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Actividades')).toBeInTheDocument()
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
  })

  it('edits LegacyHero with the classic hero form', () => {
    render(
      <SectionConfigEditor section={section('LegacyHero', { title: 'Portada' })} onSave={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByText('Texto de portada')).toBeInTheDocument()
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
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
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
  })

  it('edits imported uppercase aliases with public section forms', () => {
    render(
      <SectionConfigEditor section={section('HOSTS', { closing: 'Gracias' })} onSave={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByText('Texto de cierre')).toBeInTheDocument()
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
  })

  it('edits underscore aliases with the matching public section form', () => {
    render(<SectionConfigEditor section={section('PHOTO_GRID', {})} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText(/Gestiona sus imágenes desde recursos/i)).toBeInTheDocument()
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
  })

  it('saves the moment wall subtitle under config.subtitle (STU-16)', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionConfigEditor section={section('MomentWall', { title: 'Momentos' })} onSave={onSave} onClose={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText('Subtítulo'), { target: { value: 'Comparte la fiesta' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'MomentWall-section' }),
      {
        title: 'Momentos',
        subtitle: 'Comparte la fiesta',
      },
      '2026-07-05T00:00:00.000Z'
    )
  })

  it('lets the host edit the heading of hosts/graduates and the title of text sections (STU-15 / STU-17)', () => {
    const { unmount } = render(
      <SectionConfigEditor section={section('Hosts', { closing: 'Gracias' })} onSave={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByLabelText('Encabezado')).toHaveAttribute('placeholder', 'Anfitriones')
    unmount()

    render(<SectionConfigEditor section={section('ContactSection', {})} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Título')).toBeInTheDocument()
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

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ContactSection-section' }),
      {
        content: 'Nuevo contenido',
      },
      '2026-07-05T00:00:00.000Z'
    )
    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument()
  })
})

describe('SectionConfigEditor pending saves (STU-20)', () => {
  it('flushes the pending edit when Cerrar is clicked before the debounce', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<SectionConfigEditor section={section('TEXT', { content: 'A' })} onSave={onSave} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: 'Último cambio' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'TEXT-section' }),
      { content: 'Último cambio' },
      '2026-07-05T00:00:00.000Z'
    )
    expect(onClose).toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('flushes the pending edit when the editor unmounts (tab switch, drag, other section, Volver)', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(
      <SectionConfigEditor section={section('TEXT', { content: 'A' })} onSave={onSave} onClose={vi.fn()} />
    )

    fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: 'No perder' } })
    unmount()

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'TEXT-section' }),
      { content: 'No perder' },
      '2026-07-05T00:00:00.000Z'
    )
  })

  it('does not save on unmount when nothing is pending', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(
      <SectionConfigEditor section={section('TEXT', { content: 'A' })} onSave={onSave} onClose={vi.fn()} />
    )
    unmount()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('warns before unload while a save is pending or failed', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockRejectedValue(new Error('offline'))
    render(<SectionConfigEditor section={section('TEXT', { content: 'A' })} onSave={onSave} onClose={vi.fn()} />)

    const unloadEvent = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    expect(unloadEvent()).toBe(false)
    fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: 'B' } })
    expect(unloadEvent()).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    // A failed save keeps the warning until a later save succeeds.
    expect(unloadEvent()).toBe(true)
  })
})

describe('SectionConfigEditor discarding failed saves (review F11)', () => {
  // happy-dom has no window.confirm; each test installs its own answer.
  function stubConfirm(answer: boolean) {
    const confirm = vi.fn(() => answer)
    Object.defineProperty(window, 'confirm', { value: confirm, configurable: true, writable: true })
    return confirm
  }

  async function failOnce() {
    vi.useFakeTimers()
    const onSave = vi.fn().mockRejectedValue(new Error('offline'))
    const onClose = vi.fn()
    const onDiscardFailedSave = vi.fn()
    render(
      <SectionConfigEditor
        section={section('TEXT', { content: 'A' })}
        onSave={onSave}
        onClose={onClose}
        onDiscardFailedSave={onDiscardFailedSave}
      />
    )
    fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: 'B' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(screen.getByText('No se pudo guardar')).toBeInTheDocument()
    return { onSave, onClose, onDiscardFailedSave }
  }

  it('asks before closing after a failed save and stops the warning when the user discards', async () => {
    const confirm = stubConfirm(true)
    const { onSave, onClose, onDiscardFailedSave } = await failOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(confirm).toHaveBeenCalledWith(SECTION_DISCARD_UNSAVED_MESSAGE)
    expect(onDiscardFailedSave).toHaveBeenCalledWith('TEXT-section')
    expect(onClose).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('stays open and keeps the warning when the user cancels the close', async () => {
    const confirm = stubConfirm(false)
    const { onClose, onDiscardFailedSave } = await failOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onDiscardFailedSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the warning when the editor unmounts without the user choosing', async () => {
    const confirm = stubConfirm(true)
    vi.useFakeTimers()
    const onDiscardFailedSave = vi.fn()
    const { unmount } = render(
      <SectionConfigEditor
        section={section('TEXT', { content: 'A' })}
        onSave={vi.fn().mockRejectedValue(new Error('offline'))}
        onClose={vi.fn()}
        onDiscardFailedSave={onDiscardFailedSave}
      />
    )
    fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: 'B' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    unmount()

    expect(confirm).not.toHaveBeenCalled()
    expect(onDiscardFailedSave).not.toHaveBeenCalled()
  })

  it('clears a stale failure when the editor is closed without changes', () => {
    const confirm = stubConfirm(true)
    const onDiscardFailedSave = vi.fn()
    render(
      <SectionConfigEditor
        section={section('TEXT', { content: 'A' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDiscardFailedSave={onDiscardFailedSave}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(onDiscardFailedSave).toHaveBeenCalledWith('TEXT-section')
  })
})

describe('SectionConfigEditor raw JSON editor (STU-21)', () => {
  it.each([
    ['null', /debe ser un objeto JSON/],
    ['[1, 2]', /debe ser un objeto JSON/],
    ['5', /debe ser un objeto JSON/],
    ['{"title": ', /JSON inválido/],
  ])('shows an inline error and does not save for %s', async (text, message) => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionConfigEditor section={section('CustomWidget', { title: 'Muro' })} onSave={onSave} onClose={vi.fn()} />
    )

    const textarea = screen.getByLabelText('Configuración (JSON)')
    fireEvent.change(textarea, { target: { value: text } })

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(textarea).toHaveValue(text)
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves a valid object and clears the error', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionConfigEditor section={section('CustomWidget', { title: 'Muro' })} onSave={onSave} onClose={vi.fn()} />
    )

    const textarea = screen.getByLabelText('Configuración (JSON)')
    fireEvent.change(textarea, { target: { value: 'null' } })
    fireEvent.change(textarea, { target: { value: '{"title": "Nuevo"}' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'CustomWidget-section' }),
      { title: 'Nuevo' },
      '2026-07-05T00:00:00.000Z'
    )
  })

  it('does not crash the agenda editor when items is not an array', () => {
    render(<SectionConfigEditor section={section('Agenda', { items: 'nope' })} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Actividades')).toBeInTheDocument()
  })
})

describe('SectionConfigEditor countdown date', () => {
  it('shows the section date and resets it to the event date', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SectionConfigEditor
        section={section('CountdownHeader', { heading: 'Hola', targetDate: '2026-12-01T18:00' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Fecha y hora de la cuenta regresiva')).toHaveValue('2026-12-01T18:00')
    expect(screen.getByText('La cuenta regresiva usa esta fecha, en la hora del evento.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Usar la fecha del evento' }))
    expect(screen.getByLabelText('Fecha y hora de la cuenta regresiva')).toHaveValue('')
    expect(screen.getByText('Sin fecha propia: la cuenta regresiva usa la fecha del evento.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usar la fecha del evento' })).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'CountdownHeader-section' }),
      { heading: 'Hola' },
      '2026-07-05T00:00:00.000Z'
    )
  })

  it('stores a picked date without a zone (read in the event time zone)', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<SectionConfigEditor section={section('CountdownHeader', {})} onSave={onSave} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Fecha y hora de la cuenta regresiva'), {
      target: { value: '2027-01-02T10:30' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.anything(),
      { targetDate: '2027-01-02T10:30' },
      '2026-07-05T00:00:00.000Z'
    )
  })
})

describe('SectionConfigEditor MomentWall', () => {
  it('offers only the copy the backend honours and points to the event settings for the flags', () => {
    render(
      <SectionConfigEditor
        section={section('MomentWall', { title: 'Muro', allow_uploads: true, published: true })}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Título')).toHaveValue('Muro')
    expect(screen.getByLabelText('Subtítulo')).toBeInTheDocument()
    expect(screen.getByLabelText('Mensaje para pedir fotos')).toBeInTheDocument()
    expect(screen.queryByText('Configuración (JSON)')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'configuración del evento' })).toHaveAttribute(
      'href',
      '/events/event-1?tab=configuracion'
    )
  })
})

// QA STU-N3: two Studio tabs on the same section; the later autosave silently wiped
// the other tab's change because the PUT sends the whole config.
describe('SectionConfigEditor changes saved in another tab', () => {
  function mapSection(updatedAt: string, config: Record<string, unknown>): EventSection {
    return { ...section('MAP', config), updated_at: updatedAt }
  }

  it('reloads the saved version when nothing is pending in this tab', () => {
    const onSave = vi.fn()
    const { rerender } = render(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:00:00.000Z', { title: 'Mapa', content: 'Viejo' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    rerender(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:05:00.000Z', { title: 'Mapa', content: 'Desde la otra pestaña' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Texto de apoyo')).toHaveValue('Desde la otra pestaña')
    expect(screen.getByTestId('section-reloaded')).toHaveTextContent('Esta sección cambió en otra pestaña.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('pauses the autosave and asks when this tab has a pending edit', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(null)
    const { rerender } = render(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:00:00.000Z', { title: 'Mapa', content: 'Viejo' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Título del mapa'), { target: { value: 'Título de B' } })
    rerender(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:05:00.000Z', { title: 'Mapa', content: 'Texto de A' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByTestId('section-conflict')).toHaveTextContent('Esta sección cambió en otra pestaña.')
    expect(onSave).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Conservar mis cambios' }))
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][1]).toMatchObject({ title: 'Título de B', content: 'Viejo' })
  })

  it('drops the pending edit when the host loads the saved version', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(null)
    const { rerender } = render(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:00:00.000Z', { title: 'Mapa', content: 'Viejo' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Título del mapa'), { target: { value: 'Título de B' } })
    rerender(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:05:00.000Z', { title: 'Mapa', content: 'Texto de A' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cargar la versión guardada' }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByLabelText('Título del mapa')).toHaveValue('Mapa')
    expect(screen.getByLabelText('Texto de apoyo')).toHaveValue('Texto de A')
    expect(screen.queryByTestId('section-conflict')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not treat its own save as a change from another tab', async () => {
    vi.useFakeTimers()
    const saved = mapSection('2026-07-05T00:01:00.000Z', { title: 'Nuevo', content: 'Viejo' })
    const onSave = vi.fn().mockResolvedValue(saved)
    const { rerender } = render(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:00:00.000Z', { title: 'Mapa', content: 'Viejo' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Título del mapa'), { target: { value: 'Nuevo' } })
    await act(async () => {
      vi.advanceTimersByTime(900)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    rerender(<SectionConfigEditor section={saved} onSave={onSave} onClose={vi.fn()} />)

    expect(screen.queryByTestId('section-conflict')).toBeNull()
    expect(screen.queryByTestId('section-reloaded')).toBeNull()
    expect(screen.getByLabelText('Título del mapa')).toHaveValue('Nuevo')
  })
})

describe('SectionConfigEditor with the backend 409 section_conflict (STU-N3)', () => {
  function mapSection(updatedAt: string, config: Record<string, unknown>): EventSection {
    return { ...section('MAP', config), updated_at: updatedAt }
  }

  it('sends its baseline as expected_updated_at, shows the conflict and resends with the new version on Conservar', async () => {
    vi.useFakeTimers()
    const current = mapSection('2026-07-05T00:07:00.000Z', { title: 'Mapa', content: 'Texto de A' })
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new SectionConflictError(current))
      .mockResolvedValueOnce(mapSection('2026-07-05T00:08:00.000Z', { title: 'Título de B', content: 'Viejo' }))
    render(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:00:00.000Z', { title: 'Mapa', content: 'Viejo' })}
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Título del mapa'), { target: { value: 'Título de B' } })
    await act(async () => {
      vi.advanceTimersByTime(900)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][2]).toBe('2026-07-05T00:00:00.000Z')
    expect(screen.getByTestId('section-conflict')).toHaveTextContent('Esta sección cambió en otra pestaña.')
    expect(screen.getByLabelText('Título del mapa')).toHaveValue('Título de B')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Conservar mis cambios' }))
    })

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1][1]).toMatchObject({ title: 'Título de B' })
    expect(onSave.mock.calls[1][2]).toBe('2026-07-05T00:07:00.000Z')
    expect(screen.queryByTestId('section-conflict')).toBeNull()
  })

  it('loads the version from the 409 body on Cargar la versión guardada', async () => {
    vi.useFakeTimers()
    const current = mapSection('2026-07-05T00:07:00.000Z', { title: 'Mapa', content: 'Texto de A' })
    const onSave = vi.fn().mockRejectedValueOnce(new SectionConflictError(current))
    const onDiscardFailedSave = vi.fn()
    render(
      <SectionConfigEditor
        section={mapSection('2026-07-05T00:00:00.000Z', { title: 'Mapa', content: 'Viejo' })}
        onSave={onSave}
        onClose={vi.fn()}
        onDiscardFailedSave={onDiscardFailedSave}
      />
    )

    fireEvent.change(screen.getByLabelText('Título del mapa'), { target: { value: 'Título de B' } })
    await act(async () => {
      vi.advanceTimersByTime(900)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar la versión guardada' }))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByLabelText('Título del mapa')).toHaveValue('Mapa')
    expect(screen.getByLabelText('Texto de apoyo')).toHaveValue('Texto de A')
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onDiscardFailedSave).toHaveBeenCalledWith(current.id)
  })
})
