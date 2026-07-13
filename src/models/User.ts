import { BaseEntity } from "./BaseEntity";

import type { Client } from "./Client";

export interface User extends BaseEntity {
  email: string;
  first_name: string;
  last_name: string;
  profile_image?: string; // URL o Path
  is_root?: boolean;
	root_level?: number;
  is_active?: boolean;
  clients?: number; // count of associated client memberships (from /users/all)

  // UI Helpers (Opcionales)
  full_name?: string;
}

export interface UserProfileResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  profile_image: string;
  is_active: boolean;
  is_root: boolean;
	root_level?: number;
}

export interface AvatarResponse {
  path: string;
  url: string;
}

export interface AdminUserResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_root: boolean;
	root_level?: number;
  created_at: string;
}

export interface AdminUserListItemResponse extends AdminUserResponse {
  clients: number;
  profile_image?: string;
}

export interface AdminUsersPageResponse {
  data: AdminUserListItemResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminUserDetailResponse extends AdminUserResponse {
  clients: Client[];
}

export interface UserClientsPageResponse {
  user: AdminUserResponse;
  data: Client[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  active: number;
  inactive: number;
}
