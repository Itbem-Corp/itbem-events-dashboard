import { BaseEntity } from "./BaseEntity";
import { ResourceType } from "./ResourceType";

export interface Resource extends BaseEntity {
  event_id?: string;
  user_id?: string; // Para Avatar
  
  path: string; // S3 Key
  url?: string; // Presigned URL (virtual)
  
  resource_type_id: string;
  resource_type?: ResourceType;
  
  file_name: string;
  file_size: number;
  mime_type: string;
}
