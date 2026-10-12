import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const swr = vi.hoisted(() => ({ useSWR: vi.fn() }))
vi.mock('swr', () => ({ default: swr.useSWR }))
vi.mock('@/lib/api', () => ({ api: { post: vi.fn(), put: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { ClientFormModal } from '@/components/clients/forms/client-form-modal'

// Backend w2/be-admin-orgs-users: GET /catalogs/client-types?parent_id= returns
// exactly the types allowed under that parent, [] for a Customer.
describe('ClientFormModal with a parent organization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks the catalog for the parent and explains when no child type is allowed', () => {
    swr.useSWR.mockReturnValue({ data: [], error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() })
    render(<ClientFormModal isOpen setIsOpen={vi.fn()} parentId="parent-1" />)

    expect(swr.useSWR.mock.calls[0][0]).toBe('/catalogs/client-types?parent_id=parent-1')
    expect(screen.getByText('No se pueden crear sub-organizaciones aquí.')).toBeInTheDocument()
    const submit = screen.getAllByRole('button').find((button) => button.getAttribute('type') === 'submit')
    expect(submit).toBeDisabled()
  })

  it('uses the plain catalog without a parent', () => {
    swr.useSWR.mockReturnValue({
      data: [{ id: 't1', code: 'AGENCY', name: 'Agencia' }],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    })
    render(<ClientFormModal isOpen setIsOpen={vi.fn()} />)

    expect(swr.useSWR.mock.calls[0][0]).toBe('/catalogs/client-types')
    expect(screen.queryByText('No se pueden crear sub-organizaciones aquí.')).not.toBeInTheDocument()
  })
})
