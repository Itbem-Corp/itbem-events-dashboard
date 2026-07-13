import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* =========================
 * MODELOS
 * ========================= */

interface User {
    id: string
    email: string
    first_name: string
    last_name: string
    profile_image?: string
    is_active?: boolean
    is_root?: boolean
    root_level?: number
    cognito_sub?: string
    clients?: number
    full_name?: string
}

interface Client {
    id: string
    name: string
    code: string
    logo?: string
    // Provided by the organization list API for the authenticated user. Keep
    // it in the selected context so route-level controls can mirror the
    // server-side capability ceiling without an extra request.
    access_role?: string
    client_type: {
        code: string
    }
    client_type_id?: string
    created_at?: string
}

/* =========================
 * STATE
 * ========================= */

interface AppState {
    // Auth
    token: string | null
    user: User | null

    // Contexto
    currentClient: Client | null

    // Bootstrap control
    profileLoaded: boolean

    // Actions
    setToken: (token: string | null) => void
    setProfile: (user: User) => void
    invalidateProfile: () => void

    setCurrentClient: (client: Client | null) => void
    clearSession: () => void
}

/* =========================
 * STORE
 * ========================= */

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            // --- STATE ---
            token: null,
            user: null,
            currentClient: null,
            profileLoaded: false,

            // --- ACTIONS ---

            /**
             * Se llama al login / refresh token
             * 👉 Invalida perfil para que SessionBootstrap cargue /users
             */
            setToken: (token) =>
                set({
                    token,
                    profileLoaded: false,
                }),

            /**
             * Usado SOLO por SessionBootstrap
             */
            setProfile: (user) =>
                set({
                    user,
                    profileLoaded: true,
                }),

            /**
             * Usado después de PUT /users o POST /users/avatar
             * 👉 Fuerza re-fetch de /users
             */
            invalidateProfile: () =>
                set({
                    profileLoaded: false,
                }),

            /**
             * Cambio manual de organización
             */
            setCurrentClient: (client) =>
                set({
                    currentClient: client,
                }),

            /**
             * Logout duro
             */
            clearSession: () =>
                set({
                    token: null,
                    user: null,
                    currentClient: null,
                    profileLoaded: false,
                }),
        }),
        {
            name: 'eventi-storage',
            skipHydration: true,

            partialize: (state) => ({
                user: state.user,
                currentClient: state.currentClient,
            }),
        }
    )
)
