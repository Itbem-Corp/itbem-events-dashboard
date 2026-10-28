import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMomentDownload, saveMomentDownload } from '@/lib/moment-download'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('moment downloads', () => {
  it('fetches fresh media without credentials', async () => {
    const blob = new Blob(['video'])
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob })
    vi.stubGlobal('fetch', fetch)
    expect(await fetchMomentDownload('/video.mp4')).toBe(blob)
    expect(fetch).toHaveBeenCalledWith('/video.mp4', { cache: 'no-store', credentials: 'omit' })
  })
  it('rejects HTTP errors and empty responses', async () => {
    const readBlob = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, blob: readBlob }))
    await expect(fetchMomentDownload('/photo')).rejects.toThrow('403')
    expect(readBlob).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }))
    await expect(fetchMomentDownload('/photo')).rejects.toThrow('Empty')
  })
  it('keeps the URL alive until the browser starts the download', () => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true)
      expect(this.download).toBe('momentos.zip')
    })
    saveMomentDownload(new Blob(['zip']), 'momentos.zip')
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revoke).toHaveBeenCalledWith('blob:download')
  })
})
