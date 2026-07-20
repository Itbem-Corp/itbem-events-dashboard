import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/application-layout.tsx'), 'utf8')
const navigationSource = readFileSync(resolve(process.cwd(), 'src/lib/application-navigation.ts'), 'utf8')
const primaryNavigationSource = readFileSync(
  resolve(process.cwd(), 'src/components/application-primary-navigation.tsx'),
  'utf8'
)
const commandPaletteSource = readFileSync(
  resolve(process.cwd(), 'src/components/ui/application-command-palette-controller.tsx'),
  'utf8'
)
const notificationSource = readFileSync(
  resolve(process.cwd(), 'src/components/ui/lazy-notification-button.tsx'),
  'utf8'
)
const navbarAccountSource = readFileSync(
  resolve(process.cwd(), 'src/components/account/application-navbar-account.tsx'),
  'utf8'
)
const sidebarFooterSource = readFileSync(
  resolve(process.cwd(), 'src/components/account/application-sidebar-footer.tsx'),
  'utf8'
)
const switcherSource = readFileSync(
  resolve(process.cwd(), 'src/components/workspace/organization-switcher.tsx'),
  'utf8'
)

describe('application layout client intent', () => {
  it('warms the selected organization portfolio before switching', () => {
    expect(source).toContain('function preloadClientPortfolio(clientId: string)')
    expect(source).toContain("eventsPagePath(clientId, { page: 1, page_size: 12, filter: 'all' })")
    expect(source).toContain('scopedEventsDashboardPath(clientId, isRoot)')
    expect(source).toContain('onPreloadOrganization={preloadClientPortfolio}')
    expect(switcherSource).toContain('onPointerEnter={() => onPreloadOrganization(client.id)}')
    expect(switcherSource).toContain('onFocus={() => onPreloadOrganization(client.id)}')
  })

  it('keeps cached organizations usable after a refresh error', () => {
    expect(source).toContain('getDataErrorState(clientsError, rawClients)')
    expect(switcherSource).toContain("errorState === 'stale'")
    expect(source).not.toContain('if (!clients || clientsError) return')
  })

  it('bounds organization loading and forwards debounced root search', () => {
    expect(source).toContain('useDebounce(organizationSearch, 200)')
    expect(source).toContain('search: isRoot ? debouncedOrganizationSearch : undefined')
    expect(source).toContain('keepPreviousData: true')
    expect(source).not.toContain('clientsPath()')
  })

  it('keeps secondary shell features behind explicit user intent', () => {
    expect(commandPaletteSource).toContain("const loadCommandPalette = () => import('@/components/ui/command-palette')")
    expect(commandPaletteSource).toContain('const CommandPalette = dynamic(')
    expect(notificationSource).toContain("const loadNotificationBell = () => import('@/components/ui/notification-bell')")
    expect(notificationSource).toContain('const NotificationBell = dynamic(')
    expect(source).toContain('<LazyNotificationButton />')
    expect(sidebarFooterSource).toContain('<LazyNotificationButton />')
    expect(navbarAccountSource).toContain('onPointerEnter={onProfileIntent}')
    expect(sidebarFooterSource).toContain('onFocus={onProfileIntent}')
    expect(source).toContain('const preloadProfile = useCallback(')
    expect(source).not.toContain('requestIdleCallback')
    expect(source).not.toContain("router.prefetch('/settings/profile')\n    if")
  })

  it('warms every visible desktop route on pointer and keyboard intent', () => {
    for (const href of ['/', '/events', '/metrics', '/users', '/audit', '/team', '/clients']) {
      expect(primaryNavigationSource).toContain(`intentProps('${href}')`)
    }
    expect(primaryNavigationSource).toContain('onPointerEnter: () => onIntent(href)')
    expect(primaryNavigationSource).toContain('onPointerDown: () => onIntent(href)')
    expect(primaryNavigationSource).toContain('onFocus: () => onIntent(href)')
    expect(source).toContain('applicationRoutePreloadPath({ href, clientId: currentClient?.id, isRoot })')
    expect(navigationSource).toContain('metricsPortfolioPath(clientId, 30)')
    expect(navigationSource).toContain('auditLogsPath({ page: 1, page_size: 30 })')
  })
})
