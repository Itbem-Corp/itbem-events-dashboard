import { BaseEntity } from "./BaseEntity";

export interface InvitationAccessToken extends BaseEntity {
  invitation_id: string;
  token: string;
  expires_at: string;
  is_used: boolean;
}
