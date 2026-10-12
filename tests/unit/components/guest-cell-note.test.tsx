import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { GuestCellNote } from '@/components/guests/guest-cell-note'

describe('GuestCellNote (GST-N2)', () => {
  it('wraps and clamps a 255-character restriction instead of forcing a no-wrap width', () => {
    const long = 'Ñ'.repeat(255)
    render(<GuestCellNote text={long} />)
    const note = screen.getByTestId('guest-cell-note')
    expect(note).toHaveAttribute('title', long)
    expect(note.className).toMatch(/line-clamp-2/)
    expect(note.className).toMatch(/overflow-wrap:anywhere/)
    expect(note.className).not.toMatch(/\btruncate\b/)
  })

  it('keeps the prefix in text and tooltip', () => {
    render(<GuestCellNote prefix="RSVP: " text="Llego tarde" />)
    expect(screen.getByTestId('guest-cell-note')).toHaveTextContent('RSVP: Llego tarde')
    expect(screen.getByTestId('guest-cell-note')).toHaveAttribute('title', 'RSVP: Llego tarde')
  })

  it('is what the desktop guest list uses for dietary and RSVP lines', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/events/event-detail-guests-panel.tsx'), 'utf8')
    expect(source).toContain('<GuestCellNote text={dietaryRestrictions} />')
    expect(source).toContain('<GuestCellNote prefix="RSVP: " text={rsvpNotes} />')
  })
})
