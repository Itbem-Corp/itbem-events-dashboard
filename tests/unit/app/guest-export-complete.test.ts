import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('guest CSV export', () => {
  it('uses the complete filtered server export instead of the visible page', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/events/event-detail-guests-panel.tsx'),
      'utf8'
    )

    expect(source).toContain('eventGuestsExportPath(event.id')
    expect(source).toContain("{ responseType: 'blob' }")
    expect(source).toContain("'CSV completo'")
    expect(source).not.toContain('const rows = guests.map')
  })
})
