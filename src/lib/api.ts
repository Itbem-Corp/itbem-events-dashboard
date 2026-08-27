import axios from "axios";
import { useStore } from "@/store/useStore";
import { readApiData } from "@/lib/api-envelope";
import { normalizeBackendBaseUrl } from "@/lib/base-url";
import { getApiErrorMessage } from "@/lib/api-error";
import { backendBaseUrlForHostname, tenantCodeForHostname } from "@/lib/tenant-config";
import { releaseMutationKey, reserveMutationKey } from "@/lib/idempotency-key";
import { normalizeKeys } from "@/lib/normalizer";
import { toast } from "sonner";
import { endSession } from '@/lib/end-session'
import { organizationContextHeaders, requestContextHeaders } from '@/lib/request-context'
import type { TenantCode } from '@/products/core/product-manifest'
import type { ApplicationSession } from '@/models/ApplicationSession'

// 1. Leemos la URL base pública y le pegamos "/api" al final.
// Si no existe la variable, usamos localhost como fallback.
const configuredBaseUrl = normalizeBackendBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL, "http://localhost:8080");
const isLocalDashboardHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.localhost'))
const BASE_URL = typeof window === "undefined"
    ? configuredBaseUrl
    : isLocalDashboardHost
        ? `${window.location.origin}/automation-bridge`
        : backendBaseUrlForHostname(window.location.hostname, configuredBaseUrl);
// The local gateway already targets the backend's `/api` prefix. Keeping the
// browser-facing route free of an `/api` segment avoids embedded-browser
// content blockers while preserving the normal public backend contract.
const API_URL = isLocalDashboardHost ? BASE_URL : `${BASE_URL}/api`;

export const api = axios.create({
    baseURL: API_URL
});

// Streaming reads use fetch instead of Axios so the response body can remain
// open as an SSE stream. Keep their URL and auth/context headers on the same
// transport boundary as ordinary API calls; a live subscription must never
// silently drop tenant or organization scoping.
export function apiUrl(path: string): string {
    return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
}

const MUTATION_METHODS = new Set(["post", "put", "patch", "delete"])

type IdempotentRequestConfig = {
    _eventiIdempotencySignature?: string
    _eventiAuthRetried?: boolean
}

function releaseRequestMutationKey(config: IdempotentRequestConfig | undefined) {
    if (config?._eventiIdempotencySignature) {
        releaseMutationKey(config._eventiIdempotencySignature)
    }
}

export function normalizeApiResponseData(data: unknown, responseType?: string): unknown {
    if (responseType === 'blob') return data
    return normalizeKeys(readApiData(data))
}

let tokenPromise: Promise<string | null> | null = null;
let sessionRefreshPromise: Promise<ApplicationSession> | null = null
let lastSessionValidationAt = 0
let lastNetworkErrorToastAt = 0
let lastSessionRecoveryToastAt = 0

// Background SWR refreshes can fail together when a local API is starting or
// a connection briefly drops. A toast per request hides the useful UI, so
// communicate actionable authentication failures once and let each screen
// render its own persistent retry state for a still-starting local session.
const NETWORK_ERROR_TOAST_COOLDOWN_MS = 8_000
const SESSION_RECOVERY_TOAST_COOLDOWN_MS = 8_000

export const SESSION_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000
export const SESSION_FOCUS_REVALIDATE_AFTER_MS = 60 * 1000

// Requests made by the local dashboard first ask its BFF for a short-lived
// application token. That rejection happens before Axios has an HTTP
// `response`, so it must not be presented as if the Automation API were down.
export function localSessionRecoveryMessage(error: unknown): string | null {
    const status = (error as { status?: unknown } | null)?.status
    if (status === 401 || status === 403) {
        return 'No se pudo validar tu sesión local. Inicia sesión de nuevo.'
    }
    if (status === 503) {
        return 'La sesión local todavía se está preparando. Actualiza en unos segundos.'
    }
    return null
}

