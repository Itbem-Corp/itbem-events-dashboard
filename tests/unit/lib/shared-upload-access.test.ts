import { getSharedUploadStatus, isSharedUploadConfigured } from '@/lib/shared-upload-access'
import { describe, expect, it } from 'vitest'

describe('isSharedUploadConfigured', () => {
  it('requires the upload gate and the shared QR flag', () => {
    expect(isSharedUploadConfigured({ allowUploads: true, shareUploadsEnabled: true })).toBe(true)
    expect(isSharedUploadConfigured({ allowUploads: false, shareUploadsEnabled: true })).toBe(false)
    expect(isSharedUploadConfigured({ allowUploads: true, shareUploadsEnabled: false })).toBe(false)
  })
})

describe('getSharedUploadStatus', () => {
  it('keeps configured QR uploads active before the wall is published', () => {
    expect(
      getSharedUploadStatus({
        allowUploads: true,
        shareUploadsEnabled: true,
        momentsWallPublished: false,
      }),
    ).toBe('active')
  })

  it('reports configured QR uploads as closed while the wall is published', () => {
    expect(
      getSharedUploadStatus({
        allowUploads: true,
        shareUploadsEnabled: true,
        momentsWallPublished: true,
      }),
    ).toBe('closed-by-wall')
  })

  it('reports inactive when either backend gate is closed', () => {
    expect(
      getSharedUploadStatus({
        allowUploads: false,
        shareUploadsEnabled: true,
        momentsWallPublished: false,
      }),
    ).toBe('inactive')
  })
})
