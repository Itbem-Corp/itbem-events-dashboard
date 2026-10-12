import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const config = readFileSync(resolve(process.cwd(), 'next.config.mjs'), 'utf8')

describe('retired /orders routes', () => {
  it('redirect permanently to /events from next.config', () => {
    expect(config).toContain('async redirects()')
    expect(config).toContain("{ source: '/orders', destination: '/events', permanent: true }")
    expect(config).toContain("{ source: '/orders/:path*', destination: '/events', permanent: true }")
  })

  it('have no page left behind', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/(app)/orders/page.tsx'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'src/app/(app)/orders/[id]/page.tsx'))).toBe(false)
  })
})
