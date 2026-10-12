// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}

import { STUDIO_PREVIEW_READY_MESSAGE, STUDIO_PREVIEW_STALL_MS, StudioPreview } from '@/components/studio/studio-preview'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
}))

function renderPreview(props?: Partial<Parameters<typeof StudioPreview>[0]>) {
  return render(
    <StudioPreview
      previewUrl="https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=99&preview_token=secret-token"
      publicUrl="https://www.eventiapp.com.mx/e/mi-evento"
      device="tablet"
      setDevice={vi.fn()}
      refreshPreview={vi.fn()}
      iframeKey={1}
      showPreview
      setShowPreview={vi.fn()}
      {...props}
    />
  )
}

describe('StudioPreview', () => {
  it('shows the clean public URL while keeping the signed preview URL internal', () => {
    const signedPreviewUrl = 'about:blank?preview=1&t=99&preview_token=secret-token'

    renderPreview({ eventName: 'Mi evento', previewUrl: signedPreviewUrl })

    expect(screen.getAllByText('https://www.eventiapp.com.mx/e/mi-evento').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('preview_token')
    expect(document.body.textContent).not.toContain('secret-token')
    expect(document.body.textContent).not.toContain('preview=1')

    expect(screen.getByTitle('Vista previa - Mi evento')).toHaveAttribute(
      'src',
      signedPreviewUrl
    )

    expect(screen.getByTitle('Abrir en una pestaña nueva')).toHaveAttribute(
      'href',
      signedPreviewUrl
    )
  })

  it('does not leak preview params even if the public URL is accidentally signed', () => {
    renderPreview({
      publicUrl:
        'https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=99&preview_token=secret-token&previewToken=camel-secret&PreviewToken=pascal-secret&token=invite-secret&Token=raw-secret&pretty_token=pretty-secret&prettyToken=pretty-camel&PrettyToken=pretty-pascal&invitation_token=invite-alias&invitationToken=invite-camel&InvitationToken=invite-pascal&event_access_token=proof-secret&eventAccessToken=proof-camel&EventAccessToken=proof-pascal',
    })

    expect(screen.getAllByText('https://www.eventiapp.com.mx/e/mi-evento').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('preview_token')
    expect(document.body.textContent).not.toContain('previewToken')
    expect(document.body.textContent).not.toContain('secret-token')
    expect(document.body.textContent).not.toContain('camel-secret')
    expect(document.body.textContent).not.toContain('pascal-secret')
    expect(document.body.textContent).not.toContain('invite-secret')
    expect(document.body.textContent).not.toContain('pretty-secret')
    expect(document.body.textContent).not.toContain('proof-secret')
    expect(document.body.textContent).not.toContain('preview=1')
  })

  it('sanitizes preview params when no public URL is provided', () => {
    renderPreview({
      publicUrl: undefined,
      previewUrl:
        'https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=99&preview_token=secret-token&token=invite-secret&event_access_token=proof-secret',
    })

    expect(screen.getAllByText('https://www.eventiapp.com.mx/e/mi-evento').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('preview_token')
    expect(document.body.textContent).not.toContain('preview=1')
    expect(document.body.textContent).not.toContain('invite-secret')
    expect(document.body.textContent).not.toContain('proof-secret')
  })

  it('shows preview token errors with a retry action', () => {
    const refreshPreview = vi.fn()

    renderPreview({
      previewUrl: '',
      previewError: 'No se pudo generar el preview',
      refreshPreview,
    })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo generar el preview')
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(refreshPreview).toHaveBeenCalledTimes(1)
  })

  describe('blocked frame fallback (STU-5 / STU-69)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    const fallbackText = /La vista previa se ve en blanco/

    it('explains a blank frame and offers a new tab when the public site never reports ready', () => {
      vi.useFakeTimers()
      renderPreview({ eventName: 'Mi evento' })

      expect(screen.queryByText(fallbackText)).not.toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(STUDIO_PREVIEW_STALL_MS)
      })

      expect(screen.getByText(fallbackText)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Abrir vista previa' })).toHaveAttribute(
        'href',
        'https://www.eventiapp.com.mx/e/mi-evento?preview=1&t=99&preview_token=secret-token'
      )
    })

    it('stays quiet when the public site posts the ready message', () => {
      vi.useFakeTimers()
      renderPreview({ eventName: 'Mi evento' })

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: 'https://www.eventiapp.com.mx',
            data: { type: STUDIO_PREVIEW_READY_MESSAGE },
          })
        )
        vi.advanceTimersByTime(STUDIO_PREVIEW_STALL_MS)
      })

      expect(screen.queryByText(fallbackText)).not.toBeInTheDocument()
    })

    it('ignores ready messages from other origins', () => {
      vi.useFakeTimers()
      renderPreview({ eventName: 'Mi evento' })

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', { origin: 'https://evil.example', data: STUDIO_PREVIEW_READY_MESSAGE })
        )
        vi.advanceTimersByTime(STUDIO_PREVIEW_STALL_MS)
      })

      expect(screen.getByText(fallbackText)).toBeInTheDocument()
    })
  })
})
