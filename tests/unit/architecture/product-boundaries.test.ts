import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_MANIFESTS } from '@/products/registry'

const srcRoot = resolve(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(entry) ? [path] : []
  })
}

describe('product architecture boundaries', () => {
  it('keeps product core independent from concrete products', () => {
    for (const file of sourceFiles(resolve(srcRoot, 'products/core'))) {
      const source = readFileSync(file, 'utf8')
      expect(source, relative(srcRoot, file)).not.toMatch(/@\/products\/(eventiapp|itbem|cafettonhouse)\//)
    }
  })

  it('prevents one concrete product from importing another', () => {
    for (const product of ['eventiapp', 'itbem', 'cafettonhouse'] as const) {
      for (const file of sourceFiles(resolve(srcRoot, 'products', product))) {
        const source = readFileSync(file, 'utf8')
        for (const other of ['eventiapp', 'itbem', 'cafettonhouse'].filter((code) => code !== product)) {
          expect(source, relative(srcRoot, file)).not.toContain(`@/products/${other}/`)
        }
      }
    }
  })

  it('gives every product a unique, feature-backed route contract', () => {
    for (const manifest of Object.values(PRODUCT_MANIFESTS)) {
      expect(new Set(manifest.routes.map((route) => route.path)).size).toBe(manifest.routes.length)
      for (const route of manifest.routes) expect(manifest.features).toContain(route.feature)
    }
  })
})
