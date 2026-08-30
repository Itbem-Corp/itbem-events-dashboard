import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')

// Keep the production compiler separate from the dev server's mutable `.next` cache.
const env = {
  ...process.env,
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR?.trim() || '.next-build',
}

const child = spawn(process.execPath, [nextCli, 'build'], { env, stdio: 'inherit' })
const status = await new Promise((resolve) => child.on('close', resolve))

process.exitCode = status ?? 1
