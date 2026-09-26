import type { DeliveryProject } from './delivery-types'

type PreparationCheck = NonNullable<DeliveryProject['preparation']>['checks'][number]

type PreparationGuidance = {
  nextStep: string
  detail: string
  primary: 'configure' | 'request'
}

// A preparation summary must point to an action that can actually resolve the
// named state. Counting unknown checks alone used to suggest “Comprobar
// capacidad” even when capacity was already ready and the missing input was
// the work item's acceptance criteria and budget.
export function projectPreparationGuidance(preparation: DeliveryProject['preparation']): PreparationGuidance {
  const checks = preparation?.checks ?? []
  const missing = checks.filter(check => check.state === 'missing')
  const unknown = checks.filter(check => check.state === 'unknown')
  const hasKey = (key: string, state?: PreparationCheck['state']) => checks.some(check => check.key === key && (!state || check.state === state))

  if (!preparation) {
    return { nextStep: 'Comprobar requisitos', detail: 'Comprueba las fuentes y la configuración antes de pedir trabajo al agente.', primary: 'configure' }
  }
  if (checks.length === 0) {
    return { nextStep: 'Comprobar requisitos', detail: 'El servidor aún no ha enviado requisitos verificables; esto no es una señal de que el proyecto esté listo.', primary: 'configure' }
  }
  if (missing.length > 0) {
    const sourceOrRuntimeMissing = missing.some(check => ['repositories', 'remote_sync', 'sandbox'].includes(check.key))
    return {
      nextStep: sourceOrRuntimeMissing ? 'Preparar fuentes y configuración' : 'Resolver pendientes',
      detail: `Resuelve ${missing.length} pendiente${missing.length === 1 ? '' : 's'} en preparación. Guardar un encargo no inicia una ejecución.`,
      primary: 'configure',
    }
  }
  if (hasKey('acceptance', 'unknown') || hasKey('budget', 'unknown')) {
    return {
      nextStep: 'Crear solicitud o épica',
      detail: 'El alcance y criterios del encargo permiten comprobar aceptación y reservar presupuesto sin iniciar una ejecución.',
      primary: 'request',
    }
  }
  if (hasKey('runtime', 'unknown')) {
    return {
      nextStep: 'Comprobar capacidad',
      detail: `${unknown.length} requisito${unknown.length === 1 ? '' : 's'} se volverá${unknown.length === 1 ? '' : 'n'} a comprobar al iniciar; no es una aprobación implícita.`,
      primary: 'configure',
    }
  }
  if (unknown.length > 0) {
    return {
      nextStep: 'Preparar fuentes y configuración',
      detail: `${unknown.length} requisito${unknown.length === 1 ? '' : 's'} se volverá${unknown.length === 1 ? '' : 'n'} a comprobar al iniciar; no es una aprobación implícita.`,
      primary: 'configure',
    }
  }
  return { nextStep: 'Crear solicitud o épica', detail: 'El proyecto tiene una base suficiente para organizar el siguiente trabajo.', primary: 'request' }
}

export function ProjectPreparation({ preparation, onConfigure, onRequest, onStandaloneTask, initiallyOpen = false }: { preparation: DeliveryProject['preparation']; onConfigure: () => void; onRequest: () => void; onStandaloneTask: () => void; initiallyOpen?: boolean }) {
  const checks = preparation?.checks ?? []
  const missing = checks.filter(check => check.state === 'missing').length
  const unknown = checks.filter(check => check.state === 'unknown').length
  const ready = checks.filter(check => check.state === 'ready').length
  const total = checks.length
  const hasChecks = total > 0
  const readiness = total ? Math.round((ready / total) * 100) : 0
  const guidance = projectPreparationGuidance(preparation)
  return <section aria-label="Preparación del proyecto" className="my-5 rounded-3xl border border-border-subtle bg-surface-raised p-5 sm:p-6">
    <details open={initiallyOpen}>
    <summary className="min-h-11 cursor-pointer text-base font-semibold text-ink">Preparación del proyecto · {preparation && hasChecks ? `${ready} listos${missing ? ` · ${missing} por preparar` : ''}${unknown ? ` · ${unknown} por comprobar` : ''}` : 'revisar requisitos'}</summary>
    <p className="mt-2 text-sm leading-6 text-ink-secondary">Prepara el proyecto sin iniciar una ejecución. Cada solicitud o tarea vuelve a comprobar acceso, capacidad y presupuesto.</p>
    <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-soft p-4" aria-label="Progreso de preparación">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-ink-secondary"><span>{guidance.nextStep}</span><span className="tabular-nums">{preparation ? `${readiness}%` : '—'}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border-subtle" role="progressbar" aria-label="Requisitos listos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={preparation ? readiness : 0}><div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${missing ? 'bg-rose-500' : unknown ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${readiness}%` }} /></div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{!hasChecks ? 'El servidor aún no ha enviado requisitos verificables.' : missing ? 'Resolver los pendientes antes de ejecutar evita que el agente se detenga a mitad del trabajo.' : unknown ? 'Los requisitos desconocidos se verifican al iniciar; no se presentan como una aprobación.' : preparation ? 'La preparación es una señal de entrada, no sustituye los gates del encargo.' : 'El servidor aún no ha enviado el diagnóstico.'}</p>
      <div role="status" aria-label="Siguiente acción de preparación" className={`mt-3 rounded-xl border px-3 py-2.5 text-xs leading-5 ${missing ? 'border-rose-500/20 bg-rose-500/[0.05] text-rose-800' : unknown || !hasChecks ? 'border-amber-500/20 bg-amber-500/[0.05] text-amber-900' : 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-800'}`}>
        <span className="font-semibold">Siguiente acción: {guidance.nextStep}.</span> {guidance.detail}
      </div>
    </div>
    {!preparation ? <p role="status" className="mt-4 text-sm text-ink-secondary">Preparación pendiente de verificar. El servidor todavía no ha enviado un diagnóstico; esto no significa que el proyecto esté listo.</p> :
      <ol className="mt-4 divide-y divide-border-subtle">
        {checks.map(check => <li key={check.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:justify-between">
          <div><h3 className="text-sm font-semibold text-ink">{check.title}</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">{check.detail}</p></div>
          <span className={`shrink-0 text-xs font-semibold ${check.state === 'ready' ? 'text-emerald-700' : check.state === 'missing' ? 'text-rose-700' : 'text-amber-700'}`}>{check.state === 'ready' ? 'Listo' : check.state === 'missing' ? 'Falta acción' : 'Por comprobar'}</span>
        </li>)}
      </ol>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" onClick={onConfigure} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${guidance.primary === 'configure' ? 'bg-ink text-surface-raised' : 'border border-border-subtle text-ink'}`}>Preparar fuentes y configuración</button>
      <button type="button" onClick={onRequest} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${guidance.primary === 'request' ? 'bg-ink text-surface-raised' : 'border border-border-subtle text-ink'}`}>Crear solicitud o épica</button>
      <button type="button" onClick={onStandaloneTask} className="min-h-11 rounded-xl border border-border-subtle px-4 text-sm font-semibold text-ink">Crear tarea suelta</button>
    </div>
    </details>
  </section>
}
