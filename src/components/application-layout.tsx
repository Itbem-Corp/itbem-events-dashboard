'use client'

import { ApplicationNavbarAccount } from '@/components/account/application-navbar-account'
import { ApplicationSidebarFooter } from '@/components/account/application-sidebar-footer'
import { ApplicationPrimaryNavigation } from '@/components/application-primary-navigation'
import {
  ApplicationCommandPaletteController,
  openApplicationCommandPalette,
  preloadApplicationCommandPalette,
} from '@/components/ui/application-command-palette-controller'
import { ApplicationSearchButton } from '@/components/ui/application-search-button'
import { LazyNotificationButton } from '@/components/ui/lazy-notification-button'

import { MobilePrimaryNavigation, mobilePrimaryNavigationItems } from '@/components/mobile-primary-navigation'
import { Navbar, NavbarSection } from '@/components/navbar'
import { BrandMark } from '@/components/product/brand-mark'
import { Sidebar } from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import type { OrganizationOption } from '@/components/workspace/organization-option'
import { ApplicationWorkspaceHeader } from '@/components/workspace/application-workspace-header'
import { OrganizationSwitcher } from '@/components/workspace/organization-switcher'
import { Link } from '@/components/link'
import { useDebounce } from '@/hooks/useDebounce'
import { useStoreHydration } from '@/hooks/useStoreHydration'
import { useScopedFetcherScope } from '@/hooks/useScopedFetcherKey'
import { issueOrganizationContext } from '@/features/workspace/issue-organization-context'
import { useOrganizationContextRenewal } from '@/features/workspace/use-organization-context-renewal'
import { AutomationSectionNavigation } from '@/features/automation/automation-section-navigation'
import type { AccessProfile } from '@/lib/access-profile'
import {
  applicationRoutePreloadPath,
  createApplicationNavigation,
  type ApplicationNavigation,
  type ApplicationRoute,
} from '@/lib/application-navigation'
import { readApiData } from '@/lib/api-envelope'
import {
  clientsPagePath,
  eventsPagePath,
  scopedEventsDashboardPath,
  usersPath,
} from '@/lib/api-paths'
import { fetcher } from '@/lib/fetcher'
import { responsiveListSwrOptions } from '@/lib/responsive-list-swr'
import { getDataErrorState } from '@/lib/swr-data-state'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { TenantConfig } from '@/lib/tenant-config'
import { useAccessProfile } from '@/lib/use-access-profile'
import type { ClientsPageResponse } from '@/models/Client'
import { useProductShell } from '@/products/core/product-context'
import { productSupportsFeature } from '@/products/core/product-manifest'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { preload, unstable_serialize, useSWRConfig } from 'swr'

const defaultTenant = tenantPresentationForHostname('dashboard.eventiapp.com.mx')

function normalizeClient(raw: OrganizationOption) {
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    logo: raw.logo,
    access_role: raw.access_role,
    client_type: raw.client_type ?? { code: '' },
  }
}

/* =========================
 * LAYOUT
 * ========================= */

