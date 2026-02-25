/**
 * Injects a pHYs (physical pixel dimensions) chunk into a PNG data URL.
 * This makes the image open at the correct physical size in print dialogs.
 *
 * PNG chunk layout: length(4) + type(4) + data(9) + crc(4) = 21 bytes
 * Inserted immediately after the IHDR chunk (byte offset 33).
 */

/** CRC32 using standard reflected polynomial 0xEDB88320. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Injects DPI metadata into a PNG data URL.
 * @param dataUrl - PNG as base64 data URL (output of canvas.toDataURL('image/png'))
 * @param dpi     - Target resolution in dots per inch (e.g. 300)
 * @returns New data URL with pHYs chunk embedded
 */
export function injectPngDpi(dataUrl: string, dpi: number): string {
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('injectPngDpi: expected a PNG data URL')
  }

  // 1. Decode base64 → bytes
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  if (bytes.length < 33) {
    throw new Error('injectPngDpi: PNG too short to contain an IHDR chunk')
  }

  // 2. Build pHYs data: X ppu (4B) + Y ppu (4B) + unit byte (1B)
  const ppm = Math.round(dpi / 0.0254) // dots per inch → pixels per metre
  const chunkData = new Uint8Array(9)
  const dv = new DataView(chunkData.buffer)
  dv.setUint32(0, ppm, false)  // X pixels per unit
  dv.setUint32(4, ppm, false)  // Y pixels per unit
  chunkData[8] = 1              // unit = metre

  // 3. Type bytes: "pHYs"
  const typeBytes = new Uint8Array([0x70, 0x48, 0x59, 0x73])

  // 4. CRC32 over type + data (13 bytes)
  const crcInput = new Uint8Array(13)
  crcInput.set(typeBytes, 0)
  crcInput.set(chunkData, 4)
  const crc = crc32(crcInput)

  // 5. Assemble full chunk: length(4) + type(4) + data(9) + crc(4)
  const chunk = new Uint8Array(21)
  const chunkView = new DataView(chunk.buffer)
  chunkView.setUint32(0, 9, false)   // data length = 9
  chunk.set(typeBytes, 4)
  chunk.set(chunkData, 8)
  chunkView.setUint32(17, crc, false)

  // 6. Insert chunk after IHDR (PNG sig=8B + IHDR chunk=25B → offset 33)
  const IHDR_END = 33
  const result = new Uint8Array(bytes.length + 21)
  result.set(bytes.slice(0, IHDR_END))
  result.set(chunk, IHDR_END)
  result.set(bytes.slice(IHDR_END), IHDR_END + 21)

  // 7. Re-encode to base64 data URL
  let out = ''
  for (let i = 0; i < result.length; i++) out += String.fromCharCode(result[i])
  return `data:image/png;base64,${btoa(out)}`
}
