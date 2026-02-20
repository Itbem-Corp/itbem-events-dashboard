import { BaseEntity } from "./BaseEntity";

// Seeded in backend: "wedding", "graduation", "birthday"
// GET /api/event-types — endpoint pendiente de agregar al backend
export interface EventType extends BaseEntity {
  name: string;
}