export function ApplicationLayout({
  children,
  tenant = defaultTenant,
  accessProfile: providedAccessProfile,
  navigation: providedNavigation,
}: {
  children: React.ReactNode
  tenant?: Omit<TenantConfig, 'clientId'>
  /** Computed once by AppLayoutClient; computed here when rendered alone. */
  accessProfile?: AccessProfile
  navigation?: ApplicationNavigation
}) {
  const pathname = usePathname()
  const router = useRouter()
  const storeHydrated = useStoreHydration()
  const { cache: swrCache } = useSWRConfig()
  const scopeFetcherKey = useScopedFetcherScope()
  const shell = useProductShell()
  const accessibleShell = Boolean(shell?.accessibleShell)

  const [clientsRequested, setClientsRequested] = useState(false)
  const [organizationSwitcherOpen, setOrganizationSwitcherOpen] = useState(false)
  const [organizationSearch, setOrganizationSearch] = useState('')
  const prefetchedRoutesRef = useRef<Set<ApplicationRoute>>(new Set())
  const debouncedOrganizationSearch = useDebounce(organizationSearch, 200)

  const currentClient = useStore((s) => s.currentClient)
  const activateTenantWorkspace = useStore((s) => s.activateTenantWorkspace)
  const selectPlatformWorkspace = useStore((s) => s.selectPlatformWorkspace)
  const selectOrganizationWorkspace = useStore((s) => s.selectOrganizationWorkspace)
  const selectPortfolioWorkspace = useStore((s) => s.selectPortfolioWorkspace)
  const clearSession = useStore((s) => s.clearSession)
  const user = useStore((s) => s.user)
  const applicationSession = useStore((s) => s.applicationSession)
  const hasApplicationSession = Boolean(applicationSession)
  useOrganizationContextRenewal()

  const isRoot = Boolean(user?.is_root)
  const ownAccessProfile = useAccessProfile()
  const accessProfile = providedAccessProfile ?? ownAccessProfile
  const { listsAcrossOrganizations } = accessProfile
  const modules = useMemo(
    () => applicationSession?.application.modules ?? tenant.modules,
    [applicationSession?.application.modules, tenant.modules]
  )
  const product = getProductManifest(tenant.code)
  const ownNavigation = useMemo(
    () =>
      createApplicationNavigation({
        accessProfile,
        hasApplicationSession,
        isRoot,
        modules,
        product,
      }),
    [accessProfile, hasApplicationSession, isRoot, modules, product]
  )
  const navigation = providedNavigation ?? ownNavigation
  const {
    hasEvents,
    canViewUsers,
    canViewOrganizations,
    canManageMembers,
    canViewMetrics,
    canViewAudit,
    canUseAutomation,
    canManageAutomationConfiguration,
    canSwitchOrganizations,
    showHome,
    eventsLabel,
    showWorkspaceBlock,
    landingPath,
  } = navigation
  // Owner/Admin who also hold event grants elsewhere reach those events from
  // the switcher ('Eventos asignados'), even with a single organization.
  const offersPortfolioWorkspace =
    accessProfile.usesCallerAccessWorkspace &&
    accessProfile.platformLevel === 'none' &&
    accessProfile.isOrganizationAdmin &&
    Boolean(applicationSession?.event_access)
  const showOrganizationSwitcher = showWorkspaceBlock && (canSwitchOrganizations || offersPortfolioWorkspace)
  // On a cold login, resolve the first organization in parallel with the profile.
  // The paginated endpoint scopes itself from the authenticated identity, so this
  // does not need to wait until the profile reveals whether the user is root.
  // Caller-access products wait for the session instead: members there never
  // choose an organization, so they must never request the organization list.
  const shouldBootstrapClient =
    storeHydrated &&
    !currentClient &&
    !accessProfile.isPortfolioContext &&
    (!accessProfile.usesCallerAccessWorkspace || hasApplicationSession)
  const shouldLoadClients = !accessProfile.isPortfolioForced && (clientsRequested || shouldBootstrapClient)
  const openOrganizationSwitcher = useCallback(() => setOrganizationSwitcherOpen(true), [])
  const requestOrganizations = useCallback(() => setClientsRequested(true), [])
  const handleSelectOrganization = useCallback(
    async (client: OrganizationOption) => {
      const normalized = normalizeClient(client)
      const credential = await issueOrganizationContext(normalized.id)
      selectOrganizationWorkspace(tenant.code, normalized, credential)
    },
    [selectOrganizationWorkspace, tenant.code]
  )

  const allowPortfolioSelection = accessProfile.usesCallerAccessWorkspace && Boolean(applicationSession?.event_access)
  useEffect(() => {
    if (!storeHydrated || !hasApplicationSession) return
    activateTenantWorkspace(tenant.code, {
      canUsePlatformMode: accessProfile.canUsePlatformMode,
      portfolio: accessProfile.isPortfolioForced,
      allowPortfolioSelection,
    })
    // A revalidated session is a new object with the same content. Depending
    // on the boolean keeps the workspace (and its credential) untouched.
  }, [
    accessProfile.canUsePlatformMode,
    accessProfile.isPortfolioForced,
    activateTenantWorkspace,
    allowPortfolioSelection,
    hasApplicationSession,
    storeHydrated,
    tenant.code,
  ])

  const preloadDataIfMissing = useCallback(
    (path: string) => {
      const key = scopeFetcherKey(path)
      if (swrCache.get(unstable_serialize(key))?.data !== undefined) return
      void Promise.resolve(preload(key, fetcher)).catch(() => undefined)
    },
    [scopeFetcherKey, swrCache]
  )

  useEffect(() => {
    // Route payloads are scoped by tenant and organization. Deduplicate eager
    // intent within one scope, then allow fresh prefetches after it changes.
    prefetchedRoutesRef.current.clear()
  }, [currentClient?.id, isRoot, listsAcrossOrganizations, tenant.code])

  const prefetchRoute = useCallback((href: ApplicationRoute) => {
    if (prefetchedRoutesRef.current.has(href)) return
    prefetchedRoutesRef.current.add(href)
    router.prefetch(href)
  }, [router])

  const preloadRoute = useCallback(
    (href: ApplicationRoute) => {
      prefetchRoute(href)
      const dataPath = applicationRoutePreloadPath({ href, clientId: currentClient?.id, listsAcrossOrganizations })
      if (dataPath) preloadDataIfMissing(dataPath)
    },
    [currentClient?.id, listsAcrossOrganizations, preloadDataIfMissing, prefetchRoute]
  )

  function preloadClientPortfolio(clientId: string) {
    prefetchRoute('/')
    if (!productSupportsFeature(product, 'events')) return
    prefetchRoute('/events')
    preloadDataIfMissing(eventsPagePath(clientId, { page: 1, page_size: 12, filter: 'all' }))
    const dashboardPath = scopedEventsDashboardPath(clientId, listsAcrossOrganizations)
    if (dashboardPath) preloadDataIfMissing(dashboardPath)
  }

  const preloadProfile = useCallback(() => {
    router.prefetch('/settings/profile')
    preloadDataIfMissing(usersPath())
  }, [preloadDataIfMissing, router])


  const clientsKey = shouldLoadClients
    ? clientsPagePath({ page: 1, page_size: 50, search: isRoot ? debouncedOrganizationSearch : undefined })
    : null
  const {
    data: rawClients,
    error: clientsError,
    isLoading: clientsLoading,
    isValidating: clientsValidating,
    mutate: retryClients,
  } = useSWR<ClientsPageResponse>(clientsKey, fetcher, {
    ...responsiveListSwrOptions,
    keepPreviousData: true,
  })
  const clientsPage = useMemo(() => readApiData<ClientsPageResponse | undefined>(rawClients), [rawClients])
  // GET /clients also returns organizations of other products and child
  // organizations a non-root cannot select (X-Organization-ID must be one of
  // the session organizations). Products that ask for it keep only those.
  const filterClientsToSession =
    shell?.workspaceSource === 'clients-api-session-filtered' && accessProfile.platformLevel === 'none'
  const sessionOrganizationIds = useMemo(
    () => new Set((applicationSession?.organizations ?? []).map((organization) => organization.id)),
    [applicationSession?.organizations]
  )
  const clients = useMemo(() => {
    const list = clientsPage?.data ?? []
    if (!filterClientsToSession || !applicationSession) return list
    return list.filter((client) => sessionOrganizationIds.has(client.id))
  }, [applicationSession, clientsPage?.data, filterClientsToSession, sessionOrganizationIds])
  const clientsTotal = filterClientsToSession ? clients.length : (clientsPage?.total ?? clients.length)
  const clientsErrorState = getDataErrorState(clientsError, rawClients)
  /* Auto-select client */
  useEffect(() => {
    // The caller-access workspace has no organization to select.
    if (accessProfile.isPortfolioContext) return
    if (!rawClients) return

    const list = clients

    // ✅ Si hay clientes y no hay currentClient → seleccionar
    const preferred = list.find((client) => client.code?.toLowerCase() === tenant.organizationCode)
    // Organizations inherited through a parent Owner/Admin membership
    // (INHERITED_OWNER / INHERITED_ADMIN) are part of the verified session even
    // if a list page does not include them; keep such a selection.
    const currentIsAllowed =
      currentClient &&
      (list.some((client) => client.id === currentClient.id) ||
        Boolean(applicationSession?.organizations.some((organization) => organization.id === currentClient.id)))

    // Organization-scoped apps cannot retain a workspace selected on another
    // branded origin. EventiApp and ITBEM keep their portfolio switcher.
    if (!canSwitchOrganizations && preferred && currentClient?.id !== preferred.id) {
      selectOrganizationWorkspace(tenant.code, normalizeClient(preferred))
      return
    }

    if (accessProfile.isPlatformContext) return

    if (list.length > 0 && !currentIsAllowed) {
      selectOrganizationWorkspace(tenant.code, normalizeClient(preferred ?? list[0]))
      return
    }

    // 🚫 SOLO usuarios NO ROOT van a onboarding
    if (list.length === 0 && user && !isRoot) {
      router.push(landingPath)
    }

    // ✅ ROOT con 0 clientes → NO REDIRECT
  }, [
    accessProfile.isPlatformContext,
    applicationSession,
    accessProfile.isPortfolioContext,
    canSwitchOrganizations,
    clients,
    currentClient,
    isRoot,
    landingPath,
    rawClients,
    router,
    selectOrganizationWorkspace,
    tenant,
    user,
  ])

  const mobileNavigationFlags = {
    showHome,
    showEvents: hasEvents,
    showMetrics: canViewMetrics,
    showTeam: canManageMembers && !canViewUsers,
    showUsers: canViewUsers,
    showOrganizations: canViewOrganizations,
    showAutomation: canUseAutomation,
  }
  // The accessible shell hides a bottom bar with a single destination and
  // publishes its height so fixed overlays can sit above it.
  const mobileNavigationState = accessibleShell
    ? mobilePrimaryNavigationItems(mobileNavigationFlags).length >= 2
      ? 'visible'
      : 'hidden'
    : undefined

  return (
    <div
      className="app-product-shell"
      data-product={tenant.code}
      style={{ '--tenant-accent': tenant.accent } as React.CSSProperties}
    >
      <SidebarLayout
        mobileNavigation={mobileNavigationState}
        navbar={
          <Navbar>
            <Link
              href={landingPath}
              aria-label={`${tenant.name} — ir al inicio`}
              className="group flex min-w-0 items-center gap-2.5 rounded-xl py-1 pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--tenant-accent)"
            >
              <BrandMark code={tenant.code} name={tenant.name} accent={tenant.accent} size="sm" priority />
              <span className="hidden min-[420px]:block">
                <span className="block text-sm font-semibold tracking-tight text-ink">
                  {tenant.name}
                </span>
                <span
                  className={`block ${accessibleShell ? 'text-xs' : 'text-[9px]'} font-medium tracking-[0.16em] text-ink-muted uppercase`}
                >
                  {accessibleShell ? tenant.productLabel : 'Dashboard'}
                </span>
              </span>
            </Link>
            <span className="flex-1" aria-hidden="true" />
            <NavbarSection>
              <ApplicationSearchButton onOpen={openApplicationCommandPalette} onIntent={preloadApplicationCommandPalette} />
              {hasEvents && <LazyNotificationButton />}
              <ThemeToggle className={accessibleShell ? undefined : 'size-9'} />
              <ApplicationNavbarAccount user={user} clearSession={clearSession} onProfileIntent={preloadProfile} />
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <Sidebar className="itbem-sidebar">
            <ApplicationWorkspaceHeader
              accessProfile={accessProfile}
              canSwitchOrganizations={canSwitchOrganizations || offersPortfolioWorkspace}
              currentClient={currentClient}
              tenant={tenant}
              showWorkspaceBlock={showWorkspaceBlock}
              homeHref={landingPath}
              onOpenSwitcher={openOrganizationSwitcher}
              onSwitcherIntent={requestOrganizations}
            />

            <ApplicationPrimaryNavigation
              pathname={pathname}
              tenantCode={tenant.code}
              showHome={showHome}
              eventsLabel={eventsLabel}
              hasEvents={hasEvents}
              canViewMetrics={canViewMetrics}
              canViewUsers={canViewUsers}
              canViewAudit={canViewAudit}
              canUseAutomation={canUseAutomation}
              canManageAutomationConfiguration={canManageAutomationConfiguration}
              canManageMembers={canManageMembers}
              canViewOrganizations={canViewOrganizations}
              onIntent={preloadRoute}
            />

            <ApplicationSidebarFooter
              user={user}
              clearSession={clearSession}
              onProfileIntent={preloadProfile}
              onSearchIntent={preloadApplicationCommandPalette}
              onSearchOpen={openApplicationCommandPalette}
            />
          </Sidebar>
        }
      >
        {accessProfile.isOrganizationContext && currentClient && accessProfile.platformLevel !== 'none' && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--tenant-accent)/15 bg-(--tenant-accent)/[0.045] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="size-2 shrink-0 rounded-full bg-(--tenant-accent)" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  Administrando{' '}
                  <span className="font-semibold text-ink">{currentClient.name}</span>
                </p>
                <p className={`${accessibleShell ? 'text-xs' : 'text-[11px]'} text-ink-muted`}>
                  {accessProfile.platformLevel === 'root_1' ? 'Acceso Root 1' : 'Modo soporte Root 2'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => selectPlatformWorkspace(tenant.code)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-(--tenant-accent) transition-colors hover:bg-surface-interactive"
            >
              Volver a plataforma
            </button>
          </div>
        )}
        {canUseAutomation && pathname.startsWith('/automation') && (
          <AutomationSectionNavigation pathname={pathname} onIntent={preloadRoute} canManageConfiguration={canManageAutomationConfiguration} />
        )}
        {children}
        <MobilePrimaryNavigation
          pathname={pathname}
          tenantCode={tenant.code}
          eventsLabel={eventsLabel}
          {...mobileNavigationFlags}
          onIntent={preloadRoute}
        />
      </SidebarLayout>

      {showOrganizationSwitcher && (
        <OrganizationSwitcher
          open={organizationSwitcherOpen}
          onClose={() => setOrganizationSwitcherOpen(false)}
          tenant={tenant}
          accessProfile={accessProfile}
          currentClient={currentClient}
          clients={clients}
          clientsTotal={clientsTotal}
          search={organizationSearch}
          loading={clientsLoading}
          validating={clientsValidating}
          errorState={clientsErrorState}
          onSearchChange={setOrganizationSearch}
          onRetry={() => void retryClients()}
          onPreloadOrganization={preloadClientPortfolio}
          onSelectOrganization={handleSelectOrganization}
          onSelectPlatform={() => selectPlatformWorkspace(tenant.code)}
          onSelectPortfolio={offersPortfolioWorkspace ? () => selectPortfolioWorkspace(tenant.code) : undefined}
        />
      )}

      <ApplicationCommandPaletteController
        enabled={hasEvents}
        isRoot={accessProfile.isPlatformContext && accessProfile.platformLevel !== 'none'}
        listsAcrossOrganizations={listsAcrossOrganizations}
        showHome={showHome}
        eventsLabel={eventsLabel}
        clientId={currentClient?.id}
      />
    </div>
  )
}
