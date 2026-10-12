import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/product/brand-mark', () => ({ BrandMark: () => <span data-testid="brand" /> }))

import { ApplicationWorkspaceHeader } from '@/components/workspace/application-workspace-header'
import type { AccessProfile } from '@/lib/access-profile'

// QA ROLES-74 / ROLES-75: the fixed organization card rendered a 300x300 avatar
// that hid the organization name, and ITBEM initials were white on #f1f3f5.
describe('ApplicationWorkspaceHeader fixed organization card', () => {
  it('renders a sized avatar with themed initials next to the organization name', () => {
    const { container, getByText } = render(
      <ApplicationWorkspaceHeader
        accessProfile={{ isPlatformContext: false, isOrganizationContext: true } as AccessProfile}
        canSwitchOrganizations={false}
        currentClient={{ id: 'org-1', name: 'Acme Eventos', logo: null } as never}
        tenant={{ code: 'itbem', name: 'ITBEM', productLabel: 'AI Automations', accent: '#f1f3f5' } as never}
        onOpenSwitcher={vi.fn()}
        onSwitcherIntent={vi.fn()}
      />
    )

    const avatar = container.querySelector('[data-slot="avatar"]')
    expect(avatar).not.toBeNull()
    expect(avatar).toHaveClass('size-10', 'text-ink')
    expect(avatar).not.toHaveClass('text-white')
    expect(getByText('Acme Eventos')).toBeInTheDocument()
  })
})
