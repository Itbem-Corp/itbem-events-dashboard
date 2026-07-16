import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/application-layout.tsx'), 'utf8')

describe('application layout client intent', () => {
  it('warms the selected organization portfolio before switching', () => {
    expect(source).toContain('function preloadClientPortfolio(clientId: string)')
    expect(source).toContain("eventsPagePath(clientId, { page: 1, page_size: 12, filter: 'all' })")
    expect(source).toContain('scopedEventsDashboardPath(clientId, isRoot)')
    expect(source).toContain('onPointerEnter={() => preloadClientPortfolio(client.id)}')
    expect(source).toContain('onFocus={() => preloadClientPortfolio(client.id)}')
  })

  it('keeps cached organizations usable after a refresh error', () => {
    expect(source).toContain('getDataErrorState(clientsError, rawClients)')
    expect(source).toContain("clientsErrorState === 'stale'")
    expect(source).not.toContain('if (!clients || clientsError) return')
  })

  it('bounds organization loading and forwards debounced root search', () => {
    expect(source).toContain('useDebounce(organizationSearch, 200)')
    expect(source).toContain("tenant.code === 'itbem' ? tenant.organizationCode : isRoot ? debouncedOrganizationSearch : undefined")
    expect(source).toContain('keepPreviousData: true')
    expect(source).not.toContain('clientsPath()')
  })

  it('keeps secondary shell features behind explicit user intent', () => {
    expect(source).toContain("const loadNotificationBell = () => import('@/components/ui/notification-bell')")
    expect(source).toContain('const NotificationBell = dynamic(')
    expect(source).toContain('notificationsRequested ? (')
    expect(source).toContain('<NotificationBell initialOpen={notificationsOpenRequested} />')
    expect(source.match(/<NotificationBell initialOpen=\{notificationsOpenRequested\} \/>/g)).toHaveLength(2)
    expect(source).toContain('onPointerEnter={preloadProfile}')
    expect(source).toContain('onFocus={preloadProfile}')
    expect(source).not.toContain('requestIdleCallback')
    expect(source).not.toContain("router.prefetch('/settings/profile')\n    if")
  })
})
