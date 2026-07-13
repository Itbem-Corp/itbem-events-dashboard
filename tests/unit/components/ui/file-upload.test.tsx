import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FileUpload } from '@/components/ui/file-upload'

describe('FileUpload', () => {
  it('uses the configured maxSize in the default helper text', () => {
    render(<FileUpload onChange={vi.fn()} maxSize={10 * 1024 * 1024} />)

    expect(screen.getByText('JPG, PNG, WebP, HEIC, MP4, MOV · Hasta 10 MB')).toBeInTheDocument()
  })

  it('announces empty files instead of forwarding them to the form', async () => {
    const onChange = vi.fn()
    const { container } = render(<FileUpload onChange={onChange} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [new File([], 'empty.png', { type: 'image/png' })] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo está vacío')
    expect(onChange).not.toHaveBeenCalled()
  })
})
