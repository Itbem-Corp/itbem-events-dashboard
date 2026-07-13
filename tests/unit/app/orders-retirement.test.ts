import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

describe('legacy orders routes', () => {
  it.each(['src/app/(app)/orders/page.tsx', 'src/app/(app)/orders/[id]/page.tsx'])(
    '%s redirects on the server to events',
    (relativePath) => {
      const page = source(relativePath)

      expect(page).toContain("import { redirect } from 'next/navigation'")
      expect(page).toContain("redirect('/events')")
      expect(page).not.toContain("'use client'")
      expect(page).not.toMatch(/motion|refund|en desarrollo/i)
    }
  )
})
