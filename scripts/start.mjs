import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')

// Keep the production server on the same immutable build directory used by
// scripts/build.mjs. Without this explicit value `next start` falls back to
// `.next`, which is the mutable dev cache and can produce an invalid or stale
// routes manifest after a rebuild.
const env = {
  ...process.env,
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || '.next-build',
}

const child = spawn(process.execPath, [nextCli, 'start', ...process.argv.slice(2)], { env, stdio: 'inherit' })
const status = await new Promise((resolve) => child.on('close', resolve))

process.exitCode = status ?? 1
