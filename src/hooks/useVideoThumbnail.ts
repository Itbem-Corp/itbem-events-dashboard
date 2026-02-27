import { useEffect, useState } from 'react'

/**
 * Extracts the first frame of a video as a blob URL via canvas.
 * Returns null while extracting or if extraction fails (caller shows fallback).
 * Automatically revokes the blob URL on unmount.
 *
 * Only call this when thumbnail_url is absent — it creates a network request
 * to load video metadata (~50-200 KB).
 */
export function useVideoThumbnail(videoUrl: string | null): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    setThumbnailUrl(null)   // reset immediately on URL change
    if (!videoUrl) return

    let cancelled = false
    let blobUrl: string | null = null

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.crossOrigin = 'anonymous'
    video.playsInline = true

    video.onloadedmetadata = () => {
      if (cancelled) return
      video.currentTime = 0.1
    }

    video.onseeked = () => {
      if (cancelled) return
      if (!video.videoWidth || !video.videoHeight) return  // dimensions not ready
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { video.src = ''; video.load(); return }
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            if (cancelled || !blob) return
            blobUrl = URL.createObjectURL(blob)
            setThumbnailUrl(blobUrl)
          },
          'image/jpeg',
          0.8
        )
      } catch {
        // CORS taint or draw failure — stay null, caller shows play icon fallback
      }
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
