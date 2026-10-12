import { pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core'

/**
 * Resolve a seating drop by what is under the cursor, not by the dragged chip's
 * rectangle. The default `rectIntersection` compares the whole (wide) chip with
 * every droppable, so a drop with the cursor inside one table could land on the
 * neighbouring table (GST-61). When the pointer is over no droppable (or there is
 * no pointer), fall back to rectangle overlap, which still returns nothing for a
 * drop over empty space instead of picking the nearest table.
 */
export const seatingCollisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args)
  if (underPointer.length > 0) return underPointer
  return rectIntersection(args)
}
