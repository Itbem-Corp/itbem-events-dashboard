import axios from "axios";
import { useStore } from "@/store/useStore";
import { readApiData } from "@/lib/api-envelope";
import { normalizeBackendBaseUrl } from "@/lib/base-url";
import { getApiErrorMessage } from "@/lib/api-error";
import { backendBaseUrlForHostname } from "@/lib/tenant-config";
import { normalizeKeys } from "@/lib/normalizer";
import { toast } from "sonner";

// 1. Leemos la URL base pública y le pegamos "/api" al final.
// Si no existe la variable, usamos localhost como fallback.
const configuredBaseUrl = normalizeBackendBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL, "http://localhost:8080");
const BASE_URL = typeof window === "undefined"
    ? configuredBaseUrl
    : backendBaseUrlForHostname(window.location.hostname, configuredBaseUrl);
const API_URL = `${BASE_URL}/api`;

export const api = axios.create({
    baseURL: API_URL
});

export function normalizeApiResponseData(data: unknown, responseType?: string): unknown {
    if (responseType === 'blob') return data
    return normalizeKeys(readApiData(data))
}

let tokenPromise: Promise<string | null> | null = null;

const getAuthToken = async (forceRefresh = false) => {
    const { token, setToken } = useStore.getState();

    if (token && !forceRefresh) return token;

    if (tokenPromise) return tokenPromise;

    tokenPromise = fetch(forceRefresh ? "/api/auth/token?refresh=1" : "/api/auth/token")
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
            return data.token;
        })
        .finally(() => {
            tokenPromise = null;
        });

    return tokenPromise;
};

// --- INTERCEPTOR DE REQUEST ---
api.interceptors.request.use(async (config) => {
    const token = await getAuthToken();

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    // Lógica opcional para Client-ID (La dejaste comentada, está bien)
    // const currentClient = useStore.getState().currentClient;
    // if (currentClient?.id) {
    //     config.params = { ...config.params, client_id: currentClient.id };
    // }

    return config;
});

api.interceptors.response.use((response) => {
    // Skip binary responses: normalizeKeys() would convert a Blob to {}, corrupting downloads.
    response.data = normalizeApiResponseData(response.data, response.config.responseType)
    return response
})

// --- INTERCEPTOR DE RESPONSE ---
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status
        const requestConfig = error?.config as (typeof error.config & { _eventiAuthRetried?: boolean }) | undefined

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
            if (typeof window !== "undefined") window.location.href = "/logout"
        } else if (status === 403) {
            toast.error(getApiErrorMessage(error, 'Sin permisos para realizar esta acción'))
        } else if (!error?.response) {
            // Network error (no response from server at all)
            toast.error('Sin conexión. Verifica tu red e intenta de nuevo')
        }

        return Promise.reject(error);
    }
);
