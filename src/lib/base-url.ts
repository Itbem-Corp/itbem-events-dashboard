export function normalizeBaseUrl(value: string | null | undefined, fallback: string): string {
  const raw = (value ?? fallback).trim() || fallback
  return raw.replace(/\/+$/, '')
}

export function normalizeBackendBaseUrl(value: string | null | undefined, fallback: string): string {
  return normalizeBaseUrl(value, fallback).replace(/\/api$/i, '')
}

// The dashboard always addresses the backend origin; API callers append `/api`
// explicitly and media callers use object paths directly.
export function dashboardBackendBaseUrl(
  value = process.env.NEXT_PUBLIC_BACKEND_URL,
): string {
  return normalizeBackendBaseUrl(value, 'http://localhost:8080')
}