export const getAuthToken = async (forceRefresh = false) => {
    const { token, setToken } = useStore.getState();

    if (token && !forceRefresh) return token;

    if (tokenPromise) return tokenPromise;

    tokenPromise = fetch(forceRefresh ? "/api/auth/token?refresh=1" : "/api/auth/token", {
        method: "POST",
        cache: "no-store",
    })
        .then((res) => {
            if (!res.ok) {
                const error = new Error("No session") as Error & { status?: number }
                error.status = res.status
                throw error
            }
            return res.json();
        })
        .then((data) => {
            setToken(data.token);
            if (data.session) {
                useStore.getState().setApplicationSession(data.session)
                lastSessionValidationAt = Date.now()
            }
            return data.token;
        })
        .finally(() => {
            tokenPromise = null;
        });

    return tokenPromise;
};

export async function apiRequestHeaders(forceRefresh = false): Promise<Record<string, string>> {
    const token = await getAuthToken(forceRefresh)
    const state = useStore.getState()
    const sessionTenant = state.applicationSession?.application.code as TenantCode | undefined
    const hostnameTenant = typeof window === 'undefined' ? undefined : tenantCodeForHostname(window.location.hostname)
    const tenantCode = hostnameTenant ?? state.activeTenantCode ?? sessionTenant ?? 'eventiapp'
    const requestContext = {
        tenantCode,
        workspaceMode: state.workspaceMode,
        organizationId: state.currentClient?.id ?? null,
    }

    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...requestContextHeaders(requestContext, { sessionResolved: Boolean(state.applicationSession) }),
        ...organizationContextHeaders(requestContext, state.organizationContext),
    }
}

// The token endpoint verifies product access and returns the normalized
// application session in the same response. Reusing it avoids a second
// profile/session request during the first dashboard paint.
export async function getApplicationSession(): Promise<ApplicationSession> {
    await getAuthToken()
    const session = useStore.getState().applicationSession
    if (session) return session

    const error = new Error('No se pudo recuperar la sesión de la aplicación.') as Error & { status?: number }
    error.status = 503
    throw error
}

// Unlike ordinary API calls, this deliberately reaches the BFF even when an
// ID token exists in memory. It revalidates roles, organization membership and
// product access without calling Cognito again unless the ID token is near
// expiry. The promise prevents simultaneous tabs/components from stampeding
// the endpoint.
export async function refreshApplicationSession(minAgeMs = 0): Promise<ApplicationSession> {
    const currentSession = useStore.getState().applicationSession
    if (currentSession && Date.now() - lastSessionValidationAt < minAgeMs) return currentSession
    if (sessionRefreshPromise) return sessionRefreshPromise

    sessionRefreshPromise = fetch('/api/auth/token', {
        method: 'POST',
        cache: 'no-store',
    })
        .then(async (response) => {
            if (!response.ok) {
                const error = new Error('No session') as Error & { status?: number }
                error.status = response.status
                throw error
            }
            return response.json() as Promise<{ token?: string; session?: ApplicationSession }>
        })
        .then((data) => {
            if (!data.token || !data.session) {
                const error = new Error('No se pudo recuperar la sesión de la aplicación.') as Error & { status?: number }
                error.status = 503
                throw error
            }
            useStore.getState().setToken(data.token)
            useStore.getState().setApplicationSession(data.session)
            lastSessionValidationAt = Date.now()
            return data.session
        })
        .finally(() => {
            sessionRefreshPromise = null
        })

    return sessionRefreshPromise
}

// --- INTERCEPTOR DE REQUEST ---
api.interceptors.request.use(async (config) => {
    const idempotentConfig = config as typeof config & IdempotentRequestConfig
    const requestHeaders = await apiRequestHeaders()
    for (const [name, value] of Object.entries(requestHeaders)) {
        config.headers[name] = value
    }

    // Axios reuses this config after an auth refresh, so an ambiguous retry
    // keeps the same key and the API can replay the original mutation safely.
    const method = (config.method || "").toLowerCase()
    if (MUTATION_METHODS.has(method) && !config.headers["Idempotency-Key"]) {
        const reservation = reserveMutationKey(method, config.url || "", config.data)
        idempotentConfig._eventiIdempotencySignature = reservation.signature || undefined
        config.headers["Idempotency-Key"] = reservation.key
    }

    // Lógica opcional para Client-ID (La dejaste comentada, está bien)
    // const currentClient = useStore.getState().currentClient;
    // if (currentClient?.id) {
    //     config.params = { ...config.params, client_id: currentClient.id };
    // }

    return config;
});

