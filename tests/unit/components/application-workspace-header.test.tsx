import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApplicationWorkspaceHeader } from '@/components/workspace/application-workspace-header'
import { createAccessProfile } from '@/lib/access-profile'
import { createApplicationNavigation } from '@/lib/application-navigation'
import { tenantPresentationForHostname } from '@/lib/tenant-config'
import type { ApplicationOrganization, ApplicationSession } from '@/models/ApplicationSession'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'

const eventiapp = getProductManifest('eventiapp')
const eventiTenant = tenantPresentationForHostname('dashboard.eventiapp.com.mx')
const currentClient = { id: 'org-a', name: 'Organización A', code: 'org-a', client_type: { code: 'CUSTOMER' } }

function membership(role: string, capabilities: string[], id = 'org-a'): ApplicationOrganization {
  return { id, name: id, code: id, access_role: role, capabilities }
}

function session(overrides: Partial<ApplicationSession>): ApplicationSession {
  return {
    application: {
      id: 'application-eventiapp',
      code: 'eventiapp',
      name: 'EventiApp',
      product_label: 'Event operations',
      modules: ['home', 'events', 'metrics'],
      allows_platform_admin: true,
      is_active: true,
    },
    user: { id: 'user', email: 'user@example.test', first_name: 'Ana', last_name: 'Prueba', is_root: false, root_level: 0 },
    organizations: [],
    // The session union of the persona's organization capabilities.
    capabilities: ['events:view'],
    ...overrides,
  } as ApplicationSession
}

function root(level: 1 | 2) {
  return session({
    user: { id: `root-${level}`, email: 'root@example.test', is_root: true, root_level: level } as ApplicationSession['user'],
    capabilities: ['events:view', 'metrics:view'],
  })
}

const personas: Record<string, { session: ApplicationSession; mode: 'platform' | 'organization'; organizationId?: string }> = {
  root_1: { session: root(1), mode: 'platform' },
  root_2: { session: root(2), mode: 'platform' },
  owner: { session: session({ organizations: [membership('OWNER', ['events:view'])] }), mode: 'organization', organizationId: 'org-a' },
  admin: { session: session({ organizations: [membership('Admin', ['events:view'])] }), mode: 'organization', organizationId: 'org-a' },
  event_manager: { session: session({ organizations: [membership('EVENT_MANAGER', ['events:view'])] }), mode: 'organization' },
  editor: { session: session({ organizations: [membership('EDITOR', ['events:view']), membership('CHECKIN', ['events:view'], 'org-b')] }), mode: 'organization' },
  checkin: { session: session({ organizations: [membership('CHECKIN', ['events:view'])] }), mode: 'organization' },
  analyst: { session: session({ organizations: [membership('ANALYST', ['events:view'])] }), mode: 'organization' },
  member: { session: session({ organizations: [membership('MEMBER', ['events:view'])] }), mode: 'organization' },
  viewer: { session: session({ organizations: [membership('VIEWER', ['events:view'])] }), mode: 'organization' },
  event_client: {
    session: session({
      capabilities: ['events:view', 'events:manage'],
      event_access: { assigned_events: 1, capabilities: ['events:view', 'events:manage'] },
    }),
    mode: 'organization',
  },
}

function renderEventiHeader(name: string) {
  const persona = personas[name]
  const accessProfile = createAccessProfile({
    session: persona.session,
    requestedMode: persona.mode,
    organizationId: persona.organizationId,
    shell: eventiapp.shell,
  })
  const navigation = createApplicationNavigation({
    accessProfile,
    hasApplicationSession: true,
    isRoot: Boolean(persona.session.user.is_root),
    modules: persona.session.application.modules,
    product: eventiapp,
  })

  return render(
    <ProductProvider product={eventiapp}>
      <ApplicationWorkspaceHeader
        accessProfile={accessProfile}
        canSwitchOrganizations={navigation.canSwitchOrganizations}
        currentClient={accessProfile.isPortfolioContext ? null : currentClient}
        tenant={eventiTenant}
        showWorkspaceBlock={navigation.showWorkspaceBlock}
        homeHref={navigation.landingPath}
        onOpenSwitcher={vi.fn()}
        onSwitcherIntent={vi.fn()}
      />
    </ProductProvider>
  )
}

