import { StudioPanelSkeleton } from '@/components/studio/studio-panel-skeleton'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('StudioPanelSkeleton', () => {
  it.each([
    ['sections', 'Cargando secciones…'],
    ['config', 'Cargando ajustes…'],
    ['design', 'Cargando diseño…'],
  ] as const)('announces the %s panel while its async chunk loads', (panel, announcement) => {
    render(<StudioPanelSkeleton panel={panel} />)

    expect(screen.getByRole('status')).toHaveTextContent(announcement)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })
})
