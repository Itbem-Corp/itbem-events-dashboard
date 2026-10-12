import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SeatingMiniMap, miniMapLabels } from '@/components/events/seating/seating-mini-map'
import type { Table } from '@/models/Table'

describe('miniMapLabels (GST-64)', () => {
  it('drops the shared leading words but keeps the last one', () => {
    expect(miniMapLabels(['QA-AUTOTEST Mesa A', 'QA-AUTOTEST Mesa B'])).toEqual(['Mesa A', 'Mesa B'])
  })

  it('keeps names that only share one word or nothing', () => {
    expect(miniMapLabels(['Mesa 1', 'Mesa 2'])).toEqual(['Mesa 1', 'Mesa 2'])
    expect(miniMapLabels(['Familia', 'Amigos de la novia'])).toEqual(['Familia', 'Amigos de la novia'])
  })

  it('leaves a single table or identical names unchanged', () => {
    expect(miniMapLabels(['QA-AUTOTEST Mesa A'])).toEqual(['QA-AUTOTEST Mesa A'])
    expect(miniMapLabels(['Mesa', 'Mesa'])).toEqual(['Mesa', 'Mesa'])
  })
})

describe('SeatingMiniMap', () => {
  it('shows distinguishable, wrapping labels with the full name in tooltip and accessible name', () => {
    const base = { event_id: 'e', capacity: 8, sort_order: 0, created_at: '', updated_at: '' }
    const tables = [
      { ...base, id: 'A', name: 'QA-AUTOTEST Mesa A' },
      { ...base, id: 'B', name: 'QA-AUTOTEST Mesa B' },
    ] as Table[]
    render(
      <SeatingMiniMap
        tables={tables}
        occupancy={new Map([['A', 2]])}
        isOpen
        onToggle={vi.fn()}
        onTableClick={vi.fn()}
      />
    )
    const a = screen.getByRole('button', { name: 'QA-AUTOTEST Mesa A: 2 de 8 lugares' })
    expect(a).toHaveAttribute('title', 'QA-AUTOTEST Mesa A: 2/8')
    const label = screen.getByText('Mesa A')
    expect(label.className).toMatch(/line-clamp-2/)
    expect(label.className).not.toMatch(/\btruncate\b/)
    expect(screen.getByText('Mesa B')).toBeInTheDocument()
  })
})
