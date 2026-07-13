import { BaseEntity } from "./BaseEntity";

export interface Invitation extends BaseEntity {
  event_id: string;
  type?: string;
  sub_type?: string;
  invitation_email_sent?: boolean;
  invitation_whatsapp_sent?: boolean;
  invitation_sent?: boolean;
  max_guests?: number;
  moment_email_requested?: boolean;
  moment_whatsapp_requested?: boolean;
  moment_request_sent?: boolean;
  moment_email_delivered?: boolean;
  moment_whatsapp_delivered?: boolean;
  moment_delivered?: boolean;
  enable_email?: boolean;
  enable_whatsapp?: boolean;
}

export type InvitationResponse = Invitation;
