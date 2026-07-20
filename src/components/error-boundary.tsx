'use client'

import React from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center" role="alert" aria-live="assertive">
          <div className="w-full max-w-sm rounded-2xl border border-red-500/20 bg-surface-raised px-8 py-10 shadow-[0_18px_48px_var(--app-shadow-strong)] sm:px-10 sm:py-12">
            <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
              <ExclamationTriangleIcon className="size-7 text-red-700 dark:text-red-300" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-ink">
              Algo salió mal
            </h2>
            <p className="mt-2 text-sm text-ink-secondary">
              Ocurrió un error inesperado. Por favor recarga la página.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-interactive px-4 py-2 text-sm font-semibold text-ink transition-[border-color,background-color] hover:border-border-strong hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--tenant-accent)"
            >
              Recargar página
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
