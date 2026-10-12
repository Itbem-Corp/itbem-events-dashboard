import { accessCan, isOrganizationAdminRole, type AccessProfile } from '@/lib/access-profile'
import {
  auditLogsPath,
  automationAgentsPath,
  automationCostsPath,
  automationDispatchQueuePath,
  automationPortfolioPath,
  deliveryClientsPath,
  clientMembersPagePath,
  clientsPagePath,
  metricsPortfolioPath,
  scopedEventsDashboardPath,
  scopedEventsPagePath,
  usersAllPath,
} from '@/lib/api-paths'
import {
  productSupportsFeature,
  productSupportsPath,
  type ProductManifest,
  type TenantModule,
} from '@/products/core/product-manifest'

export type ApplicationRoute = '/' | '/events' | '/metrics' | '/team' | '/users' | '/clients' | '/audit' | '/automation' | '/automation/agents' | '/automation/dispatch' | '/automation/recurrences' | '/automation/traces' | '/automation/costs' | '/automation/clients' | '/automation/projects' | '/automation/settings'

export type ApplicationNavigation = {
  hasEvents: boolean
  canViewUsers: boolean
  canViewOrganizations: boolean
  canManageMembers: boolean
  canViewMetrics: boolean
  canViewAudit: boolean
  canUseAutomation: boolean
  canManageAutomationConfiguration: boolean
  canSwitchOrganizations: boolean
  /** Inicio ('/') is part of this user's navigation. */
  showHome: boolean
  /** 'Mis eventos' for accounts that only hold event grants. */
  eventsLabel: string
  /** The sidebar workspace block (switcher or assigned organization). */
  showWorkspaceBlock: boolean
  /** Where brand links and post-switch navigation land. Never redirects. */
  landingPath: '/' | '/events'
}

export function createApplicationNavigation({
  accessProfile,
  hasApplicationSession,
  isRoot,
  modules,
  product,
}: {
  accessProfile: AccessProfile
  hasApplicationSession: boolean
  isRoot: boolean
  modules: readonly TenantModule[]
  product: ProductManifest
}): ApplicationNavigation {
  const hasEvents = hasApplicationSession
    ? productSupportsFeature(product, 'events') &&
      accessProfile.isOrganizationContext &&
      accessCan(accessProfile, 'events:view')
    : productSupportsFeature(product, 'events') && modules.includes('events')

  const canViewUsers = hasApplicationSession
    ? productSupportsFeature(product, 'users') &&
      accessProfile.isPlatformContext &&
      accessCan(accessProfile, 'platform:users:view')
    : productSupportsFeature(product, 'users') && isRoot && modules.includes('users')

  const canViewOrganizations = hasApplicationSession
    ? productSupportsFeature(product, 'organizations') &&
      accessProfile.isPlatformContext &&
      accessCan(accessProfile, 'organizations:view')
    : productSupportsFeature(product, 'organizations') && isRoot && modules.includes('organizations')

  // Caller-access products show Inicio only to roots and to Owner/Admin of the
  // selected organization. Every other role works from the event list. While
  // the organization is still being chosen, an organization admin keeps Inicio
  // so the shell does not flicker. The shell decision travels with the access
  // profile, so navigation and profile can never disagree about it.
  const showHome =
    !hasApplicationSession ||
    !accessProfile.usesCallerAccessWorkspace ||
    accessProfile.platformLevel !== 'none' ||
    (!accessProfile.isPortfolioContext &&
      (accessProfile.organizationRole
        ? isOrganizationAdminRole(accessProfile.organizationRole)
        : accessProfile.isOrganizationAdmin))

  return {
    hasEvents,
    canViewUsers,
    canViewOrganizations,
    canManageMembers:
      productSupportsFeature(product, 'team') &&
      accessProfile.isOrganizationContext &&
      !accessProfile.isPortfolioContext &&
      accessCan(accessProfile, 'members:manage'),
    canViewMetrics:
      productSupportsFeature(product, 'metrics') &&
      !accessProfile.isPortfolioContext &&
      (hasApplicationSession ? accessCan(accessProfile, 'metrics:view') : modules.includes('metrics')),
    canViewAudit:
      productSupportsFeature(product, 'audit') &&
      accessProfile.isPlatformContext &&
      accessCan(accessProfile, 'audit:view'),
    canUseAutomation:
      productSupportsFeature(product, 'automation') &&
      accessProfile.isPlatformContext &&
      (accessCan(accessProfile, 'automation:view') || accessCan(accessProfile, 'automation:manage')),
    // The server independently requires Root 1. This only keeps the control
    // out of Root 2 navigation and direct client-side route access.
    canManageAutomationConfiguration:
      productSupportsFeature(product, 'automation') &&
      accessProfile.isPlatformContext &&
      accessProfile.platformLevel === 'root_1',
    canSwitchOrganizations: hasApplicationSession ? accessProfile.canSwitchOrganizations : isRoot,
    showHome,
    eventsLabel: accessProfile.isEventClientOnly ? 'Mis eventos' : 'Eventos',
    showWorkspaceBlock: accessProfile.canShowWorkspaceBlock,
    // Without Inicio the event list is home, but only when the user can open
    // it; otherwise '/' stays the landing page so nothing redirects in a loop.
    landingPath: !showHome && hasEvents ? '/events' : '/',
  }
}

