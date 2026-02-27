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
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 180
      const ctx = canvas.getContext('2d')
      if (!ctx) return
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
