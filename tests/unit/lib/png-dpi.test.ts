import { describe, it, expect } from 'vitest'
import { crc32, injectPngDpi } from '@/lib/png-dpi'

describe('crc32', () => {
  it('returns 0 for empty input', () => {
    expect(crc32(new Uint8Array([]))).toBe(0x00000000)
  })

  it('matches known CRC for "pHYs" type bytes', () => {
    // Pre-computed CRC32 of bytes [0x70, 0x48, 0x59, 0x73] = 0x96876563
    const typeBytes = new Uint8Array([0x70, 0x48, 0x59, 0x73])
    expect(crc32(typeBytes)).toBe(0x96876563)
  })
})

describe('injectPngDpi', () => {
  // Minimal valid 1×1 white PNG (base64) — standard test fixture
  const MINIMAL_PNG =
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg=='

  it('output is longer than input (chunk was inserted)', () => {
    const result = injectPngDpi(MINIMAL_PNG, 300)
    const inputLen = atob(MINIMAL_PNG.split(',')[1]).length
    const outputLen = atob(result.split(',')[1]).length
    expect(outputLen).toBe(inputLen + 21)
  })

  it('pHYs signature is at byte offset 37 (after 33-byte IHDR + 4-byte length field)', () => {
    const result = injectPngDpi(MINIMAL_PNG, 300)
    const binary = atob(result.split(',')[1])
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    expect(bytes[37]).toBe(0x70) // 'p'
    expect(bytes[38]).toBe(0x48) // 'H'
    expect(bytes[39]).toBe(0x59) // 'Y'
    expect(bytes[40]).toBe(0x73) // 's'
  })

  it('embeds correct pixels-per-metre for 300 DPI', () => {
    const result = injectPngDpi(MINIMAL_PNG, 300)
    const binary = atob(result.split(',')[1])
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const view = new DataView(bytes.buffer)
    // pHYs data starts at offset 41 (33 + 4 length bytes + 4 type bytes)
    const ppm = view.getUint32(41, false)
    expect(ppm).toBe(Math.round(300 / 0.0254)) // 11811
  })
})
