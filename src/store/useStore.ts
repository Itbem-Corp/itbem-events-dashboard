import type { WorkspaceMode } from '@/lib/access-profile'
import type { TenantCode } from '@/lib/tenant-config'
import type { ApplicationSession } from '@/models/ApplicationSession'
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

interface TenantWorkspaceContext {
  mode: WorkspaceMode
  organization: Client | null
}

/* =========================
 * STATE
 * ========================= */

interface AppState {
  // Auth
  token: string | null
  user: User | null
  applicationSession: ApplicationSession | null

  // Contexto
  currentClient: Client | null
  workspaceMode: WorkspaceMode
  activeTenantCode: TenantCode | null
  workspaceContexts: Partial<Record<TenantCode, TenantWorkspaceContext>>

  // Bootstrap control
  profileLoaded: boolean

  // Actions
  setToken: (token: string | null) => void
  setProfile: (user: User) => void
  setApplicationSession: (session: ApplicationSession) => void
  invalidateProfile: () => void

  setCurrentClient: (client: Client | null) => void
  activateTenantWorkspace: (tenantCode: TenantCode, canUsePlatformMode: boolean) => void
  selectPlatformWorkspace: (tenantCode: TenantCode) => void
  selectOrganizationWorkspace: (tenantCode: TenantCode, client: Client) => void
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
      applicationSession: null,
      currentClient: null,
      workspaceMode: 'organization',
      activeTenantCode: null,
      workspaceContexts: {},
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

      setApplicationSession: (session) =>
        set({
          applicationSession: session,
          user: session.user,
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
        set((state) => {
          const tenantCode = state.activeTenantCode
          if (!tenantCode) return { currentClient: client }
          return {
            currentClient: client,
            workspaceMode: client ? 'organization' : state.workspaceMode,
            workspaceContexts: {
              ...state.workspaceContexts,
              [tenantCode]: {
                mode: client ? 'organization' : state.workspaceMode,
                organization: client,
              },
            },
          }
        }),

      activateTenantWorkspace: (tenantCode, canUsePlatformMode) =>
        set((state) => {
          const saved = state.workspaceContexts[tenantCode]
          const mode =
            saved?.mode === 'platform' && canUsePlatformMode
              ? 'platform'
              : saved?.organization
                ? 'organization'
                : canUsePlatformMode
                  ? 'platform'
                  : 'organization'
          return {
            activeTenantCode: tenantCode,
            workspaceMode: mode,
            currentClient: mode === 'organization' ? (saved?.organization ?? null) : null,
          }
        }),

      selectPlatformWorkspace: (tenantCode) =>
        set((state) => ({
          activeTenantCode: tenantCode,
          workspaceMode: 'platform',
          currentClient: null,
          workspaceContexts: {
            ...state.workspaceContexts,
            [tenantCode]: { mode: 'platform', organization: null },
          },
        })),

      selectOrganizationWorkspace: (tenantCode, client) =>
        set((state) => ({
          activeTenantCode: tenantCode,
          workspaceMode: 'organization',
          currentClient: client,
          workspaceContexts: {
            ...state.workspaceContexts,
            [tenantCode]: { mode: 'organization', organization: client },
          },
        })),

      /**
       * Logout duro
       */
      clearSession: () =>
        set({
          token: null,
          user: null,
          applicationSession: null,
          currentClient: null,
          workspaceMode: 'organization',
          activeTenantCode: null,
          workspaceContexts: {},
          profileLoaded: false,
        }),
    }),
    {
      name: 'eventi-storage',
      version: 1,
      skipHydration: true,
      migrate: (persistedState, version) => {
        const persisted = (persistedState ?? {}) as {
          user?: User | null
          workspaceContexts?: Partial<Record<TenantCode, TenantWorkspaceContext>>
        }
        return {
          user: persisted.user ?? null,
          workspaceContexts: version < 1 ? {} : (persisted.workspaceContexts ?? {}),
        }
      },

      partialize: (state) => ({
        user: state.user,
        workspaceContexts: state.workspaceContexts,
      }),
    }
  )
)
