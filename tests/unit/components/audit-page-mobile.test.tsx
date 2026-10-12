import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AuditPage from '@/app/(app)/audit/page'

const longRoute = '/api/events/3f9a1c2e-7b44-4c1d-9e0f-aa11bb22cc33/guests/bulk/status'
const requestId = 'req-01JABCDEFGHJKMNPQRSTVWXYZ0123456789'
const resourceId = '7c1e2d3f-4a5b-6c7d-8e9f-001122334455'

const swrState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return { ...actual, default: () => swrState.value }
})

vi.mock('@/hooks/useScopedFetcherKey', () => ({ useScopedFetcherKey: (key: string | null) => key }))

function withRecords() {
  swrState.value = {
    data: {
      data: [
        {
          id: 'a1',
          occurred_at: '2026-10-01T18:00:00Z',
          tenant_code: 'eventiapp',
          method: 'PATCH',
          route: longRoute,
          resource_type: 'guest',
          resource_id: resourceId,
          status: 403,
          succeeded: false,
          request_id: requestId,
          client_ip: '',
          user_agent: '',
        },
      ],
      total: 1,
      page: 1,
      page_size: 30,
      total_pages: 1,
    },
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  }
}

describe('AuditPage mobile layout', () => {
  it('stacks each entry below md with the full route and ids readable', () => {
    withRecords()
    render(<AuditPage />)

    const entry = screen.getByTestId('audit-entry')
    const card = entry.querySelector('.md\\:hidden') as HTMLElement
    expect(card).not.toBeNull()

    const route = within(card).getByText(`PATCH ${longRoute}`)
    expect(route.className).toContain('break-all')
    expect(route.className).not.toContain('truncate')

    const details = within(card).getByText('Ver detalle').closest('details') as HTMLDetailsElement
    expect(details).not.toBeNull()
    expect(within(details).getByText(requestId).className).not.toContain('truncate')
    expect(within(details).getByText(resourceId)).toBeInTheDocument()
    expect(within(details).getByText('guest')).toBeInTheDocument()
    expect(details.querySelector('dl')?.className).toContain('break-all')
  })

  it('keeps the grid from md up and the header uses text-xs', () => {
    withRecords()
    const { container } = render(<AuditPage />)

    const grid = screen.getByTestId('audit-entry').querySelector('.md\\:grid') as HTMLElement
    expect(grid.className).toContain('hidden')
    expect(within(grid).getByText(resourceId)).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('text-[10px]')
    expect(container.innerHTML).not.toContain('text-[11px]')
  })

  it('gives the retry button type=button', () => {
    swrState.value = {
      data: undefined,
      error: new Error('offline'),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    render(<AuditPage />)

    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveAttribute('type', 'button')
  })
})
