import { IntentModalSkeleton } from '@/components/ui/intent-modal-skeleton'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('IntentModalSkeleton', () => {
  it('announces a stable busy modal while a cold form chunk loads', () => {
    render(<IntentModalSkeleton title="Preparando evento" />)

    const dialog = screen.getByRole('dialog', { name: 'Preparando evento' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Preparando evento')
  })
})
