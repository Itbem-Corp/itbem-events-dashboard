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
  BanknotesIcon,
  BuildingOffice2Icon,
  ChartPieIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  ClipboardDocumentCheckIcon,
  FolderOpenIcon,
  HomeIcon,
  QueueListIcon,
  SparklesIcon,
  Square2StackIcon,
  UsersIcon,
  UserGroupIcon,
} from '@heroicons/react/20/solid'
import { memo } from 'react'

type ApplicationPrimaryNavigationProps = Omit<Pick<
  ApplicationNavigation,
  | 'hasEvents'
  | 'canViewMetrics'
  | 'canViewUsers'
  | 'canViewAudit'
  | 'canUseAutomation'
  | 'canManageMembers'
  | 'canViewOrganizations'
>, 'canManageAutomationConfiguration'> & {
  canManageAutomationConfiguration?: boolean
  pathname: string
  /** Product-specific copy keeps ITBEM's platform organizations distinct from Delivery clients. */
  tenantCode?: string
  onIntent: (href: ApplicationRoute) => void
}

export const ApplicationPrimaryNavigation = memo(function ApplicationPrimaryNavigation({
  pathname,
  tenantCode,
  hasEvents,
  canViewMetrics,
  canViewUsers,
  canViewAudit,
  canUseAutomation,
  canManageAutomationConfiguration = false,
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
          <ChartPieIcon />
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
            <SidebarLabel>Proyectos</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/agents" current={pathname.startsWith('/automation/agents')} {...intentProps('/automation/agents')}>
            <UserGroupIcon />
            <SidebarLabel>Agentes</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/dispatch" current={pathname.startsWith('/automation/dispatch')} {...intentProps('/automation/dispatch')}>
            <QueueListIcon />
            <SidebarLabel>Colas y despacho</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/recurrences" current={pathname.startsWith('/automation/recurrences')} {...intentProps('/automation/recurrences')}>
            <CalendarDaysIcon />
            <SidebarLabel>Recurrentes</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/traces" current={pathname.startsWith('/automation/traces')} {...intentProps('/automation/traces')}>
            <ClipboardDocumentListIcon />
            <SidebarLabel>Trazas</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/clients" current={pathname.startsWith('/automation/clients')} {...intentProps('/automation/clients')}>
            <BuildingOffice2Icon />
            <SidebarLabel>Portafolio</SidebarLabel>
          </SidebarItem>
          <SidebarItem href="/automation/costs" current={pathname.startsWith('/automation/costs')} {...intentProps('/automation/costs')}>
            <BanknotesIcon />
            <SidebarLabel>Uso y costos</SidebarLabel>
          </SidebarItem>
          {canManageAutomationConfiguration && (
            <SidebarItem href="/automation/settings" current={pathname.startsWith('/automation/settings')} {...intentProps('/automation/settings')}>
              <Cog6ToothIcon />
              <SidebarLabel>Configuración de IA</SidebarLabel>
            </SidebarItem>
          )}
        </SidebarSection>
      )}

      <SidebarSpacer />

      {canViewOrganizations && (
        <SidebarSection>
          <SidebarItem href="/clients" current={pathname.startsWith('/clients')} {...intentProps('/clients')}>
            <BuildingOffice2Icon />
            <SidebarLabel>{tenantCode === 'itbem' ? 'Organizaciones' : 'Clientes'}</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      )}
    </SidebarBody>
  )
})
