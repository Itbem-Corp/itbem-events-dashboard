import { Button } from '@/components/button'
import { ArrowLeftIcon, Squares2X2Icon } from '@heroicons/react/20/solid'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12 text-white">
      <section className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-surface/55 p-8 shadow-2xl shadow-black/30 sm:p-12">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/[0.06]" />
        <div className="relative">
          <p className="font-mono text-sm font-medium tracking-[0.22em] text-indigo-300">404</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Esta vista no existe</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-ink-secondary">
            El enlace pudo cambiar o ya no estar disponible. Regresa al dashboard para continuar con tus eventos.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/" color="indigo">
              <Squares2X2Icon />
              Volver al dashboard
            </Button>
            <Button href="/events" outline>
              <ArrowLeftIcon />
              Ver eventos
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
