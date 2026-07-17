import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

describe('global theme contract', () => {
  const roots = [join(process.cwd(), 'src', 'app'), join(process.cwd(), 'src', 'components')]
  const files = roots.flatMap(sourceFiles)

  it('keeps application neutrals on semantic theme tokens', () => {
    const forbidden = /(?:(?:bg|from|via|to)-zinc-(?:950|900|800|700)|text-zinc-(?:950|900|800|700|600|500|400|300|200|100|50)|(?:border(?:-l)?|outline|ring-offset)-zinc-(?:950|900|800|700|600|500|400|300|200|100)|(?:placeholder|fill|stroke|decoration)-zinc-(?:950|900|800|700|600|500|400|300))/
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return forbidden.test(source) ? [file.replace(process.cwd(), '')] : []
    })

    expect(violations).toEqual([])
  })

  it('does not force a native control into one color scheme', () => {
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return source.includes('[color-scheme:dark]') || source.includes('[color-scheme:light]')
        ? [file.replace(process.cwd(), '')]
        : []
    })

    expect(violations).toEqual([])
  })

  it('defines every semantic utility consumed by the component system', () => {
    const stylesheet = readFileSync(join(process.cwd(), 'src', 'styles', 'tailwind.css'), 'utf8')

    for (const token of [
      '--color-canvas',
      '--color-surface',
      '--color-surface-raised',
      '--color-surface-soft',
      '--color-ink',
      '--color-ink-secondary',
      '--color-ink-muted',
      '--color-border-subtle',
      '--color-border-strong',
    ]) {
      expect(stylesheet).toContain(token)
    }
  })

  it('keeps the authenticated shell aligned with the product brand language', () => {
    const stylesheet = readFileSync(join(process.cwd(), 'src', 'styles', 'tailwind.css'), 'utf8')

    for (const primitive of [
      '--app-brand-gradient',
      '.app-brand-cta',
      '.app-hero-surface',
      '.app-shell-panel',
      '.premium-surface',
    ]) {
      expect(stylesheet).toContain(primitive)
    }
  })
})
