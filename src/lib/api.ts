import axios from "axios";
import { useStore } from "@/store/useStore";
import { toast } from "sonner";

// 1. Leemos la URL base pública y le pegamos "/api" al final.
// Si no existe la variable, usamos localhost como fallback.
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const API_URL = `${BASE_URL}/api`;

export const api = axios.create({
    baseURL: API_URL
});

let tokenPromise: Promise<string> | null = null;

const getAuthToken = async () => {
    const { token, setToken } = useStore.getState();

    if (token) return token;

    if (tokenPromise) return tokenPromise;

    tokenPromise = fetch("/api/auth/token")
        .then((res) => {
            if (!res.ok) throw new Error("No session");
            return res.json();
        })
        .then((data) => {
            setToken(data.token);
            return data.token;
        })
        .catch(() => {
            useStore.getState().clearSession();
            return null;
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

// --- NORMALIZER: PascalCase → snake_case ---
import { normalizeKeys } from "@/lib/normalizer"

api.interceptors.response.use((response) => {
    response.data = normalizeKeys(response.data)
    return response
})

// --- INTERCEPTOR DE RESPONSE ---
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status

        // Si Go responde 401 (Unauthorized), significa que el token expiró o es falso
        if (status === 401) {
            useStore.getState().clearSession();
            // Redirigimos al endpoint de Next.js que limpia las cookies
            if (typeof window !== "undefined") {
                window.location.href = "/logout";
            }
        } else if (status === 403) {
            toast.error('Sin permisos para realizar esta acción')
        } else if (!error?.response) {
            // Network error (no response from server at all)
            toast.error('Sin conexión. Verifica tu red e intenta de nuevo')
        }

        return Promise.reject(error);
    }
);