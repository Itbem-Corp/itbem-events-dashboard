import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Pagination } from '@/components/ui/pagination'

// motion/react uses animations — mock to avoid act() warnings in jsdom
vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...props}>{children}</div>
        ),
    },
}))

describe('Pagination', () => {
    it('renders nothing when total <= pageSize', () => {
        const { container } = render(
            <Pagination total={5} page={1} pageSize={10} onPageChange={vi.fn()} />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders nothing when total equals pageSize', () => {
        const { container } = render(
            <Pagination total={10} page={1} pageSize={10} onPageChange={vi.fn()} />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders pagination controls when total > pageSize', () => {
        render(
            <Pagination total={25} page={1} pageSize={10} onPageChange={vi.fn()} />
        )
        expect(screen.getByLabelText('Página anterior')).toBeInTheDocument()
        expect(screen.getByLabelText('Página siguiente')).toBeInTheDocument()
    })

    it('displays correct range text', () => {
        render(
            <Pagination total={25} page={2} pageSize={10} onPageChange={vi.fn()} />
        )
        // Page 2: items 11–20 of 25
        expect(screen.getByText(/11.*20.*25/)).toBeInTheDocument()
    })

    it('disables "Anterior" button on first page', () => {
        render(
            <Pagination total={25} page={1} pageSize={10} onPageChange={vi.fn()} />
        )
        expect(screen.getByLabelText('Página anterior')).toBeDisabled()
    })

    it('disables "Siguiente" button on last page', () => {
        render(
            <Pagination total={25} page={3} pageSize={10} onPageChange={vi.fn()} />
        )
        // 3 pages total (25/10 = 3 pages)
        expect(screen.getByLabelText('Página siguiente')).toBeDisabled()
    })

    it('calls onPageChange with previous page when "Anterior" is clicked', () => {
        const onPageChange = vi.fn()
        render(
            <Pagination total={25} page={2} pageSize={10} onPageChange={onPageChange} />
        )
        fireEvent.click(screen.getByLabelText('Página anterior'))
        expect(onPageChange).toHaveBeenCalledWith(1)
    })

    it('calls onPageChange with next page when "Siguiente" is clicked', () => {
        const onPageChange = vi.fn()
        render(
            <Pagination total={25} page={1} pageSize={10} onPageChange={onPageChange} />
        )
        fireEvent.click(screen.getByLabelText('Página siguiente'))
        expect(onPageChange).toHaveBeenCalledWith(2)
    })
})
