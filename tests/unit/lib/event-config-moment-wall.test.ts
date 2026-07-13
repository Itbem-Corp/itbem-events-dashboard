import { getEventConfigMomentWallState, resolveEventConfigMomentWallPublished } from '@/lib/event-config-moment-wall'
import { describe, expect, it } from 'vitest'

describe('getEventConfigMomentWallState', () => {
  it('treats a published wall as closed for personal and shared uploads', () => {
    expect(
      getEventConfigMomentWallState({
        allow_uploads: true,
        share_uploads_enabled: true,
        show_moment_wall: true,
      })
    ).toMatchObject({
      wallPublished: true,
      uploadsEnabled: true,
      personalUploadsOpen: false,
      sharedUploadsConfigured: true,
      sharedUploadsOpen: false,
      sharedUploadStatus: 'closed-by-wall',
    })
  })

  it('keeps personal and shared uploads open before publishing', () => {
    expect(
      getEventConfigMomentWallState({
        allow_uploads: true,
        share_uploads_enabled: true,
        show_moment_wall: false,
      })
    ).toMatchObject({
      wallPublished: false,
      uploadsEnabled: true,
      personalUploadsOpen: true,
      sharedUploadsConfigured: true,
      sharedUploadsOpen: true,
      sharedUploadStatus: 'active',
    })
  })

  it('defaults completely missing wall visibility to published', () => {
    expect(getEventConfigMomentWallState({})).toMatchObject({
      wallPublished: true,
      personalUploadsOpen: false,
      sharedUploadStatus: 'inactive',
    })
  })

  it('mirrors backend defaults for legacy upload windows without wall visibility', () => {
    expect(getEventConfigMomentWallState({ allow_uploads: true })).toMatchObject({
      wallPublished: false,
      personalUploadsOpen: true,
      sharedUploadStatus: 'inactive',
    })
  })

  it('reads public wall aliases but lets the dashboard field win', () => {
    expect(
      getEventConfigMomentWallState({
        allow_uploads: true,
        share_uploads_enabled: true,
        moments_wall_published: false,
      })
    ).toMatchObject({
      wallPublished: false,
      personalUploadsOpen: true,
      sharedUploadsOpen: true,
    })

    expect(
      getEventConfigMomentWallState({
        allow_uploads: true,
        share_uploads_enabled: true,
        show_moment_wall: false,
        moments_wall_published: true,
      })
    ).toMatchObject({
      wallPublished: false,
      personalUploadsOpen: true,
      sharedUploadsOpen: true,
    })
  })

  it('exposes the same published-wall resolution for dashboard controls', () => {
    expect(resolveEventConfigMomentWallPublished({ moments_wall_published: false })).toBe(false)
    expect(resolveEventConfigMomentWallPublished({ momentsWallPublished: true })).toBe(true)
    expect(
      resolveEventConfigMomentWallPublished({
        show_moment_wall: false,
        moments_wall_published: true,
      })
    ).toBe(false)
  })

  it('accepts camelCase upload aliases from public adapters', () => {
    expect(
      getEventConfigMomentWallState({
        allowUploads: true,
        shareUploadsEnabled: true,
        showMomentWall: false,
      })
    ).toMatchObject({
      wallPublished: false,
      uploadsEnabled: true,
      personalUploadsOpen: true,
      sharedUploadsConfigured: true,
      sharedUploadsOpen: true,
      sharedUploadStatus: 'active',
    })

    expect(
      getEventConfigMomentWallState({
        allowUploads: true,
        sharedUploadsEnabled: true,
        showMomentWall: false,
      })
    ).toMatchObject({
      wallPublished: false,
      uploadsEnabled: true,
      personalUploadsOpen: true,
      sharedUploadsConfigured: true,
      sharedUploadsOpen: true,
      sharedUploadStatus: 'active',
    })
  })
})
