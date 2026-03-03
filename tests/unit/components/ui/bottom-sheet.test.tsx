import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BottomSheet } from '@/components/ui/bottom-sheet'

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
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
