import sharp from 'sharp'
import { mkdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

mkdirSync(join(root, 'public/icons'), { recursive: true })

// Real eventiapp icon — dark background so pink logo pops
// We embed the SVG inline with inlined colors (no CSS classes) for sharp compatibility
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150.16 160.61">
  <g>
    <path fill="#dd2284" d="M84.04,51.16c-4.5-2.04-9.42-2.92-14.76-2.64-4.36.28-8.44,1.27-12.23,2.95-3.79,1.69-7.14,3.98-10.02,6.85-2.88,2.88-5.24,6.22-7.07,10.02-1.83,3.79-2.95,7.94-3.37,12.44-.42,5.35.28,10.27,2.11,14.76,1.83,4.5,4.43,8.02,7.8,10.55l48.3-47.03c-2.67-3.23-6.26-5.87-10.76-7.91Z"/>
    <path fill="#dd2284" d="M71.7,21.16c-33.92,0-61.42,27.5-61.42,61.42s27.5,61.42,61.42,61.42,61.42-27.5,61.42-61.42-27.5-61.42-61.42-61.42ZM97.01,129.51c-7.8,3.94-16.28,5.91-25.41,5.91-7.17,0-13.92-1.37-20.25-4.11-6.33-2.74-11.81-6.43-16.45-11.07-4.64-4.64-8.33-10.12-11.07-16.45-2.74-6.33-4.11-13.08-4.11-20.25s1.37-14.13,4.11-20.46,6.43-11.84,11.07-16.56c4.64-4.71,10.12-8.44,16.45-11.18s13.08-4.11,20.25-4.11c9.14,0,17.75,2.11,25.84,6.33,8.08,4.22,15.08,10.76,20.98,19.61l-61.16,56.94c2.25,1.55,5.06,2.64,8.44,3.27,3.38.63,6.75.74,10.12.32,5.91-.7,11.42-2.71,16.56-6.01,5.13-3.3,9.45-7.49,12.97-12.55l12.02,11.6c-5.77,8.58-12.55,14.84-20.35,18.77Z"/>
  </g>
  <polygon fill="#ffffff" points="119.78 77.03 129.47 76.89 121.71 82.7 124.84 91.87 116.92 86.29 109.16 92.09 112.03 82.83 104.11 77.25 113.8 77.11 116.66 67.86 119.78 77.03"/>
</svg>`

const logoBuf = Buffer.from(logoSvg)

// Generate icon at given size with optional padding (for maskable safe zone)
async function makeIcon(size, file, paddingFraction = 0) {
  const pad = Math.round(size * paddingFraction)
  const logoSize = size - pad * 2

  const resizedLogo = await sharp(logoBuf)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 24, g: 24, b: 27, alpha: 1 } }, // zinc-900 #18181b
  })
    .composite([{ input: resizedLogo, top: pad, left: pad }])
    .png()
    .toFile(join(root, file))

  console.log(`✓ ${file}`)
}

await makeIcon(192, 'public/icons/pwa-192.png')
await makeIcon(512, 'public/icons/pwa-512.png')
await makeIcon(512, 'public/icons/pwa-512-maskable.png', 0.2) // 20% padding = maskable safe zone

console.log('✅ PWA icons generated.')
