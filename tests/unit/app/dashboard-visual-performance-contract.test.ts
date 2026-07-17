import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readAppFile(...segments: string[]) {
  return readFileSync(join(process.cwd(), 'src', 'app', '(app)', ...segments), 'utf8')
}

describe('dashboard visual and loading contracts', () => {
  it('keeps first-visit routes free from the motion runtime', () => {
    expect(readAppFile('page.tsx')).not.toContain("from 'motion/react'")
    expect(readAppFile('metrics', 'page.tsx')).not.toContain("from 'motion/react'")
  })

  it('lets the mobile audit grid shrink without clipping its result column', () => {
    const source = readAppFile('audit', 'page.tsx')

    expect(source).toContain('grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_auto]')
    expect(source).not.toContain('grid-cols-[minmax(8rem,0.8fr)_minmax(10rem,1.4fr)_minmax(7rem,0.7fr)]')
  })
})
