import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, '../../styles/tailwind.css'), 'utf8').replace(/\r\n/g, '\n')

function animationOf(selector: string): string {
  // First top-level rule for the selector (the reduced-motion override comes later, indented).
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) throw new Error(`no rule for ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  const match = body.match(/animation:\s*([^;]+);/)
  if (!match) throw new Error(`no animation in ${selector}`)
  return match[1]
}

describe('page wrapper animations (GST-61)', () => {
  // A held end frame keeps an identity transform on the wrapper, which then becomes
  // the containing block of position:fixed descendants (drag overlay, bottom sheets).
  it.each(['.page-transition', '.dashboard-reveal'])('%s does not hold its end frame', (selector) => {
    const animation = animationOf(selector)
    expect(animation).not.toMatch(/\b(both|forwards)\b/)
    expect(animation).toMatch(/\bbackwards\b/)
  })
})
