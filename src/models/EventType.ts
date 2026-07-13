import { BaseEntity } from "./BaseEntity";

// Seeded in backend: "wedding", "graduation", "birthday"
// Loaded from GET /api/event-types.
export interface EventType extends BaseEntity {
  name: string;
}
