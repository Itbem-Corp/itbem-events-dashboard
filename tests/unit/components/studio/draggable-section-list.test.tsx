import { DraggableSectionList } from '@/components/studio/draggable-section-list'
import type { EventSection } from '@/models/EventSection'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  Reorder: {
    Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  },
  useDragControls: () => ({ start: vi.fn() }),
}))

vi.mock('@/components/events/event-section-resources', () => ({
  sectionImageSlotsForType: (componentType: string) =>
    componentType === 'GraduationHero' ? [{ position: 0, label: 'Hero', ratio: '3:2' }] : [],
  EventSectionResources: ({ onResourcesChanged }: { onResourcesChanged?: () => void }) => (
    <div>
      <p>Media manager</p>
      <button onClick={onResourcesChanged}>Notify media change</button>
    </div>
  ),
}))

function section(componentType: string, patch: Partial<EventSection> = {}): EventSection {
  return {
    id: `${componentType}-section`,
    event_id: 'event-1',
    created_at: '2026-07-05T00:00:00.000Z',
    updated_at: '2026-07-05T00:00:00.000Z',
    name: componentType,
    component_type: componentType,
    order: 1,
    is_visible: true,
    config: {},
    ...patch,
  }
}

describe('DraggableSectionList media integration', () => {
  beforeEach(() => {
    localStorage.setItem('studio-onboarding-dismissed', '1')
  })

  it('opens media resources for image-backed sections and refreshes the preview when resources change', () => {
    const onResourcesChanged = vi.fn()

    render(
      <DraggableSectionList
        sections={[section('GraduationHero')]}
        isLoading={false}
        onReorder={vi.fn()}
        onToggleVisible={vi.fn()}
        onSaveConfig={vi.fn()}
        onResourcesChanged={onResourcesChanged}
      />
    )

    fireEvent.click(screen.getByTitle('Editar imagenes'))
    expect(screen.getByText('Media manager')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Notify media change'))
    expect(onResourcesChanged).toHaveBeenCalledTimes(1)
  })

  it('does not show the media action for config-only sections', () => {
    render(
      <DraggableSectionList
        sections={[section('MomentWall')]}
        isLoading={false}
        onReorder={vi.fn()}
        onToggleVisible={vi.fn()}
        onSaveConfig={vi.fn()}
      />
    )

    expect(screen.queryByTitle('Editar imagenes')).not.toBeInTheDocument()
  })
})
