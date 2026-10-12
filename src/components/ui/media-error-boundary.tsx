'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Changing this value clears the error (e.g. new data or a new tab). */
  resetKey?: string | number
  /** Replaces the default message box. Pass `null` to render nothing. */
  fallback?: ReactNode
  message?: string
  className?: string
}

interface State {
  hasError: boolean
}

/**
 * Keeps a crashing media region (cover, moments grid, thumbnails) from
 * taking down the whole page: only this region shows an error.
 */
export class MediaErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MediaErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(previous: Readonly<Props>) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback

    return (
      <div
        role="alert"
        className={
          this.props.className ??
          'rounded-2xl border border-border-subtle bg-surface-raised px-6 py-10 text-center'
        }
      >
        <p className="text-sm font-medium text-ink">{this.props.message ?? 'No pudimos mostrar estas imágenes.'}</p>
        <p className="mt-1 text-xs text-ink-muted">El resto de la página sigue disponible.</p>
        <button
          type="button"
          onClick={() => this.setState({ hasError: false })}
          className="mt-4 min-h-11 rounded-xl border border-border-subtle bg-surface-interactive px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
        >
          Reintentar
        </button>
      </div>
    )
  }
}
