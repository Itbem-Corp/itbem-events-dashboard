import { QuickConfigPanel } from '@/components/studio/quick-config-panel'
import { api } from '@/lib/api'
import type { EventConfig } from '@/models/EventConfig'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('swr', () => ({
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
    success: mocks.toastSuccess,
  },
}))

const config: EventConfig = {
  id: 'event-1',
  event_id: 'event-1',
  created_at: '2026-07-05T00:00:00.000Z',
  updated_at: '2026-07-05T00:00:00.000Z',
  is_public: true,
  show_header: true,
  default_welcome_message: 'Hola',
  default_thank_you_message: 'Gracias',
}

describe('QuickConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } })
    mocks.mutate.mockResolvedValue(undefined)
  })

  it('sends only the toggled EventConfig field', async () => {
    render(<QuickConfigPanel config={config} eventId="event-1" onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Portada' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/event-1/config', { show_header: false })
    })
  })

  it('uses backend PageSpec visibility fields for contact and agenda toggles', async () => {
    render(<QuickConfigPanel config={config} eventId="event-1" onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Contacto' }))

    await waitFor(
      () => {
        expect(api.put).toHaveBeenCalledWith('/events/event-1/config', { show_contact_section: false })
      },
      { timeout: 3_000 }
    )

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Agenda' })).toBeEnabled()
    })

    vi.mocked(api.put).mockClear()

    fireEvent.click(screen.getByRole('switch', { name: 'Agenda' }))

    await waitFor(
      () => {
        expect(api.put).toHaveBeenCalledWith('/events/event-1/config', { show_event_schedule: false })
      },
      { timeout: 3_000 }
    )
  })

  it('updates the config cache from a backend response envelope', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({
      data: {
        status: 200,
        message: 'Config updated',
        data: {
          ...config,
          show_header: false,
          updated_at: '2026-07-06T00:00:00.000Z',
        },
      },
    })
    const onSaved = vi.fn()

    render(<QuickConfigPanel config={config} eventId="event-1" onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Portada' }))

    await waitFor(() => {
      expect(mocks.mutate).toHaveBeenCalledWith('/events/event-1/config', expect.any(Function), { revalidate: false })
    })

    const cacheUpdater = mocks.mutate.mock.calls.find(
      (call) => call[0] === '/events/event-1/config' && typeof call[1] === 'function'
    )?.[1] as
      | ((current: EventConfig | undefined) => EventConfig)
      | undefined

    expect(cacheUpdater?.(config)).toEqual({
      ...config,
      show_header: false,
      updated_at: '2026-07-06T00:00:00.000Z',
    })
    expect(onSaved).toHaveBeenCalledTimes(2)
    expect(onSaved).toHaveBeenNthCalledWith(1, expect.objectContaining({ show_header: false }))
  })

  it('sends only message fields when saving messages', async () => {
    render(<QuickConfigPanel config={config} eventId="event-1" onSaved={vi.fn()} />)

    const [welcome, thankYou] = screen.getAllByRole('textbox')
    fireEvent.change(welcome, { target: { value: 'Nuevo saludo' } })
    fireEvent.change(thankYou, { target: { value: 'Nuevo gracias' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar mensajes/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/event-1/config', {
        default_welcome_message: 'Nuevo saludo',
        default_thank_you_message: 'Nuevo gracias',
      })
    })
  })

  it('clears shared QR uploads when disabling guest uploads', async () => {
    render(
      <QuickConfigPanel
        config={{ ...config, allow_uploads: true, share_uploads_enabled: true, show_moment_wall: false }}
        eventId="event-1"
        onSaved={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('switch', { name: 'Subir fotos' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/event-1/config', {
        allow_uploads: false,
        share_uploads_enabled: false,
      })
    })
  })

  it('renders legacy upload configs with default surrounding sections', () => {
    render(
      <QuickConfigPanel
        config={{
          ...config,
          show_header: false,
          allow_uploads: true,
          share_uploads_enabled: true,
          show_moment_wall: false,
        }}
        eventId="event-1"
        onSaved={vi.fn()}
      />
    )

    expect(screen.getByRole('switch', { name: 'Portada' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Momentos' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Subir fotos' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Subir fotos' })).not.toBeDisabled()
  })

  it('uses the public moment-wall alias for the Momentos switch', async () => {
    render(
      <QuickConfigPanel
        config={{
          ...config,
          allow_uploads: true,
          share_uploads_enabled: true,
          moments_wall_published: false,
        }}
        eventId="event-1"
        onSaved={vi.fn()}
      />
    )

    const wallSwitch = screen.getByRole('switch', { name: 'Momentos' })

    expect(wallSwitch).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Subir fotos' })).toBeChecked()

    fireEvent.click(wallSwitch)

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/events/event-1/config', {
        show_moment_wall: true,
        share_uploads_enabled: false,
      })
    })
  })

  it('shows public uploads as closed when the moments wall is published', () => {
    render(
      <QuickConfigPanel
        config={{ ...config, allow_uploads: true, share_uploads_enabled: true, show_moment_wall: true }}
        eventId="event-1"
        onSaved={vi.fn()}
      />
    )

    const uploadSwitch = screen.getByRole('switch', { name: 'Subir fotos' })

    expect(uploadSwitch).toBeDisabled()
    expect(uploadSwitch).not.toBeChecked()
  })
})
