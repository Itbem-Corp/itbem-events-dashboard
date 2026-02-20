import Link from 'next/link'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center bg-zinc-950">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 mb-6">
        <ExclamationTriangleIcon className="size-8 text-zinc-500" />
      </div>
      <h1 className="text-sm font-semibold text-zinc-200">Página no encontrada</h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-sm">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600 transition-colors"
      >
        Ir al inicio
      </Link>
    </div>
  )
}
