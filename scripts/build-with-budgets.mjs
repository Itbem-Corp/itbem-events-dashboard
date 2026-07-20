import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')
const budgets = {
  '/': 190,
  '/clients': 225,
  '/users': 205,
  '/events/[id]': 235,
  shared: 110,
}

const child = spawn(process.execPath, [nextCli, 'build'], { env: process.env, stdio: ['inherit', 'pipe', 'pipe'] })
let output = ''

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    const text = chunk.toString()
    output += text
    process.stdout.write(text)
  })
}

const status = await new Promise((resolve) => child.on('close', resolve))
if (status !== 0) process.exit(status ?? 1)

const clean = output.replace(/\u001b\[[0-9;]*m/g, '')
const failures = []
for (const [route, maximum] of Object.entries(budgets)) {
  const pattern = route === 'shared'
    ? /First Load JS shared by all\s+([\d.]+) kB/
    : new RegExp(`(?:^|\\n)[^\\n]*\\s${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+[\\d.]+ kB\\s+([\\d.]+) kB`)
  const match = clean.match(pattern)
  if (!match) throw new Error(`Could not read bundle size for ${route}`)
  const actual = Number(match[1])
  if (actual > maximum) failures.push(`${route}: ${actual} kB > ${maximum} kB`)
}

if (failures.length) throw new Error(`Bundle budgets exceeded:\n${failures.join('\n')}`)
console.log('Bundle budgets passed.')
