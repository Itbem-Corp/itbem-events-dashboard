import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/events/event-share-panel.tsx'), 'utf8')

describe('event share resilience', () => {
  it('reuses the intent-prefetched constant-size summary', () => {
    expect(source).toContain('responsiveListSwrOptions')
    expect(source).not.toContain('revalidateOnFocus: true')
  })

  it('preserves cached links and QR after a failed background refresh', () => {
    expect(source).toContain('getDataErrorState(summaryError, rawSummary)')
    expect(source).toContain("summaryErrorState === 'fatal'")
    expect(source).toContain("summaryErrorState === 'stale'")
    expect(source).toContain('<StaleDataNotice')
  })
})
