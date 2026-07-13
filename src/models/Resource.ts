import { ResourceType } from "./ResourceType";

export interface Resource {
  id: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  event_section_id?: string;
  event_id?: string;
  user_id?: string; // Para Avatar

  path?: string; // S3 key, only returned by internal/admin-only endpoints.
  url?: string; // Alias firmado de view_url
  view_url?: string;
  view_url_expires_at?: string;
  alt_text?: string;
  title?: string;
  position?: number;

  resource_type_id?: string;
  resource_type?: ResourceType;

  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface ResourceFileMutationResponse {
  path: string;
  url?: string;
  view_url: string;
  view_url_expires_at?: string;
}
