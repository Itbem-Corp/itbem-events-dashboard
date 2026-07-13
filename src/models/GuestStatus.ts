import { BaseEntity } from "./BaseEntity";

export interface GuestStatus extends BaseEntity {
  name?: string;
  label?: string;
  code: string; // 'PENDING', 'CONFIRMED', 'DECLINED'
  color: string;
  order?: number;
}
