import { useEffect, useState } from 'react'

/**
 * Extracts the first non-black frame of a video as a blob URL via canvas.
 * Returns null while extracting or if extraction fails (caller shows fallback).
 * Automatically revokes the blob URL on unmount.
 *
 * Retries through progressive timestamps [0.1, 0.5, 1.0, 2.0] to avoid
 * black intro frames. Also waits one animation frame after onseeked before
 * drawing to ensure the decoded frame is in the video element's GPU buffer.
 *
 * Only call this when thumbnail_url is absent — it creates a network request
 * to load video metadata (~50-200 KB).
 */

const SEEK_TIMESTAMPS = [0.1, 0.5, 1.0, 2.0]

export function isBlackFrame(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  // Sample a 16x16 grid across the canvas
  const sampleW = Math.max(1, Math.floor(canvas.width / 16))
  const sampleH = Math.max(1, Math.floor(canvas.height / 16))
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const maxPx = (canvas.width * canvas.height - 1) * 4
  let totalBrightness = 0
  let samples = 0
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const px = Math.min((y * sampleH * canvas.width + x * sampleW) * 4, maxPx)
      totalBrightness += (data[px] + data[px + 1] + data[px + 2]) / 3
      samples++
    }
  }
  return (totalBrightness / samples) < 15
}

export function useVideoThumbnail(videoUrl: string | null): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    setThumbnailUrl(null)
    if (!videoUrl) return

    let cancelled = false
    let blobUrl: string | null = null
    let seekIndex = 0

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.crossOrigin = 'anonymous'
    video.playsInline = true

    const trySeek = () => {
      if (cancelled || seekIndex >= SEEK_TIMESTAMPS.length) return
      video.currentTime = SEEK_TIMESTAMPS[seekIndex]
    }

    const drawFrame = () => {
      if (cancelled) return
      if (!video.videoWidth || !video.videoHeight) {
        seekIndex++
        trySeek()
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        if (isBlackFrame(canvas)) {
          // Black frame — try next timestamp
          seekIndex++
          trySeek()
          return
        }
        canvas.toBlob((blob) => {
          if (cancelled || !blob) return
          blobUrl = URL.createObjectURL(blob)
          setThumbnailUrl(blobUrl)
        }, 'image/jpeg', 0.8)
      } catch {
        // CORS taint or other error — try next timestamp
        seekIndex++
        trySeek()
      }
    }

    video.onloadedmetadata = () => {
      if (!cancelled) trySeek()
    }

    video.onseeked = () => {
      if (cancelled) return
      // Wait one animation frame before drawing so the decoded frame
      // is guaranteed to be in the video element's buffer
      requestAnimationFrame(drawFrame)
    }

    video.onerror = () => { /* intentionally empty — stays null, caller shows play icon */ }

    video.src = videoUrl

    return () => {
      cancelled = true
      video.src = ''
      video.load()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [videoUrl])

  return thumbnailUrl
}
