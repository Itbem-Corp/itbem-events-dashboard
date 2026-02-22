import { BaseEntity } from "./BaseEntity";
import { FontSetPattern } from "./FontSetPattern";

export interface FontSet extends BaseEntity {
  name: string;
  patterns?: FontSetPattern[];
}
