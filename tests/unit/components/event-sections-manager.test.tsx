import { EventSectionsManager } from '@/components/events/event-sections-manager'
import type { EventSection } from '@/models/EventSection'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const swrMock = vi.hoisted(() => ({
  useSWR: vi.fn(),
  mutate: vi.fn(),
}))

const apiMock = vi.hoisted(() => ({
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  post: vi.fn(),
}))

vi.mock('swr', () => ({
  default: swrMock.useSWR,
  mutate: swrMock.mutate,
}))

vi.mock('@/lib/api', () => ({
  api: apiMock,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, layout: _layout, ...props }: { children: ReactNode; layout?: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}))

vi.mock('@/components/events/event-section-resources', () => ({
  sectionImageSlotsForType: (componentType: string) =>
    componentType === 'GraduationHero' ? [{ position: 0, label: 'Hero', ratio: '3:2' }] : [],
  EventSectionResources: ({ onResourcesChanged }: { onResourcesChanged?: () => void }) => (
    <div>
      <p>Classic media manager</p>
      <button onClick={onResourcesChanged}>Notify classic media change</button>
    </div>
  ),
}))

function section(componentType: string, patch: Partial<EventSection> = {}): EventSection {
  return {
    id: `${componentType}-section`,
    event_id: 'event-1',
    created_at: '2026-07-05T00:00:00.000Z',
    updated_at: '2026-07-05T00:00:00.000Z',
    name: componentType,
    component_type: componentType,
    order: 1,
    is_visible: true,
    config: {},
    ...patch,
  }
}

