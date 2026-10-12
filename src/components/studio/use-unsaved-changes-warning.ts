import { useEffect } from 'react'

/**
 * Asks the browser to confirm before the tab is closed or reloaded while
 * Studio still has a pending (debounced), in-flight or failed save.
 */
export function useUnsavedChangesWarning(active: boolean) {
  useEffect(() => {
    if (!active) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}

export const STUDIO_UNSAVED_CHANGES_MESSAGE =
  'Hay cambios de Studio que aún no se guardan o fallaron al guardarse. ¿Salir de todos modos?'
