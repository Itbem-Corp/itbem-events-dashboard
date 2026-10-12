import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientMembersModal } from '@/components/clients/client-members-modal'
import { ProductProvider } from '@/products/core/product-context'
import { getProductManifest } from '@/products/registry'
import { useStore } from '@/store/useStore'
import type { TenantCode } from '@/products/core/product-manifest'

const roles = [
  { id: 'r-manager', code: 'EVENT_MANAGER', name: 'Event Manager', hierarchy: 3 },
  { id: 'r-checkin', code: 'CHECKIN', name: 'Check-in', hierarchy: 5 },
  { id: 'r-guest', code: 'GUEST', name: 'Guest', hierarchy: 8 },
]

const members = {
  data: [
    { id: 'm1', user_id: 'owner-1', client_id: 'c1', role_id: 'r-owner', role_code: 'OWNER', role_name: 'Owner', first_name: 'Olga', last_name: 'Duena', email: 'olga@example.com' },
    { id: 'm2', user_id: 'admin-1', client_id: 'c1', role_id: 'r-admin', role_code: 'ADMIN', role_name: 'Admin', first_name: 'Ada', last_name: 'Admin', email: 'ada@example.com' },
    { id: 'm3', user_id: 'mgr-1', client_id: 'c1', role_id: 'r-manager', role_code: 'EVENT_MANAGER', role_name: 'Event Manager', first_name: 'Max', last_name: 'Gestor', email: 'max@example.com' },
    { id: 'm4', user_id: 'me', client_id: 'c1', role_id: 'r-guest', role_code: 'GUEST', role_name: 'Guest', first_name: 'Yo', last_name: 'Mismo', email: 'me@example.com' },
  ],
  total: 4,
  page: 1,
  page_size: 20,
  total_pages: 1,
}

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return {
    ...actual,
    default: (key: string | null) => {
      if (!key) return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
      const data = key.includes('roles') ? roles : members
      return { data, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() }
    },
  }
})

function renderModal(code: TenantCode) {
  return render(
    <ProductProvider product={getProductManifest(code)}>
      <ClientMembersModal isOpen onClose={vi.fn()} clientId="c1" clientName="Acme" />
    </ProductProvider>
  )
}

function rowFor(email: string) {
  return screen.getByText(email).closest('div.flex.items-center') as HTMLElement
}

beforeEach(() => {
  useStore.setState({ user: { id: 'me', is_root: false } as never })
})

afterEach(() => {
  useStore.setState({ user: null })
})

describe('ClientMembersModal role labels', () => {
  it('EventiApp shows Spanish role labels and the corrected CHECKIN guidance', () => {
    renderModal('eventiapp')

    expect(within(rowFor('olga@example.com')).getByText('Propietario')).toBeInTheDocument()
    expect(within(rowFor('max@example.com')).getByText('Gestor de eventos')).toBeInTheDocument()
    expect(within(rowFor('me@example.com')).getByText('Solo lectura')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Invitar existente/ }))
    const select = screen.getByRole('combobox', { name: 'Rol' }) as HTMLSelectElement
    const options = within(select).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Gestor de eventos', 'Check-in', 'Solo lectura'])

    fireEvent.change(select, { target: { value: 'r-checkin' } })
    expect(screen.getByText('Opera el check-in.')).toBeInTheDocument()
  })

  it('Cafetton keeps the catalog names and today guidance', () => {
    renderModal('cafettonhouse')

    expect(within(rowFor('olga@example.com')).getByText('Owner')).toBeInTheDocument()
    expect(within(rowFor('max@example.com')).getByText('Event Manager')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Invitar existente/ }))
    const select = screen.getByRole('combobox', { name: 'Rol' }) as HTMLSelectElement
    const options = within(select).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Event Manager', 'Check-in', 'Guest'])

    fireEvent.change(select, { target: { value: 'r-checkin' } })
    expect(screen.getByText('Opera accesos, RSVP y check-in.')).toBeInTheDocument()
  })
})

describe('ClientMembersModal member actions follow the backend hierarchy', () => {
  it('offers edit/remove only on members ranked below the caller and never on self', () => {
    renderModal('eventiapp')

    expect(within(rowFor('max@example.com')).getByRole('button', { name: 'Editar rol' })).toBeInTheDocument()
    expect(within(rowFor('olga@example.com')).queryByRole('button', { name: 'Editar rol' })).not.toBeInTheDocument()
    expect(within(rowFor('ada@example.com')).queryByRole('button', { name: 'Editar rol' })).not.toBeInTheDocument()
    // Same assignable role as the caller would allow, but it is the caller.
    expect(within(rowFor('me@example.com')).queryByRole('button', { name: 'Editar rol' })).not.toBeInTheDocument()
    expect(
      within(rowFor('me@example.com')).queryByRole('button', { name: /Administrar aplicaciones/ })
    ).not.toBeInTheDocument()
  })
})