api.interceptors.response.use((response) => {
    releaseRequestMutationKey(response.config as typeof response.config & IdempotentRequestConfig)
    // Skip binary responses: normalizeKeys() would convert a Blob to {}, corrupting downloads.
    response.data = normalizeApiResponseData(response.data, response.config.responseType)
    return response
})

// --- INTERCEPTOR DE RESPONSE ---
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status
        const requestConfig = error?.config as (typeof error.config & IdempotentRequestConfig) | undefined

        if (status === 401 && requestConfig && !requestConfig._eventiAuthRetried) {
            requestConfig._eventiAuthRetried = true
            useStore.getState().setToken(null)

            try {
                const refreshedToken = await getAuthToken(true)
                if (refreshedToken) {
                    requestConfig.headers.Authorization = `Bearer ${refreshedToken}`
                    return api.request(requestConfig)
                }
            } catch (refreshError) {
                const refreshStatus = (refreshError as Error & { status?: number }).status
                if (refreshStatus !== 401) return Promise.reject(error)
            }

            useStore.getState().clearSession()
            void endSession()
        } else if (status === 403) {
            const state = useStore.getState()
            const sessionTenant = state.applicationSession?.application.code
            const hostTenant = typeof window === 'undefined' ? undefined : tenantCodeForHostname(window.location.hostname)
            if (sessionTenant && hostTenant && sessionTenant !== hostTenant) {
                toast.error('La sesión corresponde a otro producto. Inicia sesión nuevamente en este dashboard.')
                state.clearSession()
                void endSession()
                return Promise.reject(error)
            }
            const responseBody = JSON.stringify(error?.response?.data ?? '').toLowerCase()
            if (responseBody.includes('application context denied')) {
                // This is a product boundary violation, not an expired
                // organization credential. Retrying the workspace renewal
                // would only keep a mismatched token in a visible loop.
                toast.error('La sesión no corresponde a este producto. Redirigiendo al acceso correcto.')
                state.clearSession()
                void endSession()
            } else if (
                responseBody.includes('organization context token is required') ||
                responseBody.includes('organization context token is invalid or expired')
            ) {
                // Context credentials are intentionally short-lived. Clear a stale
                // credential so the renewal hook can mint a fresh, session-bound one
                // instead of leaving the workspace stuck behind repeated 403s.
                state.setOrganizationContextCredential(null)
                toast.info('El contexto del espacio se renovará automáticamente.')
            } else {
                toast.error(getApiErrorMessage(error, 'Sin permisos para realizar esta acción'))
            }
        } else if (!error?.response) {
            const sessionMessage = localSessionRecoveryMessage(error)
            if (sessionMessage) {
                const sessionStatus = (error as { status?: unknown }).status
                // A 503 means the local session is still warming up. Every
                // Automation surface already renders a precise inline state
                // with a retry action; a floating error duplicates it and
                // covers the live header. Invalid sessions remain actionable
                // globally, so they retain the rate-limited toast.
                if (sessionStatus !== 503) {
                    const now = Date.now()
                    if (now - lastSessionRecoveryToastAt >= SESSION_RECOVERY_TOAST_COOLDOWN_MS) {
                        lastSessionRecoveryToastAt = now
                        toast.error(sessionMessage)
                    }
                }
                if (sessionStatus === 401 || sessionStatus === 403) {
                    useStore.getState().clearSession()
                    void endSession()
                }
                return Promise.reject(error)
            }
            // Network error (no response from server at all)
            const now = Date.now()
            if (now - lastNetworkErrorToastAt >= NETWORK_ERROR_TOAST_COOLDOWN_MS) {
                lastNetworkErrorToastAt = now
                toast.error('No se pudo conectar con el backend. Revisa que la API local esté activa.')
            }
        }

        // A network failure is ambiguous: retain the key so a manual retry can
        // replay a server-side success. Known HTTP responses release it, except
        // auth refreshes and in-flight conflicts which reuse the same request.
        if (error?.response && status !== 401 && status !== 409) {
            releaseRequestMutationKey(requestConfig)
        }

        return Promise.reject(error);
    }
);
