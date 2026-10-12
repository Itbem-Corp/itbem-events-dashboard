import { fireEvent, render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Mirrors the real next/image failure: an optimized src from a host that is
// not in images.remotePatterns throws during render.
vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    unoptimized,
    src,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean; src: string }) => {
    if (!unoptimized && /^https?:/.test(src) && !/amazonaws\.com|eventiapp\.com\.mx|cloudfront\.net/.test(src)) {
      throw new Error(`Invalid src prop (${src}) on next/image, hostname is not configured`)
    }
    return <img src={src} alt={props.alt ?? ''} data-unoptimized={unoptimized ? 'true' : 'false'} {...props} />
  },
}))

import { MediaErrorBoundary } from '@/components/ui/media-error-boundary'
import { SafeImage } from '@/components/ui/safe-image'

describe('SafeImage', () => {
  it('optimizes allowed hosts', () => {
    render(<SafeImage src="https://cdn.eventiapp.com.mx/cover.webp" alt="Portada" fill />)
    expect(screen.getByRole('img', { name: 'Portada' })).toHaveAttribute('data-unoptimized', 'false')
  })

  it('renders an unexpected host unoptimized instead of crashing', () => {
    render(<SafeImage src="http://host.docker.internal:4566/bucket/cover.png" alt="Portada" fill />)
    const image = screen.getByRole('img', { name: 'Portada' })
    expect(image).toHaveAttribute('src', 'http://host.docker.internal:4566/bucket/cover.png')
    expect(image).toHaveAttribute('data-unoptimized', 'true')
  })

  it('retries once unoptimized when the optimizer fails, then shows a placeholder', () => {
    const onError = vi.fn()
    render(<SafeImage src="https://bucket.s3.amazonaws.com/a.webp" alt="Momento" fill onError={onError} />)

    fireEvent.error(screen.getByRole('img', { name: 'Momento' }))
    expect(screen.getByRole('img', { name: 'Momento' })).toHaveAttribute('data-unoptimized', 'true')
    expect(onError).not.toHaveBeenCalled()

    fireEvent.error(screen.getByRole('img', { name: 'Momento' }))
    expect(screen.getByRole('img', { name: 'Momento' })).toHaveAttribute('data-slot', 'image-fallback')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('shows the placeholder or custom fallback for empty and malformed sources', () => {
    const { rerender } = render(<SafeImage src="" alt="Logo" width={40} height={40} />)
    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute('data-slot', 'image-fallback')

    rerender(<SafeImage src="events/raw-key.webp" alt="Logo" width={40} height={40} fallback={<span>LO</span>} />)
    expect(screen.getByText('LO')).toBeInTheDocument()
  })
})

describe('MediaErrorBoundary', () => {
  function Boom(): never {
    throw new Error('render failure')
  }

  it('contains a crashing media region with a Spanish message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <div>
        <p>Resto de la página</p>
        <MediaErrorBoundary>
          <Boom />
        </MediaErrorBoundary>
      </div>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos mostrar estas imágenes.')
    expect(screen.getByText('Resto de la página')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('can render nothing for decorative regions', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { container } = render(
      <MediaErrorBoundary fallback={null}>
        <Boom />
      </MediaErrorBoundary>
    )
    expect(container).toBeEmptyDOMElement()
  })
})
