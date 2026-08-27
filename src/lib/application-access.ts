import { backendBaseUrlForHostname, hostnameForRequest, tenantForRequest } from '@/lib/tenant-config'
import { readApiData } from '@/lib/api-envelope'
import { normalizeKeys } from '@/lib/normalizer'
import type { ApplicationSession } from '@/models/ApplicationSession'
import type { NextRequest } from 'next/server'

export type ApplicationAccessCheck =
  | { ok: true; session: ApplicationSession }
  | { ok: false; status: 403 | 503; error: string }

function localBackendDiagnostic(payload: unknown): string {
  if (process.env.NODE_ENV === 'production' || !payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  const message = typeof record.message === 'string' ? record.message.trim() : ''
  const detail = typeof record.error === 'string' ? record.error.trim() : ''
  const value = [message, detail].filter(Boolean).join(': ').replace(/[\r\n]+/g, ' ').slice(0, 240)
  return value ? ` Diagnóstico local: ${value}.` : ''
}

// Cognito proves identity. This preflight proves that the identity may enter
// the product selected by the current hostname before session cookies exist.
export async function verifyApplicationAccess(
  request: NextRequest,
  idToken: string
): Promise<ApplicationAccessCheck> {
  const expectedTenant = tenantForRequest(request)
  const requestHostname = hostnameForRequest(request)
  const localBackend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
  const backend = backendBaseUrlForHostname(requestHostname, localBackend)
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
          originalHost: requestHostname,
          backendHost: new URL(backend).host,
        })
        return { ok: false, status: 503, error: 'No pudimos verificar el acceso en este momento. Intenta nuevamente.' }
      }
      // A host-specific dashboard must never continue with a valid token from
      // another product. This otherwise leaves an ITBEM shell carrying an
      // EventiApp session and produces misleading organization-context 403s.
      if (session.application.code !== expectedTenant.code) {
        return {
          ok: false,
          status: 403,
          error: 'Tu sesión pertenece a otro producto. Inicia sesión nuevamente en este dashboard.',
        }
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
    const failurePayload = await response.json().catch(() => undefined)
    const diagnostic = localBackendDiagnostic(failurePayload)
    console.error('Application access verification failed', {
      requestHost: request.nextUrl.hostname,
      originalHost: requestHostname,
      backendHost: new URL(backend).host,
      status: response.status,
    })
    return {
      ok: false,
      status: 503,
      error:
        process.env.NODE_ENV !== 'production' && response.status === 401
          ? `El backend local rechazó el token de Cognito.${diagnostic} Revisa su configuración y reinícialo.`
          : response.status === 404 && process.env.NODE_ENV !== 'production'
            ? 'El backend local está desactualizado. Reinícialo y vuelve a intentar.'
            : 'No pudimos verificar el acceso en este momento. Intenta nuevamente.',
    }
  } catch (error) {
    console.error('Application access verification unavailable', {
      requestHost: request.nextUrl.hostname,
      originalHost: requestHostname,
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
