import { BaseEntity } from "./BaseEntity";

export interface User extends BaseEntity {
  cognito_sub: string;
  email: string;
  first_name: string;
  last_name: string;
  profile_image?: string; // URL o Path
  is_root?: boolean;
  is_active?: boolean;
  clients?: number; // count of associated client memberships (from /users/all)

  // UI Helpers (Opcionales)
  full_name?: string;
}
