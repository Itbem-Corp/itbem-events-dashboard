// Kept apart from seating-plan-v2 so the event page can use it without loading the seating bundle.
export const SEATING_UNSAVED_CHANGES_MESSAGE =
  'Tienes cambios sin guardar en el plano de mesas. Si sales ahora, se perderán. ¿Quieres salir?'

/** Returns true when it is fine to leave the seating tab (no unsaved changes, or the host confirmed). */
export function confirmLeaveSeating(hasUnsavedChanges: boolean, confirm: (message: string) => boolean): boolean {
  if (!hasUnsavedChanges) return true
  return confirm(SEATING_UNSAVED_CHANGES_MESSAGE)
}