describe('EventSectionsManager media integration', () => {
  beforeEach(() => {
    swrMock.useSWR.mockReset()
    swrMock.mutate.mockReset()
    apiMock.put.mockReset()
    apiMock.patch.mockReset()
    apiMock.delete.mockReset()
    apiMock.post.mockReset()
    const retrySections = vi.fn().mockResolvedValue(undefined)
    swrMock.useSWR.mockReturnValue({
      data: [section('GraduationHero')],
      isLoading: false,
      mutate: retrySections,
    })
  })

  it('forwards media resource changes to the parent integration callback', async () => {
    const onResourcesChanged = vi.fn()

    render(<EventSectionsManager eventId="event-1" onResourcesChanged={onResourcesChanged} />)

    fireEvent.click(screen.getByLabelText(/Gestionar im/i))
    expect(await screen.findByText('Classic media manager')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Notify classic media change'))
    expect(onResourcesChanged).toHaveBeenCalledTimes(1)
  })

  it('keeps cached sections visible after a background refresh failure', () => {
    const retrySections = vi.fn()
    swrMock.useSWR.mockReturnValue({
      data: [section('GraduationHero')],
      isLoading: false,
      isValidating: false,
      error: new Error('offline'),
      mutate: retrySections,
    })

    render(<EventSectionsManager eventId="event-1" />)

    expect(screen.getByRole('status')).toHaveTextContent('Mostrando datos guardados mientras recuperamos las secciones')
    expect(screen.getByText('Hero de graduación')).toBeInTheDocument()
    expect(screen.queryByText('Sin secciones')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retrySections).toHaveBeenCalledOnce()
  })

  it('emits public content changes after section visibility updates', async () => {
    const onPublicContentChanged = vi.fn()
    apiMock.put.mockResolvedValueOnce({
      data: {
        status: 200,
        data: section('GraduationHero', { is_visible: false }),
      },
    })

    render(<EventSectionsManager eventId="event-1" onPublicContentChanged={onPublicContentChanged} />)

    fireEvent.click(screen.getByLabelText(/Ocultar secci/i))

    await waitFor(() => expect(onPublicContentChanged).toHaveBeenCalledTimes(1))
    expect(apiMock.put).toHaveBeenCalledWith('/sections/GraduationHero-section', { is_visible: false })
  })

  it('explains when an event-level switch hides a visible section (STU-54)', () => {
    render(
      <EventSectionsManager
        eventId="event-1"
        eventConfig={{
          id: 'cfg-1',
          event_id: 'event-1',
          created_at: '2026-07-05T00:00:00.000Z',
          updated_at: '2026-07-05T00:00:00.000Z',
          is_public: true,
          visibility_configured: true,
          show_header: false,
        }}
      />
    )

    expect(screen.getByText(/el interruptor «Portada» está apagado/)).toBeInTheDocument()
  })

  it('counts sections with the right Spanish plural (STU-38)', () => {
    swrMock.useSWR.mockReturnValue({
      data: [section('GraduationHero'), section('Agenda', { id: 'agenda', order: 2 })],
      isLoading: false,
      mutate: vi.fn(),
    })

    render(<EventSectionsManager eventId="event-1" />)

    expect(screen.getByText(/2 secciones · 2 visibles/)).toBeInTheDocument()
  })

  it('does not count a section hidden by an event settings switch as visible (STU-N1)', () => {
    swrMock.useSWR.mockReturnValue({
      data: [section('GraduationHero'), section('Agenda', { id: 'agenda', order: 2 })],
      isLoading: false,
      mutate: vi.fn(),
    })

    render(
      <EventSectionsManager
        eventId="event-1"
        eventConfig={{
          id: 'config-1',
          event_id: 'event-1',
          created_at: '2026-07-05T00:00:00.000Z',
          updated_at: '2026-07-05T00:00:00.000Z',
          is_public: true,
          visibility_configured: true,
          show_header: false,
        }}
      />
    )

    expect(screen.getByText(/2 secciones · 1 visible · 1 oculta por los ajustes del evento/)).toBeInTheDocument()
  })

  it('requires confirmation before deleting a section', async () => {
    apiMock.delete.mockResolvedValueOnce({ data: {} })

    render(<EventSectionsManager eventId="event-1" />)

    fireEvent.click(screen.getByLabelText(/Eliminar secci/i))
    expect(apiMock.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Hero de graduación')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar sección' }))

    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/sections/GraduationHero-section'))
  })

  it('keeps the config drawer open with the edits and a Spanish error when the save fails (STU-22)', async () => {
    swrMock.useSWR.mockReturnValue({
      data: [section('GraduationHero', { config: { title: 'Generación 2025' } })],
      isLoading: false,
      mutate: vi.fn().mockResolvedValue(undefined),
    })
    apiMock.put.mockRejectedValueOnce(new Error('offline'))

    render(<EventSectionsManager eventId="event-1" />)

    fireEvent.click(screen.getByLabelText('Editar configuración'))
    fireEvent.change(screen.getByDisplayValue('Generación 2025'), { target: { value: 'Generación 2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar config' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Tus cambios siguen aquí')
    expect(screen.getByDisplayValue('Generación 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar config' })).toBeEnabled()
  })

  it('closes the config drawer after a successful save', async () => {
    swrMock.useSWR.mockReturnValue({
      data: [section('GraduationHero', { config: { title: 'Generación 2025' } })],
      isLoading: false,
      mutate: vi.fn().mockResolvedValue(undefined),
    })
    apiMock.put.mockResolvedValueOnce({ data: {} })

    render(<EventSectionsManager eventId="event-1" />)

    fireEvent.click(screen.getByLabelText('Editar configuración'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar config' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar config' })).not.toBeInTheDocument())
  })

  it('lets the countdown go back to the event date', async () => {
    const config = { heading: 'Hola', targetDate: '2026-12-01T18:00' }
    swrMock.useSWR.mockReturnValue({
      data: [section('CountdownHeader', { config })],
      isLoading: false,
      mutate: vi.fn().mockResolvedValue(undefined),
    })
    apiMock.put.mockResolvedValueOnce({ data: {} })

    render(<EventSectionsManager eventId="event-1" />)
    fireEvent.click(screen.getByLabelText('Editar configuración'))

    expect(screen.getByLabelText('Fecha y hora de la cuenta regresiva')).toHaveValue('2026-12-01T18:00')
    fireEvent.click(screen.getByRole('button', { name: 'Usar la fecha del evento' }))
    expect(screen.getByText('Sin fecha propia: la cuenta regresiva usa la fecha del evento.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar config' }))

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/sections/CountdownHeader-section', { config: { heading: 'Hola' } })
    )
  })
})
