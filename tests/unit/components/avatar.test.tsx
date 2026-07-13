import { fireEvent, render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: ({ fill: _fill, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => <img {...props} />,
}))

import { Avatar } from '@/components/avatar'

describe('Avatar', () => {
  it('falls back after an image error and retries when a refreshed URL arrives', () => {
    const { rerender } = render(
      <Avatar src="https://signed.example.com/avatar-old.webp" initials="AB" alt="Foto de Ana" />
    )

    fireEvent.error(screen.getByRole('img', { name: 'Foto de Ana' }))
    expect(screen.queryByRole('img', { name: 'Foto de Ana' })).not.toBeInTheDocument()
    expect(screen.getByText('AB')).toBeInTheDocument()

    rerender(<Avatar src="https://signed.example.com/avatar-new.webp" initials="AB" alt="Foto de Ana" />)

    expect(screen.getByRole('img', { name: 'Foto de Ana' })).toHaveAttribute(
      'src',
      'https://signed.example.com/avatar-new.webp'
    )
  })

  it('normalizes surrounding whitespace before rendering a valid source', () => {
    render(<Avatar src="  https://signed.example.com/avatar.webp  " initials="AB" alt="Foto de Ana" />)

    expect(screen.getByRole('img', { name: 'Foto de Ana' })).toHaveAttribute(
      'src',
      'https://signed.example.com/avatar.webp'
    )
  })
})
