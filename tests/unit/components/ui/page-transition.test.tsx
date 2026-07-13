import { PageTransition } from '@/components/ui/page-transition'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('PageTransition', () => {
  it('uses the lightweight motion-safe page entrance class', () => {
    render(
      <PageTransition>
        <h1>Dashboard</h1>
      </PageTransition>
    )

    expect(screen.getByRole('heading', { name: 'Dashboard' }).parentElement).toHaveClass('page-transition')
  })
})
