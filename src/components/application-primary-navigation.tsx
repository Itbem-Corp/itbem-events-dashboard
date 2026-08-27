import {
  SidebarBody,
  SidebarHeading,
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
  FolderOpenIcon,
  HomeIcon,
  SparklesIcon,
  Square2StackIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import { memo } from 'react'

type ApplicationPrimaryNavigationProps = Pick<
  ApplicationNavigation,
  | 'hasEvents'
  | 'canViewMetrics'
  | 'canViewUsers'
  | 'canViewAudit'
  | 'canUseAutomation'
  | 'canManageMembers'
  | 'canViewOrganizations'
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
  canUseAutomation,
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

      {canUseAutomation && (
        <SidebarSection>
          <SidebarHeading>Automatización</SidebarHeading>
          <SidebarItem
            href="/automation"
            current={pathname === '/automation' || pathname.startsWith('/automation/work-items')}
            {...intentProps('/automation')}
          >
            <SparklesIcon />
            <SidebarLabel>Centro de automatización</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/projects" current={pathname.startsWith('/automation/projects')} {...intentProps('/automation/projects')}>
            <FolderOpenIcon />
            <SidebarLabel>Resultados</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/clients" current={pathname.startsWith('/automation/clients')} {...intentProps('/automation/clients')}>
            <BuildingOfficeIcon />
            <SidebarLabel>Portafolio</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/costs" current={pathname.startsWith('/automation/costs')} {...intentProps('/automation/costs')}>
            <ChartBarSquareIcon />
            <SidebarLabel>Uso y costos</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      )}

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
