import { EventConfigPanel } from '@/components/events/event-config-panel'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  mutate: vi.fn(),
  put: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('swr', () => ({
  default: mocks.useSWR,
  mutate: mocks.mutate,
}))

vi.mock('@/lib/api', () => ({
  api: {
    put: mocks.put,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

describe('EventConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: false,
        allow_messages: false,
        share_uploads_enabled: true,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        active_from: '0001-01-01T00:00:00Z',
        active_until: '0001-01-01T00:00:00Z',
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        show_moment_wall: true,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })
    mocks.put.mockResolvedValue({ data: { data: {} } })
    mocks.mutate.mockResolvedValue(undefined)
  })

  it('hides Go zero dates in datetime-local inputs', () => {
    const { container } = render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')

    expect(dateInputs).toHaveLength(2)
    expect(dateInputs[0]).toHaveValue('')
    expect(dateInputs[1]).toHaveValue('')
  })

  it('keeps cached configuration editable after a background refresh failure', () => {
    const retryConfig = vi.fn()
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        max_uploads_per_guest: 30,
      },
      isLoading: false,
      isValidating: false,
      error: new Error('offline'),
      mutate: retryConfig,
    })

    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    expect(screen.getByRole('status')).toHaveTextContent('Mostrando datos guardados mientras recuperamos configuración')
    expect(screen.getByRole('switch', { name: 'Evento público' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retryConfig).toHaveBeenCalledOnce()
  })

  it('treats omitted backend access dates as an always-available public page', () => {
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: false,
        allow_messages: false,
        share_uploads_enabled: false,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        show_moment_wall: true,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })

    const { container } = render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')

    expect(dateInputs[0]).toHaveValue('')
    expect(dateInputs[1]).toHaveValue('')
  })

  it('uses the event timezone when rendering and saving public access dates', async () => {
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: false,
        allow_messages: false,
        share_uploads_enabled: true,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        active_from: '2026-07-01T15:00:00Z',
        active_until: '0001-01-01T00:00:00Z',
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        show_moment_wall: true,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })

    const { container } = render(
      <EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" eventTimezone="America/Chicago" />
    )
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')

    expect(dateInputs[0]).toHaveValue('2026-07-01T10:00')

    fireEvent.change(dateInputs[0], { target: { value: '2026-07-01T11:30' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.put).toHaveBeenCalled())

    expect(mocks.put).toHaveBeenCalledWith('/events/event-1/config', {
      active_from: '2026-07-01T11:30:00-05:00',
    })
  })

  it('blocks saving when the public access end date is not after the start date', async () => {
    const { container } = render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')

    fireEvent.change(dateInputs[0], { target: { value: '2026-07-10T18:00' } })
    fireEvent.change(dateInputs[1], { target: { value: '2026-07-10T17:59' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('La fecha final debe ser posterior a la inicial'))
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('sends only changed backend EventConfig fields when saving', async () => {
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    expect(screen.getByText('Recepción')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.put).toHaveBeenCalled())

    expect(mocks.put).toHaveBeenCalledWith('/events/event-1/config', {
      max_uploads_per_guest: 31,
    })
    expect(mocks.put.mock.calls[0][1]).not.toHaveProperty('share_uploads_enabled')
  })

  it('notifies the parent after saving public config changes', async () => {
    const onSaved = vi.fn()
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" onSaved={onSaved} />)

    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })

  it('updates configuration caches before the save request finishes', async () => {
    let resolveSave!: (value: unknown) => void
    mocks.put.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)))
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        '/events/event-1/config',
        expect.objectContaining({ id: 'event-1', max_uploads_per_guest: 31 }),
        { revalidate: false }
      )
    )
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()

    resolveSave({ data: { data: {} } })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
  })

  it('rolls caches back and keeps edits available when saving fails', async () => {
    mocks.put.mockRejectedValue(new Error('offline'))
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.mutate).toHaveBeenCalledWith(
      '/events/event-1/config',
      expect.objectContaining({ id: 'event-1', max_uploads_per_guest: 30 }),
      { revalidate: false }
    )
    expect(screen.getByDisplayValue('31')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar configuraci/ })).toBeEnabled()
  })

  it('allows resetting upload limit to the backend default', async () => {
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.put).toHaveBeenCalled())

    expect(mocks.put).toHaveBeenCalledWith('/events/event-1/config', {
      max_uploads_per_guest: 0,
    })
  })

  it('saves shared QR upload changes independently from general uploads', async () => {
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: true,
        allow_messages: false,
        share_uploads_enabled: false,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        active_from: '0001-01-01T00:00:00Z',
        active_until: '0001-01-01T00:00:00Z',
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        show_moment_wall: false,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    fireEvent.click(screen.getByRole('switch', { name: 'Uploads por QR compartido' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.put).toHaveBeenCalled())

    expect(mocks.put).toHaveBeenCalledWith('/events/event-1/config', {
      allow_uploads: true,
      show_moment_wall: false,
      share_uploads_enabled: true,
    })
  })

  it('shows shared QR uploads as effectively closed while the moments wall is published', () => {
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: true,
        allow_messages: false,
        share_uploads_enabled: true,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        active_from: '0001-01-01T00:00:00Z',
        active_until: '0001-01-01T00:00:00Z',
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        show_moment_wall: true,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })

    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    const qrSwitch = screen.getByRole('switch', { name: 'Uploads por QR compartido' })

    expect(qrSwitch).toBeDisabled()
    expect(qrSwitch).not.toBeChecked()
    expect(screen.getByText(/la pagina publica y el QR de uploads reciben este permiso cerrado/i)).toBeInTheDocument()
  })

  it('uses the public moment-wall alias for the main Momentos control', async () => {
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: true,
        allow_messages: false,
        share_uploads_enabled: true,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        active_from: '0001-01-01T00:00:00Z',
        active_until: '0001-01-01T00:00:00Z',
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        moments_wall_published: false,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })

    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    const wallSwitch = screen.getByRole('switch', { name: 'Muro de momentos' })

    await waitFor(() => expect(wallSwitch).not.toBeChecked())
    expect(screen.getByRole('switch', { name: 'Permitir subir fotos' })).toBeChecked()
  })

  it('clears shared QR uploads when disabling guest uploads', async () => {
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: true,
        allow_messages: false,
        share_uploads_enabled: true,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        active_from: '0001-01-01T00:00:00Z',
        active_until: '0001-01-01T00:00:00Z',
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        show_moment_wall: false,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    fireEvent.click(screen.getByRole('switch', { name: 'Permitir subir fotos' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.put).toHaveBeenCalled())

    expect(mocks.put).toHaveBeenCalledWith('/events/event-1/config', {
      allow_uploads: false,
      share_uploads_enabled: false,
    })
  })

  it('clears shared QR uploads when publishing the moments wall', async () => {
    mocks.useSWR.mockReturnValue({
      data: {
        id: 'event-1',
        event_id: 'event-1',
        is_public: true,
        allow_uploads: true,
        allow_messages: false,
        share_uploads_enabled: true,
        auto_approve_uploads: false,
        max_uploads_per_guest: 30,
        notify_on_moment_upload: false,
        active_from: '0001-01-01T00:00:00Z',
        active_until: '0001-01-01T00:00:00Z',
        default_welcome_message: 'Hola',
        default_thank_you_message: 'Gracias',
        default_moment_request_message: 'Comparte fotos',
        default_guest_signature_title: 'Firma',
        show_countdown: true,
        show_rsvp_section: true,
        show_event_location: true,
        show_second_location: false,
        show_photo_gallery: true,
        show_moment_wall: false,
        show_contact_section: true,
        show_event_schedule: true,
        show_footer: false,
        show_header: false,
        show_hosts_section: false,
      },
      isLoading: false,
      error: null,
    })
    render(<EventConfigPanel eventId="event-1" eventIdentifier="mi-evento" />)

    fireEvent.click(screen.getByRole('switch', { name: 'Muro de momentos' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar configuraci/ }))

    await waitFor(() => expect(mocks.put).toHaveBeenCalled())

    expect(mocks.put).toHaveBeenCalledWith('/events/event-1/config', {
      show_moment_wall: true,
      share_uploads_enabled: false,
    })
  })
})
