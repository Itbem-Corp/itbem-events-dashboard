import { BaseEntity } from "./BaseEntity";

export interface MomentType extends BaseEntity {
  name: string;
  code: string; // 'PHOTO', 'MESSAGE'
}
