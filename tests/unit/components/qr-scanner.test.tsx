import { QRScanner } from '@/components/events/qr-scanner'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const scanner = vi.hoisted(() => ({
  decode: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints = scanner.decode
  },
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('QRScanner', () => {
  it('requests the environment camera and stops scanning on close', async () => {
    scanner.decode.mockResolvedValue({ stop: scanner.stop })
    const onClose = vi.fn()
    const { unmount } = render(<QRScanner onScan={vi.fn()} onClose={onClose} />)

    await waitFor(() => expect(scanner.decode).toHaveBeenCalledOnce())
    expect(scanner.decode.mock.calls[0][0]).toEqual({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    unmount()
    expect(scanner.stop).toHaveBeenCalledOnce()
  })

  it('shows a recoverable camera error and retries without remounting', async () => {
    scanner.decode.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce({ stop: scanner.stop })
    render(<QRScanner onScan={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo acceder a la cámara')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar cámara' }))
    await waitFor(() => expect(scanner.decode).toHaveBeenCalledTimes(2))
  })
})
