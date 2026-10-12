import type { ClientRect, CollisionDetection, DroppableContainer, UniqueIdentifier } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'

import { seatingCollisionDetection } from './seating-collision'

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function container(id: UniqueIdentifier): DroppableContainer {
  return {
    id,
    key: String(id),
    data: { current: {} },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  } as unknown as DroppableContainer
}

function run(collisionRect: ClientRect, pointer: { x: number; y: number } | null) {
  const rects = new Map<UniqueIdentifier, ClientRect>([
    ['table-a', rect(642, 700, 280, 400)],
    ['table-b', rect(940, 700, 280, 400)],
    // A small droppable (a chip already seated in Mesa B) right next to Mesa A.
    ['guest-in-b', rect(950, 880, 250, 40)],
  ])
  const args: Parameters<CollisionDetection>[0] = {
    active: { id: 'dragged', data: { current: {} }, rect: { current: { initial: null, translated: null } } },
    collisionRect,
    droppableRects: rects,
    droppableContainers: [...rects.keys()].map(container),
    pointerCoordinates: pointer,
  }
  return seatingCollisionDetection(args).map((c) => c.id)
}

describe('seatingCollisionDetection (GST-61)', () => {
  it('drops on the table under the cursor even when the wide chip overlaps the neighbour more', () => {
    // 262 px chip whose rect reaches well into Mesa B while the cursor is inside Mesa A.
    const chip = rect(781, 879, 262, 40)
    expect(run(chip, { x: 801, y: 902 })[0]).toBe('table-a')
  })

  it('falls back to rectangle overlap when the pointer is over no droppable', () => {
    const chip = rect(600, 650, 100, 80)
    expect(run(chip, { x: 610, y: 660 })).toEqual(['table-a'])
  })

  it('returns no target for a drop over empty space', () => {
    const chip = rect(10, 10, 262, 40)
    expect(run(chip, { x: 20, y: 20 })).toEqual([])
  })
})
