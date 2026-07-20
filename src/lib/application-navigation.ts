import { accessCan, type AccessProfile } from '@/lib/access-profile'
import {
  auditLogsPath,
  clientMembersPagePath,
  clientsPagePath,
  eventsPagePath,
  metricsPortfolioPath,
  scopedEventsDashboardPath,
  usersAllPath,
} from '@/lib/api-paths'
import { productSupportsFeature, type ProductManifest, type TenantModule } from '@/products/core/product-manifest'

export type ApplicationRoute = '/' | '/events' | '/metrics' | '/team' | '/users' | '/clients' | '/audit'

export type ApplicationNavigation = {
  hasEvents: boolean
  canViewUsers: boolean
  canViewOrganizations: boolean
  canManageMembers: boolean
  canViewMetrics: boolean
  canViewAudit: boolean
  canSwitchOrganizations: boolean
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

  return {
    hasEvents,
    canViewUsers,
    canViewOrganizations,
    canManageMembers:
      productSupportsFeature(product, 'team') &&
      accessProfile.isOrganizationContext &&
      accessCan(accessProfile, 'members:manage'),
    canViewMetrics:
      productSupportsFeature(product, 'metrics') &&
      (hasApplicationSession ? accessCan(accessProfile, 'metrics:view') : modules.includes('metrics')),
    canViewAudit:
      productSupportsFeature(product, 'audit') &&
      accessProfile.isPlatformContext &&
      accessCan(accessProfile, 'audit:view'),
    canSwitchOrganizations: hasApplicationSession ? accessProfile.canSwitchOrganizations : isRoot,
  }
}

export function applicationRoutePreloadPath({
  clientId,
  href,
  isRoot,
}: {
  clientId?: string
  href: ApplicationRoute
  isRoot: boolean
}): string | null {
  switch (href) {
    case '/':
      return scopedEventsDashboardPath(clientId, isRoot)
    case '/events':
      return clientId || isRoot ? eventsPagePath(clientId, { page: 1, page_size: 12, filter: 'all' }) : null
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
  }
}
