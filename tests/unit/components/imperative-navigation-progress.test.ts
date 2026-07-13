import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('imperative navigation progress', () => {
  it('covers organization switching before routing to events', () => {
    const source = readSource('src/app/(app)/clients/page.tsx')
    expect(source).toMatch(/beginNavigationProgress\(\)\s+router\.push\('\/events'\)/)
  })

  it('covers navigation into a newly created event', () => {
    const source = readSource('src/components/events/forms/event-form-modal.tsx')
    expect(source).toMatch(/beginNavigationProgress\(\)\s+router\.push\(`\/events\/\$\{created\.id\}`\)/)
  })
})
