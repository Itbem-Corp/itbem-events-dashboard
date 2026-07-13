import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventCoverUpload } from '@/components/events/event-cover-upload'
import { api } from '@/lib/api'
import { SECTION_IMAGE_UPLOAD_ACCEPT, SECTION_IMAGE_UPLOAD_MAX_BYTES } from '@/lib/resource-upload-policy'
import { UPLOAD_TIMEOUT_MS } from '@/lib/upload-transport'
import type { Event } from '@/models/Event'
import { toast } from 'sonner'
import { mutate } from 'swr'

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _fill, priority: _priority, ...props }: any) => (
    <img src={typeof src === 'string' ? src : (src?.src ?? '')} alt={alt ?? ''} {...props} />
  ),
}))

vi.mock('swr', () => ({
  mutate: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({
      data: {
        CoverImageUrl: 'events/evt-001/new.webp',
        CoverViewUrl: 'https://signed.example.com/new.webp',
        ViewURL: 'https://signed.example.com/legacy-new.webp',
        CoverViewUrlExpiresAt: '2026-03-01T12:06:00.000Z',
        ViewURLExpiresAt: '2026-03-01T12:05:00.000Z',
      },
    }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-001',
    name: 'Evento Test',
    identifier: 'evento-test',
    is_active: true,
    event_date_time: '2026-01-01T00:00:00Z',
    timezone: 'America/Mexico_City',
    event_type_id: 'type-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('EventCoverUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com/api'
  })

  it('resolves raw backend cover keys before rendering the image', () => {
    render(<EventCoverUpload event={makeEvent({ cover_image_url: 'events/evt-001/cover.webp' })} />)

    expect(screen.getByAltText('Portada del evento')).toHaveAttribute(
      'src',
      'https://api.example.com/storage/events/evt-001/cover.webp'
    )
  })

  it('prefers the signed cover view URL when present', () => {
    render(
      <EventCoverUpload
        event={makeEvent({
          cover_image_url: 'events/evt-001/cover.webp',
          cover_view_url: 'https://signed.example.com/cover.webp',
        })}
      />
    )

    expect(screen.getByAltText('Portada del evento')).toHaveAttribute('src', 'https://signed.example.com/cover.webp')
  })

  it('updates all event caches with the uploaded cover key and view URL', async () => {
    const onChanged = vi.fn()
    const { container } = render(<EventCoverUpload event={makeEvent()} onChanged={onChanged} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['cover'], 'cover.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/events/evt-001/cover',
        expect.any(FormData),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          timeout: UPLOAD_TIMEOUT_MS,
          onUploadProgress: expect.any(Function),
        })
      )
    })

    const [matcher, updater, options] = vi.mocked(mutate).mock.calls[0]
    expect(typeof matcher).toBe('function')
    expect((matcher as (key: unknown) => boolean)('/events')).toBe(true)
    expect((matcher as (key: unknown) => boolean)('/events/evt-001/detail')).toBe(true)
    expect((matcher as (key: unknown) => boolean)('/events/evt-001/config')).toBe(false)
    expect(options).toEqual({ revalidate: false })

    expect(
      (updater as (current: unknown) => unknown)([
        makeEvent({ id: 'evt-001', cover_image_url: 'old.webp' }),
        makeEvent({ id: 'evt-002', cover_image_url: 'other.webp' }),
      ])
    ).toEqual([
      expect.objectContaining({
        id: 'evt-001',
        cover_image_url: 'events/evt-001/new.webp',
        cover_view_url: 'https://signed.example.com/new.webp',
        cover_view_url_expires_at: '2026-03-01T12:06:00.000Z',
        view_url: 'https://signed.example.com/new.webp',
        view_url_expires_at: '2026-03-01T12:06:00.000Z',
      }),
      expect.objectContaining({ id: 'evt-002', cover_image_url: 'other.webp' }),
    ])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('uses the backend-aligned image accept policy for cover inputs', () => {
    const { container } = render(<EventCoverUpload event={makeEvent()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toHaveAttribute('accept', SECTION_IMAGE_UPLOAD_ACCEPT)
    expect(input.getAttribute('accept')).toContain('image/heic')
    expect(input.getAttribute('accept')).toContain('.avif')
  })

  it('accepts extension-backed cover images when the browser MIME type is empty', async () => {
    const { container } = render(<EventCoverUpload event={makeEvent()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['cover'], 'cover.HEIC', { type: '' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/events/evt-001/cover',
        expect.any(FormData),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          timeout: UPLOAD_TIMEOUT_MS,
          onUploadProgress: expect.any(Function),
        })
      )
    })
  })

  it('blocks cover images above the backend resource limit before uploading', () => {
    const { container } = render(<EventCoverUpload event={makeEvent()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['cover'], 'cover.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: SECTION_IMAGE_UPLOAD_MAX_BYTES + 1 })

    fireEvent.change(input, { target: { files: [file] } })

    expect(toast.error).toHaveBeenCalledWith('La imagen no puede superar los 10 MB')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sanitizes S3 endpoint failures and retries without selecting the file again', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: {
        status: 500,
        data: {
          detail:
            'operation error S3: PutObject, StatusCode: 301, RequestID: SECRET, HostID: SECRET_HOST, api error PermanentRedirect: specified endpoint',
        },
      },
    })
    const onChanged = vi.fn()
    const { container } = render(<EventCoverUpload event={makeEvent()} onChanged={onChanged} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [new File(['cover'], 'cover.png', { type: 'image/png' })] } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('El almacenamiento no pudo recibir el archivo')
    expect(alert).not.toHaveTextContent('RequestID')
    expect(alert).not.toHaveTextContent('HostID')

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('does not report success when the server omits the stored cover reference', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { status: 200, data: {} } })
    const onChanged = vi.fn()
    const { container } = render(<EventCoverUpload event={makeEvent()} onChanged={onChanged} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [new File(['cover'], 'cover.png', { type: 'image/png' })] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no confirmó la portada')
    expect(onChanged).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('removes the cover through the dedicated cover endpoint', async () => {
    const onChanged = vi.fn()
    render(
      <EventCoverUpload
        event={makeEvent({ cover_image_url: 'https://signed.example.com/cover.webp' })}
        onChanged={onChanged}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/events/evt-001/cover')
    })
    expect(api.put).not.toHaveBeenCalled()

    const [matcher, updater, options] = vi.mocked(mutate).mock.calls[0]
    expect(typeof matcher).toBe('function')
    expect((matcher as (key: unknown) => boolean)('/events?client_id=client-1')).toBe(true)
    expect(options).toEqual({ revalidate: false })
    expect((updater as (current: unknown) => unknown)(makeEvent({ cover_image_url: 'old.webp' }))).toEqual(
      expect.objectContaining({
        cover_image_url: '',
        cover_view_url: '',
        cover_view_url_expires_at: '',
        view_url: '',
        view_url_expires_at: '',
      })
    )
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
