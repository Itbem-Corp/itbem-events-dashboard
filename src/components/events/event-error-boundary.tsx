'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  eventId?: string
  onRetry: () => void
}

interface State {
  hasError: boolean
}

export class EventErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EventErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-6 py-20 text-center">
          <p className="mb-4 text-sm text-red-400">Algo salió mal al mostrar este evento.</p>
          <button
            type="button"
            onClick={() => {
              this.props.onRetry()
              this.setState({ hasError: false })
            }}
            className="min-h-11 rounded-xl bg-surface-raised px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            Reintentar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
