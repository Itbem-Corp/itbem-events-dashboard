export type AnchoredPanelPosition = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

const GUTTER = 16
const OFFSET = 8
const PREFERRED_MIN_HEIGHT = 280

/**
 * Places a fixed panel next to its trigger without leaving the viewport: it
 * opens toward the side with more room (the desktop bell sits in the sidebar
 * footer, the mobile one in the top bar) and keeps a 16px gutter at 375px.
 */
export function anchoredPanelPosition(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>,
  viewport: { width: number; height: number },
  preferredWidth = 320
): AnchoredPanelPosition {
  const width = Math.max(0, Math.min(preferredWidth, viewport.width - GUTTER * 2))
  const anchorCenter = (anchor.left + anchor.right) / 2
  const preferredLeft = anchorCenter > viewport.width / 2 ? anchor.right - width : anchor.left
  const left = Math.min(Math.max(preferredLeft, GUTTER), Math.max(GUTTER, viewport.width - width - GUTTER))

  const spaceBelow = viewport.height - anchor.bottom - OFFSET - GUTTER
  const spaceAbove = anchor.top - OFFSET - GUTTER
  if (spaceBelow >= PREFERRED_MIN_HEIGHT || spaceBelow >= spaceAbove) {
    return { left, width, top: anchor.bottom + OFFSET, maxHeight: Math.max(spaceBelow, 0) }
  }
  return { left, width, bottom: viewport.height - anchor.top + OFFSET, maxHeight: Math.max(spaceAbove, 0) }
}