describe('ApplicationWorkspaceHeader on EventiApp', () => {
  it.each(['root_1', 'root_2', 'owner', 'admin'])('shows the workspace block to %s', (name) => {
    renderEventiHeader(name)

    expect(screen.getByText('Espacio de trabajo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'EventiApp — ir al inicio' })).toHaveAttribute('href', '/')
  })

  it.each(['event_manager', 'editor', 'checkin', 'analyst', 'member', 'viewer', 'event_client'])(
    'shows only the brand to %s',
    (name) => {
      const { container } = renderEventiHeader(name)

      expect(screen.queryByText('Espacio de trabajo')).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(screen.queryByText('Organización asignada')).not.toBeInTheDocument()
      const brand = screen.getByRole('link', { name: 'EventiApp — ir al inicio' })
      expect(brand).toHaveAttribute('href', '/events')
      expect(brand).toHaveTextContent('EventiApp')
      expect(brand).toHaveTextContent('Event operations')
      expect(container.querySelector('[class*="text-[10px]"]')).toBeNull()
    }
  )

  it('keeps an Owner of a single organization on the assigned card', () => {
    renderEventiHeader('owner')

    expect(screen.getByText('Organización asignada')).toBeInTheDocument()
    expect(screen.getByText('Organización asignada')).toHaveClass('text-xs')
  })
})

describe('ApplicationWorkspaceHeader on products without a shell policy', () => {
  // Generated from the component at 94f16b8 (before the shell policy) and
  // compared against today's render: the markup must stay identical.
  it('renders the Cafetton House header exactly as before', () => {
    const tenant = tenantPresentationForHostname('dashboard.cafettonhouse.com')
    const member = session({
      application: { ...session({}).application, code: 'cafettonhouse', allows_platform_admin: false },
      organizations: [membership('MEMBER', ['organizations:view'])],
    })
    const accessProfile = createAccessProfile({ session: member, requestedMode: 'organization', organizationId: 'org-a' })

    const { container } = render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <ApplicationWorkspaceHeader
          accessProfile={accessProfile}
          canSwitchOrganizations={false}
          currentClient={currentClient}
          tenant={tenant}
          onOpenSwitcher={vi.fn()}
          onSwitcherIntent={vi.fn()}
        />
      </ProductProvider>
    )

    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the Cafetton House switcher trigger exactly as before', () => {
    const tenant = tenantPresentationForHostname('dashboard.cafettonhouse.com')
    const member = session({
      application: { ...session({}).application, code: 'cafettonhouse', allows_platform_admin: false },
      organizations: [membership('MEMBER', ['organizations:view']), membership('MEMBER', ['organizations:view'], 'org-b')],
    })
    const accessProfile = createAccessProfile({ session: member, requestedMode: 'organization', organizationId: 'org-a' })

    const { container } = render(
      <ProductProvider product={getProductManifest('cafettonhouse')}>
        <ApplicationWorkspaceHeader
          accessProfile={accessProfile}
          canSwitchOrganizations
          currentClient={currentClient}
          tenant={tenant}
          onOpenSwitcher={vi.fn()}
          onSwitcherIntent={vi.fn()}
        />
      </ProductProvider>
    )

    expect(container.innerHTML).toMatchSnapshot()
  })
})

// QA ROLES-74 / ROLES-75: the fixed organization card rendered a 300x300 avatar
// that hid the organization name, and ITBEM initials were white on #f1f3f5.
describe('ApplicationWorkspaceHeader fixed organization card', () => {
  it('renders a sized avatar with themed initials next to the organization name', () => {
    const { container, getByText } = render(
      <ProductProvider product={getProductManifest('itbem')}>
        <ApplicationWorkspaceHeader
          accessProfile={createAccessProfile({ session: null, requestedMode: 'organization', organizationId: 'org-1' })}
          canSwitchOrganizations={false}
          currentClient={{ id: 'org-1', name: 'Acme Eventos', logo: null } as never}
          tenant={tenantPresentationForHostname('dashboard.itbem.com')}
          onOpenSwitcher={vi.fn()}
          onSwitcherIntent={vi.fn()}
        />
      </ProductProvider>
    )

    const avatar = container.querySelector('[data-slot="avatar"]')
    expect(avatar).not.toBeNull()
    expect(avatar).toHaveClass('size-10', 'text-ink')
    expect(avatar).not.toHaveClass('text-white')
    expect(getByText('Acme Eventos')).toBeInTheDocument()
  })
})
