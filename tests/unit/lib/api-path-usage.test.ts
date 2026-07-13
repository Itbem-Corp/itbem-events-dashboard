import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.join(process.cwd(), 'src')
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const DIRECT_API_CALL_PATTERN = /\bapi\.(?:get|post|put|patch|delete)\(\s*(['"`])\//g
const DIRECT_SWR_KEY_PATTERN = /\b(?:useSWR|mutate)\(\s*(['"`])\/(?:events|clients|users|guests|moments|resources|sections|tables|catalogs|event-types|fonts|invitations|admin|cache)\b/g

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...sourceFiles(fullPath))
      continue
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry))) files.push(fullPath)
  }

  return files
}

function lineForIndex(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length
}

function directBackendPathUsages(): string[] {
  const violations: string[] = []

  for (const file of sourceFiles(SRC_DIR)) {
    const relative = path.relative(process.cwd(), file).replace(/\\/g, '/')
    if (relative === 'src/lib/api-paths.ts') continue

    const source = readFileSync(file, 'utf8')
    for (const pattern of [DIRECT_API_CALL_PATTERN, DIRECT_SWR_KEY_PATTERN]) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(source))) {
        violations.push(`${relative}:${lineForIndex(source, match.index)}`)
      }
    }
  }

  return violations
}

describe('dashboard API path usage', () => {
  it('keeps backend paths centralized in src/lib/api-paths.ts', () => {
    expect(directBackendPathUsages()).toEqual([])
  })
})
