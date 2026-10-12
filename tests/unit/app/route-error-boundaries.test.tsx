import AuthError from '@/app/(auth)/error'
import RootError from '@/app/error'
import GlobalError from '@/app/global-error'
import { ErrorBoundary } from '@/components/error-boundary'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('route error boundaries', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('global-error renders its own Spanish document', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={Object.assign(new Error('secret'), { digest: 'd-1' })} reset={() => undefined} />
    )
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('Algo salió mal')
    expect(html).toContain('Reintentar')
    expect(html).toContain('Ir al inicio')
    expect(html).toContain('Referencia d-1')
    expect(html).not.toContain('secret')
  })

  it('root error offers retry and home without the exception message', () => {
    const reset = vi.fn()
    render(<RootError error={new Error('internal secret')} reset={reset} />)

    expect(screen.queryByText('internal secret')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/')
  })

  it('auth error sends the user back to the login', () => {
    render(<AuthError error={new Error('x')} reset={() => undefined} />)
    expect(screen.getByRole('link', { name: 'Volver al acceso' })).toHaveAttribute('href', '/login')
  })
})

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom')
  return <p>Contenido sano</p>
}

function Harness() {
  const [explode, setExplode] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setExplode(false)}>
        reparar
      </button>
      <ErrorBoundary>
        <Bomb explode={explode} />
      </ErrorBoundary>
    </>
  )
}

describe('ErrorBoundary fallback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('retries in place and links home', () => {
    render(<Harness />)

    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal')
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/')

    fireEvent.click(screen.getByRole('button', { name: 'reparar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('Contenido sano')).toBeInTheDocument()
  })
})
