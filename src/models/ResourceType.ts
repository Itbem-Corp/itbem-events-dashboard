import { BaseEntity } from "./BaseEntity";

export interface ResourceType extends BaseEntity {
  code: 'image' | 'video' | 'audio' | 'file' | 'font' | string;
  label: string;
}

export type ResourceTypeResponse = ResourceType;
