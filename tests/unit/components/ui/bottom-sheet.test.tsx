import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BottomSheet, SheetRow } from '@/components/ui/bottom-sheet'

describe('BottomSheet', () => {
  it('renders children when open', () => {
    render(
      <BottomSheet isOpen onClose={() => {}}>
        <div>Sheet content</div>
      </BottomSheet>
    )
    expect(screen.getByText('Sheet content')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <BottomSheet isOpen={false} onClose={() => {}}>
        <div>Sheet content</div>
      </BottomSheet>
    )
    expect(screen.queryByText('Sheet content')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet isOpen onClose={onClose}>
        <div>content</div>
      </BottomSheet>
    )
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders title when provided', () => {
    render(
      <BottomSheet isOpen onClose={() => {}} title="Más acciones">
        <div>content</div>
      </BottomSheet>
    )
    expect(screen.getByText('Más acciones')).toBeInTheDocument()
  })

  it('uses a semantic dialog and closes with Escape', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet isOpen onClose={onClose} title="Más acciones">
        <div>content</div>
      </BottomSheet>
    )
    expect(screen.getByRole('dialog', { name: 'Más acciones' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('locks document scrolling and restores the previous value when unmounted', async () => {
    // Headless Dialog locks the document element, rather than body.
    const original = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'scroll'
    const view = render(<BottomSheet isOpen onClose={() => {}}><div>content</div></BottomSheet>)
    try {
      await waitFor(() => expect(document.documentElement.style.overflow).toBe('hidden'))
      view.unmount()
      await waitFor(() => expect(document.documentElement.style.overflow).toBe('scroll'))
    } finally {
      view.unmount()
      document.documentElement.style.overflow = original
    }
  })
})

describe('SheetRow', () => {
  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<SheetRow icon={<span>icon</span>} label="Test" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn()
    render(<SheetRow icon={<span>icon</span>} label="Test" onClick={onClick} disabled />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders with danger variant without throwing', () => {
    render(<SheetRow icon={<span>icon</span>} label="Delete" onClick={() => {}} variant="danger" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('renders trailing content when provided', () => {
    render(<SheetRow icon={<span>icon</span>} label="Test" onClick={() => {}} trailing={<span>Active</span>} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })
})
