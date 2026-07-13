export function normalizeBaseUrl(value: string | null | undefined, fallback: string): string {
  const raw = (value ?? fallback).trim() || fallback
  return raw.replace(/\/+$/, '')
}

export function normalizeBackendBaseUrl(value: string | null | undefined, fallback: string): string {
  return normalizeBaseUrl(value, fallback).replace(/\/api$/i, '')
}
