import { BaseEntity } from "./BaseEntity";

export interface GuestStatus extends BaseEntity {
  name: string;
  code: string; // 'PENDING', 'CONFIRMED', 'DECLINED'
  color: string;
}
