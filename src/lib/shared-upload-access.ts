export type SharedUploadStatus = 'inactive' | 'active' | 'closed-by-wall'

interface SharedUploadAccessInput {
  allowUploads?: boolean | null
  shareUploadsEnabled?: boolean | null
  momentsWallPublished?: boolean | null
}

export function isSharedUploadConfigured({
  allowUploads,
  shareUploadsEnabled,
}: SharedUploadAccessInput): boolean {
  return Boolean(allowUploads && shareUploadsEnabled)
}

export function getSharedUploadStatus(input: SharedUploadAccessInput): SharedUploadStatus {
  if (!isSharedUploadConfigured(input)) return 'inactive'
  return input.momentsWallPublished ? 'closed-by-wall' : 'active'
}
