const OPTIMIZABLE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'])

export interface ImageUploadOptimizationOptions {
  maxWidth: number
  maxHeight: number
  quality?: number
  minimumBytes?: number
  signal?: AbortSignal
}

export interface PreparedImageUpload {
  file: File
  optimized: boolean
  originalBytes: number
  outputBytes: number
}

function outputName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim() || 'imagen'
  return `${base}.webp`
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

export async function prepareImageForUpload(
  source: File,
  { maxWidth, maxHeight, quality = 0.9, minimumBytes = 700 * 1024, signal }: ImageUploadOptimizationOptions
): Promise<PreparedImageUpload> {
  const unchanged = {
    file: source,
    optimized: false,
    originalBytes: source.size,
    outputBytes: source.size,
  }

  if (
    source.size < minimumBytes ||
    !OPTIMIZABLE_TYPES.has(source.type.toLowerCase()) ||
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  ) {
    return unchanged
  }

  if (signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
    if (signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return unchanged

    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, quality)
    if (signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
    if (!blob?.size || blob.type !== 'image/webp') return unchanged

    if (blob.size >= source.size * 0.95) return unchanged

    const file = new File([blob], outputName(source.name), {
      type: 'image/webp',
      lastModified: source.lastModified,
    })
    return {
      file,
      optimized: true,
      originalBytes: source.size,
      outputBytes: file.size,
    }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Upload canceled', 'AbortError')
    // The backend still supports formats that some browsers cannot decode (for example AVIF on older devices).
    return unchanged
  } finally {
    bitmap?.close()
  }
}
