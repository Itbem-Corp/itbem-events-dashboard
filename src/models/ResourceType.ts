import { BaseEntity } from "./BaseEntity";

export interface ResourceType extends BaseEntity {
  name: string;
  code: string; // 'IMAGE', 'VIDEO', 'DOCUMENT'
  allowed_extensions: string;
}
