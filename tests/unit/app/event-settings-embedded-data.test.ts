import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('event settings embedded data', () => {
  it('hydrates config and sharing from the protected event detail response', () => {
    const settings = fs.readFileSync(
      path.join(process.cwd(), 'src/components/events/event-detail-settings-panel.tsx'),
      'utf8'
    )
    const config = fs.readFileSync(path.join(process.cwd(), 'src/components/events/event-config-panel.tsx'), 'utf8')
    const design = fs.readFileSync(path.join(process.cwd(), 'src/components/events/event-design-picker.tsx'), 'utf8')
    const share = fs.readFileSync(path.join(process.cwd(), 'src/components/events/event-share-panel.tsx'), 'utf8')

    expect(settings.match(/initialConfig=\{event\.event_config \?\? event\.config\}/g)).toHaveLength(2)
    expect(config).toContain('fallbackData: initialConfig ?? undefined')
    expect(design).toContain('fallbackData: initialConfig ?? undefined')
    expect(share).toContain('fallbackData: event.guest_share_summary')
    expect(share).toContain('revalidateOnMount: !event.guest_share_summary')
  })
})
