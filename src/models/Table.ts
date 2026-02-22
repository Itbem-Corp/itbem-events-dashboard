import { BaseEntity } from './BaseEntity'

export interface Table extends BaseEntity {
  event_id: string
  name: string
  capacity: number
  sort_order: number
}
