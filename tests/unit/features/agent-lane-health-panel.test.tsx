import { AgentLaneHealthPanel } from '@/features/automation/agent-lane-health-panel'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('AgentLaneHealthPanel', () => {
  it('renders explicit unknown evidence and refreshes on demand', () => {
    const refresh = vi.fn()

    render(<AgentLaneHealthPanel health={{ active_workers: 2 }} onRefresh={refresh} />)

    expect(screen.getByRole('heading', { name: 'Equipo multiagente' })).toBeInTheDocument()
    expect(screen.getAllByText('Worker: sin evidencia')).toHaveLength(5)
    expect(screen.getAllByText('Cola: sin evidencia')).toHaveLength(5)
    expect(screen.getAllByText('Preflight: sin evidencia')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado del equipo multiagente' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not present unavailable health as merge authority', () => {
    render(<AgentLaneHealthPanel unavailable onRefresh={() => undefined} />)

    expect(screen.getByText(/permisos de merge y release permanecen sin confirmar/i)).toBeInTheDocument()
    expect(screen.queryByText(/Estado operacional; no concede autoridad/i)).not.toBeInTheDocument()
  })
})
