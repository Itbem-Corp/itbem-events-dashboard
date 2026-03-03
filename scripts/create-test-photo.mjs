// Creates a minimal 10x10 white JPEG for use in E2E tests.
// Run once: node scripts/create-test-photo.mjs
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = join(__dirname, '../tests/e2e/fixtures/test-photo.jpg')
mkdirSync(join(__dirname, '../tests/e2e/fixtures'), { recursive: true })

await sharp({
  create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 200, b: 200 } }
}).jpeg().toFile(out)

console.log('✓ tests/e2e/fixtures/test-photo.jpg created')
