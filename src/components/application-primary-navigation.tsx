import {
  SidebarBody,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import type { ApplicationNavigation, ApplicationRoute } from '@/lib/application-navigation'
import {
  BuildingOfficeIcon,
  ChartBarSquareIcon,
  ClipboardDocumentCheckIcon,
  HomeIcon,
  Square2StackIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import { memo } from 'react'

type ApplicationPrimaryNavigationProps = Pick<
  ApplicationNavigation,
  'hasEvents' | 'canViewMetrics' | 'canViewUsers' | 'canViewAudit' | 'canManageMembers' | 'canViewOrganizations'
> & {
  pathname: string
  onIntent: (href: ApplicationRoute) => void
}

export const ApplicationPrimaryNavigation = memo(function ApplicationPrimaryNavigation({
  pathname,
  hasEvents,
  canViewMetrics,
  canViewUsers,
  canViewAudit,
  canManageMembers,
  canViewOrganizations,
  onIntent,
}: ApplicationPrimaryNavigationProps) {
  function intentProps(href: ApplicationRoute) {
    return {
      onPointerEnter: () => onIntent(href),
      onPointerDown: () => onIntent(href),
      onFocus: () => onIntent(href),
    }
  }

  return (
    <SidebarBody>
      <SidebarSection>
        <SidebarItem href="/" current={pathname === '/'} {...intentProps('/')}>
          <HomeIcon />
          <SidebarLabel>Inicio</SidebarLabel>
        </SidebarItem>

        {hasEvents && (
          <SidebarItem href="/events" current={pathname.startsWith('/events')} {...intentProps('/events')}>
            <Square2StackIcon />
            <SidebarLabel>Eventos</SidebarLabel>
          </SidebarItem>
        )}

        {canViewMetrics && (
          <SidebarItem href="/metrics" current={pathname.startsWith('/metrics')} {...intentProps('/metrics')}>
            <ChartBarSquareIcon />
            <SidebarLabel>Métricas</SidebarLabel>
          </SidebarItem>
        )}

        {canViewUsers && (
          <SidebarItem href="/users" current={pathname.startsWith('/users')} {...intentProps('/users')}>
            <UsersIcon />
            <SidebarLabel>Usuarios</SidebarLabel>
          </SidebarItem>
        )}

        {canViewAudit && (
          <SidebarItem href="/audit" current={pathname.startsWith('/audit')} {...intentProps('/audit')}>
            <ClipboardDocumentCheckIcon />
            <SidebarLabel>Auditoría</SidebarLabel>
          </SidebarItem>
        )}

        {canManageMembers && !canViewUsers && (
          <SidebarItem href="/team" current={pathname.startsWith('/team')} {...intentProps('/team')}>
            <UsersIcon />
            <SidebarLabel>Equipo</SidebarLabel>
          </SidebarItem>
        )}
      </SidebarSection>

      <SidebarSpacer />

      {canViewOrganizations && (
        <SidebarSection>
          <SidebarItem href="/clients" current={pathname.startsWith('/clients')} {...intentProps('/clients')}>
            <BuildingOfficeIcon />
            <SidebarLabel>Clientes</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      )}
    </SidebarBody>
  )
})
