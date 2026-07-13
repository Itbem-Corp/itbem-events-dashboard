import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, imageSettings }: any) =>
    <div data-testid="qr-svg" data-value={value} data-image-settings={JSON.stringify(imageSettings ?? null)} />,
  QRCodeCanvas: ({ id, value, imageSettings }: any) =>
    <canvas id={id} data-testid="qr-canvas" data-image-settings={JSON.stringify(imageSettings ?? null)} />,
}))

import { BrandedQR } from '@/components/ui/branded-qr'

describe('BrandedQR', () => {
  it('keeps the branded logo while deferring the high-resolution canvas', () => {
    render(<BrandedQR value="https://example.com" />)
    const qr = screen.getByTestId('qr-svg')
    const settings = JSON.parse(qr.getAttribute('data-image-settings') ?? 'null')
    expect(settings).not.toBeNull()
    expect(settings.src).toMatch(/^data:image\/svg\+xml,/)
    expect(settings.excavate).toBe(true)
    expect(screen.queryByTestId('qr-canvas')).not.toBeInTheDocument()
  })
})
