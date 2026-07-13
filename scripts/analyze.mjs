import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')
const result = spawnSync(process.execPath, [nextCli, 'build', ...process.argv.slice(2)], {
  env: { ...process.env, ANALYZE: 'true' },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
