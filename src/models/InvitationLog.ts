import { BaseEntity } from "./BaseEntity";

export interface InvitationLog extends BaseEntity {
  invitation_id: string;
  action: string; // 'SENT', 'OPENED', 'CLICKED'
  details?: string;
}
