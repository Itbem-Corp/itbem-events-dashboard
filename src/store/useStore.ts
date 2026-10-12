import type { WorkspaceMode } from '@/lib/access-profile'
import type { TenantCode } from '@/lib/tenant-config'
import type { ApplicationSession } from '@/models/ApplicationSession'
import type { OrganizationContextCredential } from '@/lib/request-context'
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
  /** The caller-access workspace (organization mode, no organization). */
  portfolio?: boolean
}

export interface ActivateTenantWorkspaceOptions {
  canUsePlatformMode: boolean
  /** The shell forces the caller-access workspace for this user. */
  portfolio?: boolean
  /** The user may choose the caller-access workspace and restore it. */
  allowPortfolioSelection?: boolean
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
  organizationContext: OrganizationContextCredential | null
  /** In memory only: the active workspace is the caller-access list. */
  workspacePortfolio: boolean

  // Bootstrap control
  profileLoaded: boolean

  // Actions
  setToken: (token: string | null) => void
  setProfile: (user: User) => void
  setApplicationSession: (session: ApplicationSession) => void
  invalidateProfile: () => void

  setCurrentClient: (client: Client | null) => void
  activateTenantWorkspace: (tenantCode: TenantCode, options: ActivateTenantWorkspaceOptions) => void
  selectPortfolioWorkspace: (tenantCode: TenantCode) => void
  selectPlatformWorkspace: (tenantCode: TenantCode) => void
  selectOrganizationWorkspace: (tenantCode: TenantCode, client: Client, credential?: OrganizationContextCredential) => void
  setOrganizationContextCredential: (credential: OrganizationContextCredential | null) => void
  clearSession: () => void
}

/* =========================
 * STORE
 * ========================= */

// Caller-access workspace: organization mode with no organization, so no
// X-Organization-ID is sent and no organization credential is ever issued.
// It also overwrites a persisted organization from an earlier visit.
function portfolioWorkspaceState(state: AppState, tenantCode: TenantCode): Partial<AppState> {
  return {
    activeTenantCode: tenantCode,
    workspaceMode: 'organization',
    currentClient: null,
    organizationContext: null,
    workspacePortfolio: true,
    workspaceContexts: {
      ...state.workspaceContexts,
      [tenantCode]: { mode: 'organization', organization: null, portfolio: true },
    },
  }
}

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
      organizationContext: null,
      workspacePortfolio: false,
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
          if (!tenantCode) return { currentClient: client, organizationContext: null }
          return {
            currentClient: client,
            organizationContext: null,
            workspacePortfolio: client ? false : state.workspacePortfolio,
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

      activateTenantWorkspace: (tenantCode, { canUsePlatformMode, portfolio = false, allowPortfolioSelection = false }) =>
        set((state) => {
          const saved = state.workspaceContexts[tenantCode]
          if (portfolio || (allowPortfolioSelection && saved?.portfolio)) {
            return portfolioWorkspaceState(state, tenantCode)
          }

          const mode =
            saved?.mode === 'platform' && canUsePlatformMode
              ? 'platform'
              : saved?.organization
                ? 'organization'
                : canUsePlatformMode
                  ? 'platform'
                  : 'organization'
          const organization = mode === 'organization' ? (saved?.organization ?? null) : null
          // Re-activating the workspace that is already active (for example
          // after the session revalidates) keeps its organization credential.
          // Dropping it forced a new POST /session/organization-context on
          // every revalidation even though nothing had changed.
          const keepsCredential =
            state.activeTenantCode === tenantCode &&
            organization !== null &&
            state.organizationContext?.organizationId === organization.id
          return {
            activeTenantCode: tenantCode,
            workspaceMode: mode,
            currentClient: organization,
            organizationContext: keepsCredential ? state.organizationContext : null,
            workspacePortfolio: false,
          }
        }),

      selectPortfolioWorkspace: (tenantCode) => set((state) => portfolioWorkspaceState(state, tenantCode)),

      selectPlatformWorkspace: (tenantCode) =>
        set((state) => ({
          activeTenantCode: tenantCode,
          workspaceMode: 'platform',
          currentClient: null,
          organizationContext: null,
          workspacePortfolio: false,
          workspaceContexts: {
            ...state.workspaceContexts,
            [tenantCode]: { mode: 'platform', organization: null },
          },
        })),

      selectOrganizationWorkspace: (tenantCode, client, credential) =>
        set((state) => ({
          activeTenantCode: tenantCode,
          workspaceMode: 'organization',
          currentClient: client,
          organizationContext: credential ?? null,
          workspacePortfolio: false,
          workspaceContexts: {
            ...state.workspaceContexts,
            [tenantCode]: { mode: 'organization', organization: client },
          },
        })),

      setOrganizationContextCredential: (credential) =>
        set((state) => ({
          organizationContext:
            credential && state.workspaceMode === 'organization' && state.currentClient?.id === credential.organizationId
              ? credential
              : null,
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
          organizationContext: null,
          workspacePortfolio: false,
          profileLoaded: false,
        }),
    }),
    {
      name: 'eventi-storage',
      version: 2,
      skipHydration: true,
      migrate: (persistedState, version) => {
        const persisted = (persistedState ?? {}) as {
          workspaceContexts?: Partial<Record<TenantCode, TenantWorkspaceContext>>
        }
        return {
          // Identity, profile image, roles and capabilities must always come
          // from the current server-verified ApplicationSession, never from
          // browser storage left by a previous login.
          workspaceContexts: version < 1 ? {} : (persisted.workspaceContexts ?? {}),
        }
      },

      partialize: (state) => ({
        workspaceContexts: state.workspaceContexts,
      }),
    }
  )
)
