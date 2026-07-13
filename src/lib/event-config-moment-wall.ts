import type { EventConfig } from '@/models/EventConfig'

import { getSharedUploadStatus, type SharedUploadStatus } from './shared-upload-access'

export type MomentWallConfigInput = Partial<
  Pick<
    EventConfig,
    | 'allow_uploads'
    | 'share_uploads_enabled'
    | 'show_moment_wall'
    | 'moments_wall_published'
    | 'momentsWallPublished'
    | 'show_wall'
  >
> & {
  allowUploads?: boolean | null
  shareUploadsEnabled?: boolean | null
  sharedUploadsEnabled?: boolean | null
  showMomentWall?: boolean | null
}

export interface EventConfigMomentWallState {
  wallPublished: boolean
  uploadsEnabled: boolean
  personalUploadsOpen: boolean
  sharedUploadsConfigured: boolean
  sharedUploadsOpen: boolean
  sharedUploadStatus: SharedUploadStatus
}

export function resolveEventConfigMomentWallPublished(config: MomentWallConfigInput | undefined): boolean {
  return (
    config?.show_moment_wall ??
    config?.showMomentWall ??
    config?.moments_wall_published ??
    config?.momentsWallPublished ??
    config?.show_wall ??
    !(config?.allow_uploads ?? config?.allowUploads ?? false)
  )
}

export function getEventConfigMomentWallState(config: MomentWallConfigInput | undefined): EventConfigMomentWallState {
  const wallPublished = resolveEventConfigMomentWallPublished(config)
  const uploadsEnabled = config?.allow_uploads ?? config?.allowUploads ?? false
  const sharedUploadsConfigured = Boolean(
    uploadsEnabled && (config?.share_uploads_enabled ?? config?.shareUploadsEnabled ?? config?.sharedUploadsEnabled)
  )
  const sharedUploadStatus = getSharedUploadStatus({
    allowUploads: uploadsEnabled,
    shareUploadsEnabled: sharedUploadsConfigured,
    momentsWallPublished: wallPublished,
  })

  return {
    wallPublished,
    uploadsEnabled,
    personalUploadsOpen: uploadsEnabled && !wallPublished,
    sharedUploadsConfigured,
    sharedUploadsOpen: sharedUploadStatus === 'active',
    sharedUploadStatus,
  }
}
