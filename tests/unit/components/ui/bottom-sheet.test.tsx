import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BottomSheet, SheetRow } from '@/components/ui/bottom-sheet'

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...props }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) =>
      <div {...props}>{children}</div>,
  },
}))

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
