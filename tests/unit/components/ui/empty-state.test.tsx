import { EmptyState } from '@/components/ui/empty-state'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

function Icon() {
  return <span />
}

describe('EmptyState', () => {
  it('renders declarative navigation actions', () => {
    render(<EmptyState icon={Icon} title="Sin datos" action={{ label: 'Ir a clientes', href: '/clients' }} />)

    expect(screen.getByRole('link', { name: 'Ir a clientes' })).toHaveAttribute('href', '/clients')
  })

  it('keeps callback actions interactive', () => {
    const onClick = vi.fn()
    render(<EmptyState icon={Icon} title="Sin datos" action={{ label: 'Crear', onClick }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
