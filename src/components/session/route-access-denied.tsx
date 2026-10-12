'use client'

import { Link } from '@/components/link'
import { LockClosedIcon } from '@heroicons/react/24/outline'

/**
 * Shown by the dashboard shell instead of a page the current role or product
 * cannot use. The page itself never mounts, so it fires no requests.
 */
export function RouteAccessDenied({
  reason,
  productName,
}: {
  reason: 'product' | 'role'
  productName: string
}) {
  const description =
    reason === 'product'
      ? `Esta sección no está disponible en ${productName}.`
      : 'Tu rol no tiene acceso a esta sección. Si crees que es un error, pide acceso a un administrador de tu organización.'

  return (
    <section
      aria-labelledby="route-access-denied-title"
      className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-2xl border border-border-subtle bg-surface-soft text-ink-muted"
      >
        <LockClosedIcon className="size-5" />
      </span>
      <h1 id="route-access-denied-title" className="mt-6 text-xl font-semibold tracking-tight text-ink">
        Sin acceso
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-soft px-4 text-sm font-semibold text-ink transition-colors hover:border-border-strong hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
      >
        Ir al inicio
      </Link>
    </section>
  )
}
