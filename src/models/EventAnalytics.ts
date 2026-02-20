import { BaseEntity } from "./BaseEntity";

export interface EventAnalytics extends BaseEntity {
  event_id: string;
  views: number;
  unique_visitors: number;
  rsvp_yes: number;
  rsvp_no: number;
}
