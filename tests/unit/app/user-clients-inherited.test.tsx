import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import UserClientsPage from '@/app/(app)/users/[id]/clients/page'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'user-1' }),
}))

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}))

vi.mock('@/components/ui/page-transition', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

// Response shape of GET /users/:id/clients after be-admin wave 3: `inherited` and
// `access_role` are now filled on every row.
vi.mock('swr', () => ({
  default: () => ({
    data: {
      user: { id: 'user-1', first_name: 'Ana', last_name: 'QA', email: 'ana@example.com' },
      data: [
        { id: 'client-direct', name: 'Directa SA', is_active: true, inherited: false, access_role: 'ADMIN' },
        {
          id: 'client-inherited',
          name: 'Hija SA',
          is_active: true,
          inherited: true,
          access_role: 'INHERITED_ADMIN',
        },
      ],
      total: 2,
      page: 1,
      page_size: 20,
      total_pages: 1,
      direct: 1,
      inherited: 1,
      active: 2,
    },
    isLoading: false,
    isValidating: false,
    error: undefined,
    mutate: vi.fn(),
  }),
  preload: vi.fn(),
}))

// be-admin wave 3: inherited memberships show "Heredada" and cannot be managed from this row.
describe('user client memberships with inherited rows', () => {
  it('shows Heredada and hides Gestionar only on inherited rows', () => {
    render(<UserClientsPage />)

    const inheritedRow = screen.getByRole('heading', { name: 'Hija SA' }).closest('article') as HTMLElement
    const directRow = screen.getByRole('heading', { name: 'Directa SA' }).closest('article') as HTMLElement

    expect(within(inheritedRow).getByText('Heredada')).toBeInTheDocument()
    expect(within(inheritedRow).queryByRole('button', { name: /Gestionar miembros/ })).toBeNull()
    expect(within(inheritedRow).getByText('Acceso desde la organización superior')).toBeInTheDocument()

    expect(within(directRow).queryByText('Heredada')).toBeNull()
    expect(within(directRow).getByRole('button', { name: 'Gestionar miembros de Directa SA' })).toBeInTheDocument()
  })
})
