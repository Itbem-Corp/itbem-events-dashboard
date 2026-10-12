'use client'

import { ArrowPathIcon, HomeIcon } from '@heroicons/react/20/solid'

/**
 * Spanish fallback for route error boundaries outside the dashboard shell
 * (root and auth segments). Never renders the exception message: only the
 * digest Next.js gives for correlating server logs.
 */
export function RouteErrorPanel({
  digest,
  homeHref = '/',
  homeLabel = 'Ir al inicio',
  onRetry,
}: {
  digest?: string
  homeHref?: string
  homeLabel?: string
  onRetry: () => void
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-4 py-12">
      <section
        role="alert"
        aria-live="polite"
        className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-raised p-6 text-center shadow-[0_18px_48px_var(--app-shadow-strong)] sm:p-8"
      >
        <h1 className="text-lg font-semibold text-ink">Algo salió mal</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          No pudimos mostrar esta pantalla. Tu información está segura; intenta de nuevo o vuelve al inicio.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <ArrowPathIcon className="size-4" aria-hidden="true" />
            Reintentar
          </button>
          <a
            href={homeHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold text-ink hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <HomeIcon className="size-4" aria-hidden="true" />
            {homeLabel}
          </a>
        </div>
        {digest && <p className="mt-6 font-mono text-xs text-ink-muted">Referencia {digest}</p>}
      </section>
    </main>
  )
}
