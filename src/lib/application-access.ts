import { backendBaseUrlForHostname } from '@/lib/tenant-config'
import type { NextRequest } from 'next/server'

export type ApplicationAccessCheck =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string }

// Cognito proves identity. This preflight proves that the identity may enter
// the product selected by the current hostname before session cookies exist.
export async function verifyApplicationAccess(
  request: NextRequest,
  idToken: string
): Promise<ApplicationAccessCheck> {
  const localBackend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
  const backend = backendBaseUrlForHostname(request.nextUrl.hostname, localBackend)
  try {
    const response = await fetch(`${backend}/api/session`, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (response.ok) return { ok: true }
    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        error: 'Tu cuenta no tiene acceso a esta aplicación. Solicita acceso al administrador de tu organización.',
      }
    }
    return {
      ok: false,
      status: 503,
      error: 'No pudimos verificar el acceso en este momento. Intenta nuevamente.',
    }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'No pudimos verificar el acceso en este momento. Intenta nuevamente.',
    }
  }
}
