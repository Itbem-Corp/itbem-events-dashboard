import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : []
  })
}

describe('source text encoding', () => {
  it('contains no common UTF-8 mojibake sequences in user-facing source', () => {
    const failures = sourceFiles(join(process.cwd(), 'src')).flatMap((path) => {
      const matches = readFileSync(path, 'utf8').match(/[âÃÂ]|ðŸ/g)
      return matches ? [`${relative(process.cwd(), path)}: ${[...new Set(matches)].join(' ')}`] : []
    })

    expect(failures).toEqual([])
  })
})