/** Routes that render nothing until the route policy has decided. */
export const GUARDED_ROUTE_PREFIXES = ['/audit', '/metrics', '/team', '/users', '/clients', '/automation'] as const

export function isGuardedPath(pathname: string): boolean {
  return GUARDED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * The single client-side route policy. It returns where the user must go,
 * or null when the current route is allowed. The returned path is always
 * allowed itself, so a redirect never chains or loops. The backend enforces
 * the same rules; this only keeps users off screens they cannot use.
 */
export function resolveApplicationRouteRedirect({
  pathname,
  navigation,
  product,
  organizationContextPending,
}: {
  pathname: string
  navigation: ApplicationNavigation
  product: ProductManifest
  organizationContextPending: boolean
}): string | null {
  const home = navigation.landingPath
  const target = (() => {
    // Product manifests are a client-side ceiling. Even if a future backend
    // configuration grants an unrelated capability, its route stays invisible.
    if (!productSupportsPath(product, pathname)) return home
    if (pathname.startsWith('/events') && !organizationContextPending && !navigation.hasEvents) return home
    if (pathname.startsWith('/clients') && !navigation.canViewOrganizations) return home
    if (pathname.startsWith('/users') && !navigation.canViewUsers) return home
    if (pathname.startsWith('/metrics') && !navigation.canViewMetrics) return home
    if (pathname.startsWith('/audit') && !navigation.canViewAudit) return home
    if (pathname.startsWith('/automation') && !navigation.canUseAutomation) return home
    if (pathname.startsWith('/automation/settings') && !navigation.canManageAutomationConfiguration) return '/automation'
    if (pathname.startsWith('/team') && !organizationContextPending && !navigation.canManageMembers) return home
    if (pathname === '/' && !navigation.showHome && navigation.hasEvents && !organizationContextPending) return '/events'
    return null
  })()

  return target === pathname ? null : target
}

export function applicationRoutePreloadPath({
  clientId,
  href,
  listsAcrossOrganizations,
}: {
  clientId?: string
  href: ApplicationRoute
  /** Platform roots and the caller-access workspace list without client_id. */
  listsAcrossOrganizations: boolean
}): string | null {
  switch (href) {
    case '/':
      return scopedEventsDashboardPath(clientId, listsAcrossOrganizations)
    case '/events':
      return scopedEventsPagePath(clientId, listsAcrossOrganizations, { page: 1, page_size: 12, filter: 'all' })
    case '/users':
      return usersAllPath({ page: 1, page_size: 10 })
    case '/metrics':
      return metricsPortfolioPath(clientId, 30)
    case '/team':
      return clientId ? clientMembersPagePath(clientId, 1, 20) : null
    case '/audit':
      return auditLogsPath({ page: 1, page_size: 30 })
    case '/clients':
      return clientsPagePath({ page: 1, page_size: 12 })
    case '/automation':
    case '/automation/projects':
      return automationPortfolioPath()
    case '/automation/agents':
      return automationAgentsPath()
    case '/automation/dispatch':
      return automationDispatchQueuePath({ page_size: 25 })
    case '/automation/recurrences':
      return null
    case '/automation/traces':
      return null
    case '/automation/costs':
      return automationCostsPath()
    case '/automation/clients':
      return deliveryClientsPath()
    case '/automation/settings':
      return null
  }
}
