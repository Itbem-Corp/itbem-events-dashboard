import { backendBaseUrlForHostname } from '@/lib/tenant-config'
import { readApiData } from '@/lib/api-envelope'
import { normalizeKeys } from '@/lib/normalizer'
import type { ApplicationSession } from '@/models/ApplicationSession'
import type { NextRequest } from 'next/server'

export type ApplicationAccessCheck =
  | { ok: true; session: ApplicationSession }
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
    if (response.ok) {
      // Reuse the session payload that already proved access. Returning it to
      // the sign-in route avoids a second /api/session request after login.
      const payload = await response.json().catch(() => undefined)
      const session = normalizeKeys(readApiData(payload)) as ApplicationSession | undefined
      if (!session?.application || !session.user) {
        console.error('Application session response was incomplete', {
          requestHost: request.nextUrl.hostname,
          backendHost: new URL(backend).host,
        })
        return { ok: false, status: 503, error: 'No pudimos verificar el acceso en este momento. Intenta nuevamente.' }
      }
      return { ok: true, session }
    }
    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        error: 'Tu cuenta no tiene acceso a esta aplicación. Solicita acceso al administrador de tu organización.',
      }
    }
    console.error('Application access verification failed', {
      requestHost: request.nextUrl.hostname,
      backendHost: new URL(backend).host,
      status: response.status,
    })
    return {
      ok: false,
      status: 503,
      error:
        process.env.NODE_ENV !== 'production' && response.status === 401
          ? 'El backend local no reconoce el cliente de Cognito. Actualiza su configuración y reinícialo.'
          : response.status === 404 && process.env.NODE_ENV !== 'production'
            ? 'El backend local está desactualizado. Reinícialo y vuelve a intentar.'
            : 'No pudimos verificar el acceso en este momento. Intenta nuevamente.',
    }
  } catch (error) {
    console.error('Application access verification unavailable', {
      requestHost: request.nextUrl.hostname,
      backendHost: new URL(backend).host,
      reason: error instanceof Error ? error.name : 'UnknownError',
    })
    return {
      ok: false,
      status: 503,
      error: 'No pudimos verificar el acceso en este momento. Intenta nuevamente.',
    }
  }
}
