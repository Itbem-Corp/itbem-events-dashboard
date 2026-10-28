/** Fetch independently of media cached by an image or video without CORS. */
export async function fetchMomentDownload(url: string): Promise<Blob> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'omit' })
  if (!response.ok) throw new Error(`Media download failed (${response.status})`)
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('Empty media response')
  return blob
}

export function saveMomentDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    // Browsers may consume the URL after click() returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
