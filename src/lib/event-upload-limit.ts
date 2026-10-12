/** Highest per-guest upload limit the settings panel accepts. */
export const MAX_UPLOADS_PER_GUEST = 500

/** Spanish validation message for the per-guest upload limit, or null when it is valid. */
export function uploadLimitError(value: number): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return `Escribe un número entero entre 0 y ${MAX_UPLOADS_PER_GUEST}.`
  }
  if (value > MAX_UPLOADS_PER_GUEST) {
    return `El máximo es ${MAX_UPLOADS_PER_GUEST} archivos por invitado.`
  }
  return null
}
