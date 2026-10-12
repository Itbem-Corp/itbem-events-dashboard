import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// GST-N1 / EVT-N1: status text written for dark surfaces (text-amber-200,
// text-red-100, text-emerald-400…) must stay readable in the light theme.

const stylesheet = readFileSync(join(process.cwd(), 'src', 'styles', 'tailwind.css'), 'utf8').replace(/\r\n/g, '\n')

// Tailwind 500 shades, used to build the tinted backgrounds (bg-<hue>-500/5…/15).
const HUE_500: Record<string, string> = {
  amber: '#f59e0b', yellow: '#eab308', orange: '#f97316', lime: '#84cc16', green: '#22c55e',
  emerald: '#10b981', teal: '#14b8a6', cyan: '#06b6d4', sky: '#0ea5e9', blue: '#3b82f6',
  indigo: '#6366f1', violet: '#8b5cf6', purple: '#a855f7', fuchsia: '#d946ef', pink: '#ec4899',
  rose: '#f43f5e', red: '#ef4444',
}
const LIGHT_SHADES = [50, 100, 200, 300, 400, 500]

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function tint(hex: string, alpha: number): [number, number, number] {
  const [r, g, b] = rgb(hex)
  return [r, g, b].map((c) => Math.round(c * alpha + 255 * (1 - alpha))) as [number, number, number]
}

const lightRules = stylesheet
  .split("[data-theme='light']")
  .slice(1)
  .map((chunk) => chunk.slice(0, chunk.indexOf('}') + 1))

function lightHoverRule(hue: string, shade: number): string | null {
  const token = `[class~='hover:text-${hue}-${shade}']`
  return lightRules.find((candidate) => candidate.includes(token)) ?? null
}

function lightRuleColor(hue: string, shade: number): string | null {
  const token = `[class~='text-${hue}-${shade}']`
  const rule = lightRules.find((candidate) => candidate.includes(token))
  return rule ? (/color:\s*(#[0-9a-f]{6})\s*!important/i.exec(rule)?.[1] ?? null) : null
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(tsx?|mjs)$/.test(entry.name) ? [path] : []
  })
}

describe('light theme status text contrast', () => {
  it('remaps every light text shade to an AA color on white and on its tint', () => {
    for (const [hue, base] of Object.entries(HUE_500)) {
      for (const shade of LIGHT_SHADES) {
        const color = lightRuleColor(hue, shade)
        expect(color, `text-${hue}-${shade}`).not.toBeNull()
        expect(contrast(rgb(color!), [255, 255, 255]), `text-${hue}-${shade} on white`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(rgb(color!), tint(base, 0.15)), `text-${hue}-${shade} on bg-${hue}-500/15`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('covers every light status text class used by the app', () => {
    const pattern = /(?:^|["'`\s])text-([a-z]+)-(50|100|200|300|400|500)(?=[\s"'`/]|$)/g
    const uncovered = new Set<string>()
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
        const [, hue, shade] = match
        if (['zinc', 'slate', 'gray', 'neutral', 'stone', 'white', 'black'].includes(hue)) continue
        if (!lightRuleColor(hue, Number(shade))) uncovered.add(`text-${hue}-${shade}`)
      }
    }
    expect([...uncovered]).toEqual([])
  })

  it('matches exact class tokens only, so dark: and other variants keep their colors', () => {
    expect(stylesheet).not.toMatch(/\[class\*='text-(amber|red|emerald)-'\]/)
  })

  it('remaps hover: light shades to the same AA color, only while hovered', () => {
    for (const hue of Object.keys(HUE_500)) {
      for (const shade of LIGHT_SHADES) {
        const rule = lightHoverRule(hue, shade)
        expect(rule, `hover:text-${hue}-${shade}`).not.toBeNull()
        expect(rule).toMatch(/\):hover:not\(/)
        expect(/color:\s*(#[0-9a-f]{6})\s*!important/i.exec(rule!)?.[1]).toBe(lightRuleColor(hue, shade))
      }
    }
  })

  it('covers every hover: light text class used by the app', () => {
    const pattern = /(?:^|["'`\s])hover:text-([a-z]+)-(50|100|200|300|400|500)(?=[\s"'`/]|$)/g
    const uncovered = new Set<string>()
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
        const [, hue, shade] = match
        if (['zinc', 'slate', 'gray', 'neutral', 'stone', 'white', 'black'].includes(hue)) continue
        if (!lightHoverRule(hue, Number(shade))) uncovered.add(`hover:text-${hue}-${shade}`)
      }
    }
    expect([...uncovered]).toEqual([])
  })

  it('lets text over photos opt out with on-media (review F9)', () => {
    const textRules = lightRules.filter((rule) => /\[class~='(?:hover:)?text-[a-z]+-50'\]/.test(rule))
    expect(textRules.length).toBe(Object.keys(HUE_500).length * 2)
    for (const rule of textRules) expect(rule).toContain("[class~='on-media']")

    // The moments-wall photo badges adopt on-media in the eventiapp moments PR.
  })
})
