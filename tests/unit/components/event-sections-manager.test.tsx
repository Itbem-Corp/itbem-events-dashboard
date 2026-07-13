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

  it('requires confirmation before deleting a section', async () => {
    apiMock.delete.mockResolvedValueOnce({ data: {} })

    render(<EventSectionsManager eventId="event-1" />)

    fireEvent.click(screen.getByLabelText(/Eliminar secci/i))
    expect(apiMock.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Hero de graduación')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar sección' }))

    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/sections/GraduationHero-section'))
  })
})
