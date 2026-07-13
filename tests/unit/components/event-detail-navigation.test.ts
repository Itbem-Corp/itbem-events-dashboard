import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const navigationSources = [
  'src/app/(app)/events/[id]/page.tsx',
  'src/app/(app)/events/[id]/studio/page.tsx',
  'src/components/events/event-error-boundary.tsx',
  'src/components/events/event-detail-tabs.tsx',
  'src/components/events/event-guest-summary.tsx',
  'src/components/studio/studio-panel-tabs.tsx',
  'src/components/studio/studio-preview.tsx',
]

describe('Event Detail and Studio client navigation', () => {
  it.each(navigationSources)('%s does not use hard dashboard navigation', (relativePath) => {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

    expect(source).not.toMatch(/\bwindow\.location(?:\.href\s*=|\.assign\(|\.replace\(|\.reload\()/)
    expect(source).not.toMatch(/<a\b[^>]*\bhref\s*=\s*(?:["']\/events|\{`\/events)/)
  })

  it('keeps preview and public destinations explicitly external', () => {
    const eventActions = fs.readFileSync(
      path.join(process.cwd(), 'src/components/events/event-detail-actions-menu.tsx'),
      'utf8'
    )
    const studioPreview = fs.readFileSync(path.join(process.cwd(), 'src/components/studio/studio-preview.tsx'), 'utf8')

    expect(eventActions).toContain("window.open('about:blank', '_blank')")
    expect(eventActions).toMatch(/target="_blank"[\s\S]*?rel="noopener noreferrer"/)
    expect(studioPreview).toMatch(/target="_blank"[\s\S]*?rel="noopener noreferrer"/)
  })

  it('recovers Event Detail through the Next router instead of reloading the document', () => {
    const eventDetail = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/events/[id]/page.tsx'), 'utf8')

    expect(eventDetail).toContain('router.refresh()')
    expect(eventDetail).toContain('onRetry={handleEventRecovery}')
  })
})
