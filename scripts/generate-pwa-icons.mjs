import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

// Create a pink square with "E" letter as base icon
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#ec4899"/>
  <path d="M27 25h46v12H40v9h28v12H40v9h33v13H27V25z" fill="white"/>
</svg>`

const sizes = [
  { size: 192, file: 'public/icons/pwa-192.png', padding: 0 },
  { size: 512, file: 'public/icons/pwa-512.png', padding: 0 },
  { size: 512, file: 'public/icons/pwa-512-maskable.png', padding: 102 }, // 20% safe zone
]

for (const { size, file, padding } of sizes) {
  const logoSize = size - padding * 2
  const svg = Buffer.from(svgIcon)

  if (padding > 0) {
    await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 236, g: 72, b: 153, alpha: 1 } }
    })
      .composite([{
        input: await sharp(svg).resize(logoSize, logoSize).png().toBuffer(),
        top: padding, left: padding
      }])
      .png()
      .toFile(file)
  } else {
    await sharp(svg).resize(size, size).png().toFile(file)
  }
  console.log(`Generated: ${file}`)
}

console.log('PWA icons generated successfully.')
