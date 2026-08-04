import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')

// Next 16 intentionally no longer reports "First Load JS" in its terminal
// output. These limits are measured from the client-reference manifests that
// the production build emits, so they remain tied to deployable artifacts.
const budgetsKiB = {
  '/': 375,
  '/clients': 390,
  '/users': 390,
  '/events/[id]': 450,
}

const routeManifestPaths = {
  '/': '(app)/page',
  '/clients': '(app)/clients/page',
  '/users': '(app)/users/page',
  '/events/[id]': '(app)/events/[id]/page',
}

function runBuild() {
  const child = spawn(process.execPath, [nextCli, 'build', '--webpack'], {
    env: { ...process.env, NEXT_DIST_DIR: '.next' },
    stdio: 'inherit',
  })
  return new Promise((resolve) => child.on('close', resolve))
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function loadClientReferenceManifest(distDir, manifestPath) {
  const file = join(
    distDir,
    'server',
    'app',
    `${manifestPath}_client-reference-manifest.js`,
  )
  const source = await readFile(file, 'utf8')
  const assignment = `globalThis.__RSC_MANIFEST["/${manifestPath}"]=`
  const start = source.indexOf(assignment)
  if (start < 0) {
    throw new Error(`Missing client-reference manifest assignment for ${manifestPath}`)
  }
  const serializedManifest = source.slice(start + assignment.length).trim()
  const manifest = JSON.parse(serializedManifest.replace(/;$/, ''))
  if (!manifest?.clientModules) {
    throw new Error(`Missing client-reference manifest for ${manifestPath}`)
  }
  return manifest
}

function clientAssetPaths(buildManifest, clientManifest) {
  const moduleAssets = Object.values(clientManifest.clientModules).flatMap(
    (module) => module.chunks ?? [],
  )
  return [
    ...new Set([
      ...(buildManifest.polyfillFiles ?? []),
      ...(buildManifest.rootMainFiles ?? []),
      ...moduleAssets,
    ]),
  ]
    .filter((asset) => asset.startsWith('static/'))
    .map((asset) => decodeURIComponent(asset))
}

async function gzipSizeKiB(distDir, assets) {
  const sizes = await Promise.all(
    assets.map(async (asset) => gzipSync(await readFile(join(distDir, asset))).length),
  )
  return sizes.reduce((total, size) => total + size, 0) / 1024
}

const status = await runBuild()
if (status !== 0) process.exit(status ?? 1)

const distDir = join(process.cwd(), '.next')
const buildManifest = await readJson(join(distDir, 'build-manifest.json'))
const failures = []

for (const [route, maximumKiB] of Object.entries(budgetsKiB)) {
  const clientManifest = await loadClientReferenceManifest(
    distDir,
    routeManifestPaths[route],
  )
  const actualKiB = await gzipSizeKiB(
    distDir,
    clientAssetPaths(buildManifest, clientManifest),
  )
  const roundedKiB = Number(actualKiB.toFixed(1))
  console.log(`${route}: ${roundedKiB} KiB gzip (limit ${maximumKiB} KiB)`)
  if (actualKiB > maximumKiB) {
    failures.push(`${route}: ${roundedKiB} KiB > ${maximumKiB} KiB`)
  }
}

if (failures.length) {
  throw new Error(`Initial client-asset budgets exceeded:\n${failures.join('\n')}`)
}

console.log('Initial client-asset budgets passed.')
