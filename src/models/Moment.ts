import { BaseEntity } from "./BaseEntity";

/**
 * processing_status lifecycle:
 *   ""           – legacy direct upload (pre-Lambda), shown immediately
 *   "pending"    – queued for Lambda (raw file in S3, NOT shown in dashboard yet)
 *   "processing" – Lambda is actively working (NOT shown in dashboard yet)
 *   "done"       – Lambda completed optimization (shown, ready to approve)
 *   "failed"     – Lambda failed (shown with error badge, raw file is ContentURL)
 *
 * The backend's GET /moments?event_id=X filters out "pending" and "processing"
 * so the dashboard only receives "", "done", and "failed" moments.
 */
export type ProcessingStatus = '' | 'pending' | 'processing' | 'done' | 'failed'

export interface Moment extends BaseEntity {
  event_id: string
  /** Null for shared QR uploads (no personal invitation token) */
  invitation_id?: string | null
  /** URL or S3 key of the media file (image or video). May be a raw key if status is "failed". */
  content_url: string
  /** WebP thumbnail extracted by Lambda for videos. Empty for images. */
  thumbnail_url?: string
  /** Guest message / note left with the upload */
  description?: string
  is_approved: boolean
  processing_status: ProcessingStatus
  order?: number
  /** Lambda processing metrics — populated when processing_status = 'done' */
  original_size_bytes?: number
  optimized_size_bytes?: number
  /** Original MIME type from upload (e.g. 'image/jpeg', 'video/mp4') */
  content_type?: string
}
