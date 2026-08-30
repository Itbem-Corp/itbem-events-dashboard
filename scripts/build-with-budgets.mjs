import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')
// Next 16 no longer emits its old "First Load JS" route table. Measure the
// immutable manifest instead of parsing presentation-only CLI output.
const sharedBudgetKB = 180

const buildEnv = {
  ...process.env,
  // Production builds must never share Next's mutable output folder with `next dev`.
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || '.next-build',
}
const child = spawn(process.execPath, [nextCli, 'build', '--webpack'], { env: buildEnv, stdio: 'inherit' })

const status = await new Promise((resolve) => child.on('close', resolve))
if (status !== 0) process.exit(status ?? 1)

const distDirectory = buildEnv.NEXT_DIST_DIR
const manifest = JSON.parse(await readFile(join(distDirectory, 'build-manifest.json'), 'utf8'))
const sharedFiles = [...manifest.polyfillFiles, ...manifest.rootMainFiles]
if (!sharedFiles.length) throw new Error('Build manifest did not contain the shared application shell.')

const compressedBytes = await Promise.all(sharedFiles.map(async (file) => {
  const contents = await readFile(join(distDirectory, file))
  return gzipSync(contents).byteLength
}))
const sharedKB = compressedBytes.reduce((total, size) => total + size, 0) / 1024

if (sharedKB > sharedBudgetKB) {
  throw new Error(`Shared application shell budget exceeded: ${sharedKB.toFixed(1)} kB > ${sharedBudgetKB} kB`)
}
console.log(`Shared application shell budget passed: ${sharedKB.toFixed(1)} kB <= ${sharedBudgetKB} kB.`)
