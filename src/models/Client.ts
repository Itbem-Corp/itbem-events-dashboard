import { BaseEntity } from "./BaseEntity";
import { ClientType } from "./ClientType";

export interface Client extends BaseEntity {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  logo?: string;
  website?: string;
  is_active?: boolean;

  // Relations
  client_type_id: string;
  client_type?: ClientType;
}
