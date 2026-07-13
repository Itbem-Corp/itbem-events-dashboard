import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepareImageForUpload } from '@/lib/image-upload-optimization'

describe('prepareImageForUpload', () => {
  afterEach(() => vi.restoreAllMocks())

  it('preserves animated and browser-incompatible formats byte-for-byte', async () => {
    const gif = new File([new Uint8Array(900_000)], 'animacion.gif', { type: 'image/gif' })

    const result = await prepareImageForUpload(gif, { maxWidth: 1200, maxHeight: 1200 })

    expect(result.optimized).toBe(false)
    expect(result.file).toBe(gif)
  })

  it('creates a smaller WebP derivative when conversion is materially beneficial', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 2000, close }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob([new Uint8Array(350_000)], { type: 'image/webp' }))
    })
    const original = new File([new Uint8Array(1_000_000)], 'portada.png', { type: 'image/png' })

    const result = await prepareImageForUpload(original, {
      maxWidth: 2400,
      maxHeight: 2400,
      minimumBytes: 0,
    })

    expect(result.optimized).toBe(true)
    expect(result.file.name).toBe('portada.webp')
    expect(result.file.type).toBe('image/webp')
    expect(result.outputBytes).toBe(350_000)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('keeps the original when the encoded derivative would not save bytes', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 2000, close: vi.fn() }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob([new Uint8Array(980_000)], { type: 'image/webp' }))
    })
    const original = new File([new Uint8Array(1_000_000)], 'foto.avif', { type: 'image/avif' })

    const result = await prepareImageForUpload(original, {
      maxWidth: 2400,
      maxHeight: 2400,
      minimumBytes: 0,
    })

    expect(result.optimized).toBe(false)
    expect(result.file).toBe(original)
  })

  it('honors cancellation before doing image work', async () => {
    const controller = new AbortController()
    controller.abort()
    const original = new File([new Uint8Array(1_000_000)], 'foto.png', { type: 'image/png' })

    await expect(
      prepareImageForUpload(original, {
        maxWidth: 1200,
        maxHeight: 1200,
        minimumBytes: 0,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
