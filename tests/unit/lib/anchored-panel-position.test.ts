// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { anchoredPanelPosition } from '@/lib/anchored-panel-position'

describe('anchoredPanelPosition', () => {
  it('opens above a bell in the desktop sidebar footer and stays on screen', () => {
    const position = anchoredPanelPosition({ top: 820, bottom: 852, left: 60, right: 92 }, { width: 1440, height: 900 })
    expect(position.bottom).toBe(900 - 820 + 8)
    expect(position.top).toBeUndefined()
    expect(position.left).toBe(60)
    expect(position.width).toBe(320)
    expect(position.maxHeight).toBe(820 - 8 - 16)
  })

  it('opens below a bell in the mobile top bar without overflowing 375px', () => {
    const position = anchoredPanelPosition({ top: 12, bottom: 48, left: 290, right: 326 }, { width: 375, height: 812 })
    expect(position.top).toBe(56)
    expect(position.width).toBe(320)
    expect(position.left).toBeGreaterThanOrEqual(16)
    expect(position.left + position.width).toBeLessThanOrEqual(375 - 16)
  })

  it('shrinks to the viewport on very narrow screens', () => {
    const position = anchoredPanelPosition({ top: 10, bottom: 40, left: 250, right: 280 }, { width: 300, height: 600 })
    expect(position.width).toBe(268)
    expect(position.left).toBe(16)
  })
})
