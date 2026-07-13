import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('event detail configuration loading', () => {
  it('uses the configuration embedded by the protected detail response', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/(app)/events/[id]/page.tsx'), 'utf8')

    expect(source).toContain('event?.event_config ?? event?.config ?? undefined')
    expect(source).not.toContain('eventConfigPath(id)')
  })
})
