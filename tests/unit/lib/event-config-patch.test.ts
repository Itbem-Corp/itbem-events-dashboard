import { normalizeEventConfigPatch } from '@/lib/event-config-patch'
import { describe, expect, it } from 'vitest'

describe('normalizeEventConfigPatch', () => {
  it('clears shared QR uploads when guest uploads are disabled', () => {
    expect(normalizeEventConfigPatch({ allow_uploads: false })).toEqual({
      allow_uploads: false,
      share_uploads_enabled: false,
    })
  })

  it('does not add shared upload fields for unrelated patches', () => {
    expect(normalizeEventConfigPatch({ max_uploads_per_guest: 25 })).toEqual({
      max_uploads_per_guest: 25,
    })
  })

  it('trims public access passwords before sending them to the backend', () => {
    expect(normalizeEventConfigPatch({ auth_password_preview: '  secreto  ' })).toEqual({
      auth_password_preview: 'secreto',
    })

    expect(normalizeEventConfigPatch({ authPasswordPreview: '  secreto  ' })).toEqual({
      auth_password_preview: 'secreto',
    })
  })

  it('expands shared QR enablement into a complete open-upload contract', () => {
    expect(
      normalizeEventConfigPatch({
        share_uploads_enabled: true,
      })
    ).toEqual({
      allow_uploads: true,
      show_moment_wall: false,
      share_uploads_enabled: true,
    })
  })

  it('clears shared QR uploads when publishing the moments wall', () => {
    expect(normalizeEventConfigPatch({ show_moment_wall: true })).toEqual({
      show_moment_wall: true,
      share_uploads_enabled: false,
    })
  })

  it('canonicalizes the public moments wall alias before saving', () => {
    expect(
      normalizeEventConfigPatch({
        moments_wall_published: true,
        share_uploads_enabled: true,
      })
    ).toEqual({
      show_moment_wall: true,
      share_uploads_enabled: false,
    })
  })

  it('canonicalizes legacy moment wall patch aliases before applying upload rules', () => {
    expect(
      normalizeEventConfigPatch({
        show_wall: true,
        share_uploads_enabled: true,
      })
    ).toEqual({
      show_moment_wall: true,
      share_uploads_enabled: false,
    })

    expect(
      normalizeEventConfigPatch({
        showWall: false,
        share_uploads_enabled: true,
      })
    ).toEqual({
      allow_uploads: true,
      show_moment_wall: false,
      share_uploads_enabled: true,
    })
  })

  it('lets the canonical moment wall field win over legacy patch aliases', () => {
    expect(
      normalizeEventConfigPatch({
        show_moment_wall: false,
        show_wall: true,
        share_uploads_enabled: true,
      })
    ).toEqual({
      allow_uploads: true,
      show_moment_wall: false,
      share_uploads_enabled: true,
    })
  })

  it('canonicalizes camelCase upload aliases before saving', () => {
    expect(
      normalizeEventConfigPatch({
        allowUploads: true,
        shareUploadsEnabled: true,
        showMomentWall: false,
      })
    ).toEqual({
      allow_uploads: true,
      share_uploads_enabled: true,
      show_moment_wall: false,
    })

    expect(
      normalizeEventConfigPatch({
        allowUploads: true,
        sharedUploadsEnabled: true,
        showMomentWall: false,
      })
    ).toEqual({
      allow_uploads: true,
      share_uploads_enabled: true,
      show_moment_wall: false,
    })

    expect(
      normalizeEventConfigPatch({
        shared_uploads_enabled: true,
      })
    ).toEqual({
      allow_uploads: true,
      show_moment_wall: false,
      share_uploads_enabled: true,
    })
  })

  it('canonicalizes backend-supported config aliases before saving', () => {
    expect(
      normalizeEventConfigPatch({
        isPublic: true,
        isAuthPreview: false,
        allowMessages: true,
        notifyOnMomentUpload: true,
        designTemplateID: 'template-1',
        colorPaletteId: 'palette-1',
        fontSetID: 'font-set-1',
        activeFrom: '2026-07-10T18:00:00Z',
        activeUntil: null,
        welcomeMessage: 'Hola',
        momentMessage: 'Comparte fotos',
        thankYouMessage: 'Gracias',
        guestSignatureTitle: 'Firma',
        showCountdown: false,
        showRsvpSection: true,
        showLocation: true,
        showSecondLocation: false,
        showHostsSection: true,
        showGallery: false,
        showContact: true,
        showHeader: true,
        showFooter: false,
        showSchedule: true,
        maxUploadsPerGuest: 42,
        autoApproveUploads: true,
      })
    ).toEqual({
      is_public: true,
      is_auth_preview: false,
      allow_messages: true,
      notify_on_moment_upload: true,
      design_template_id: 'template-1',
      color_palette_id: 'palette-1',
      font_set_id: 'font-set-1',
      active_from: '2026-07-10T18:00:00Z',
      active_until: null,
      default_welcome_message: 'Hola',
      default_moment_request_message: 'Comparte fotos',
      default_thank_you_message: 'Gracias',
      default_guest_signature_title: 'Firma',
      show_countdown: false,
      show_rsvp_section: true,
      show_event_location: true,
      show_second_location: false,
      show_hosts_section: true,
      show_photo_gallery: false,
      show_contact_section: true,
      show_header: true,
      show_footer: false,
      show_event_schedule: true,
      max_uploads_per_guest: 42,
      auto_approve_uploads: true,
    })
  })

  it('canonicalizes full camelCase message aliases before saving', () => {
    expect(
      normalizeEventConfigPatch({
        defaultWelcomeMessage: 'Hola',
        defaultMomentRequestMessage: 'Comparte fotos',
        defaultThankYouMessage: 'Gracias',
        defaultGuestSignatureTitle: 'Firma',
      })
    ).toEqual({
      default_welcome_message: 'Hola',
      default_moment_request_message: 'Comparte fotos',
      default_thank_you_message: 'Gracias',
      default_guest_signature_title: 'Firma',
    })
  })

  it('lets canonical config fields win over contradictory aliases', () => {
    expect(
      normalizeEventConfigPatch({
        active_from: '2026-07-10T18:00:00Z',
        activeFrom: '2026-08-01T18:00:00Z',
        default_welcome_message: 'Canonico',
        welcomeMessage: 'Alias',
        show_rsvp_section: false,
        showRsvpSection: true,
        max_uploads_per_guest: 25,
        maxUploadsPerGuest: 99,
      })
    ).toEqual({
      active_from: '2026-07-10T18:00:00Z',
      default_welcome_message: 'Canonico',
      show_rsvp_section: false,
      max_uploads_per_guest: 25,
    })
  })

  it('lets closing operations win over contradictory shared QR values', () => {
    expect(
      normalizeEventConfigPatch({
        allow_uploads: false,
        share_uploads_enabled: true,
      })
    ).toEqual({
      allow_uploads: false,
      share_uploads_enabled: false,
    })

    expect(
      normalizeEventConfigPatch({
        show_moment_wall: true,
        share_uploads_enabled: true,
      })
    ).toEqual({
      show_moment_wall: true,
      share_uploads_enabled: false,
    })
  })
})
