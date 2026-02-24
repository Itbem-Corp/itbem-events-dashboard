import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) =>
    <div data-testid="qr-svg" data-value={value} />,
  QRCodeCanvas: ({ id, value, imageSettings }: any) =>
    <canvas id={id} data-testid="qr-canvas" data-image-settings={JSON.stringify(imageSettings ?? null)} />,
}))

import { BrandedQR } from '@/components/ui/branded-qr'

describe('BrandedQR', () => {
  it('hidden canvas has imageSettings for logo', () => {
    render(<BrandedQR value="https://example.com" />)
    const canvas = screen.getByTestId('qr-canvas')
    const settings = JSON.parse(canvas.getAttribute('data-image-settings') ?? 'null')
    expect(settings).not.toBeNull()
    expect(settings.src).toBeTruthy()
    expect(settings.excavate).toBe(true)
  })
})
