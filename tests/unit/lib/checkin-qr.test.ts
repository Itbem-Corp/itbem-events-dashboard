// @vitest-environment node

import { parseCheckinQrPayload } from '@/lib/checkin-qr'
import { describe, expect, it } from 'vitest'

describe('parseCheckinQrPayload', () => {
  it('extracts and decodes token from public RSVP URLs', () => {
    expect(parseCheckinQrPayload(' https://www.eventiapp.com.mx/rsvp/mi-evento?token=token%2F123%20%2B%23 ')).toEqual({
      raw: 'https://www.eventiapp.com.mx/rsvp/mi-evento?token=token%2F123%20%2B%23',
      token: 'token/123 +#',
      guestId: 'token/123 +#',
    })
  })

  it('keeps legacy /evento token URLs compatible', () => {
    expect(parseCheckinQrPayload('https://www.eventiapp.com.mx/evento?token=ABC123')).toMatchObject({
      token: 'ABC123',
      guestId: 'ABC123',
    })
  })

  it('accepts pretty token aliases used by RSVP integrations', () => {
    expect(parseCheckinQrPayload('https://www.eventiapp.com.mx/rsvp/mi-evento?pretty_token=ABC%2F123')).toMatchObject({
      token: 'ABC/123',
      guestId: 'ABC/123',
    })

    expect(parseCheckinQrPayload('/rsvp/mi-evento?prettyToken=PRETTY-123')).toMatchObject({
      token: 'PRETTY-123',
      guestId: 'PRETTY-123',
    })

    expect(parseCheckinQrPayload('/rsvp/mi-evento?PrettyToken=PASCAL%2F123')).toMatchObject({
      token: 'PASCAL/123',
      guestId: 'PASCAL/123',
    })
  })

  it('accepts invitation token aliases and backend ByToken path URLs', () => {
    expect(parseCheckinQrPayload('/rsvp/mi-evento?invitation_token=INV%2F123')).toMatchObject({
      token: 'INV/123',
      guestId: 'INV/123',
    })

    expect(parseCheckinQrPayload('/rsvp/mi-evento?InvitationToken=INV-PASCAL')).toMatchObject({
      token: 'INV-PASCAL',
      guestId: 'INV-PASCAL',
    })

    expect(parseCheckinQrPayload('/rsvp/mi-evento?Token=RAW-PASCAL')).toMatchObject({
      token: 'RAW-PASCAL',
      guestId: 'RAW-PASCAL',
    })

    expect(parseCheckinQrPayload('/api/invitations/ByToken/PATH%2F123%20%2B%23')).toMatchObject({
      token: 'PATH/123 +#',
      guestId: 'PATH/123 +#',
    })
  })

  it('keeps legacy invitation payloads compatible', () => {
    expect(parseCheckinQrPayload(' invitation_guest-99 ')).toEqual({
      raw: 'invitation_guest-99',
      token: 'invitation_guest-99', // gitleaks:allow -- legacy opaque QR fixture
      guestId: 'guest-99',
    })
  })

  it('extracts token and guest id from JSON scanner payloads', () => {
    expect(parseCheckinQrPayload('{"pretty_token":"ABC/123","guest_id":"guest-json"}')).toEqual({
      raw: '{"pretty_token":"ABC/123","guest_id":"guest-json"}',
      token: 'ABC/123',
      guestId: 'guest-json',
    })

    expect(parseCheckinQrPayload('{"invitation_token":"INV/123","guest_id":"guest-invite"}')).toEqual({
      raw: '{"invitation_token":"INV/123","guest_id":"guest-invite"}',
      token: 'INV/123',
      guestId: 'guest-invite',
    })

    expect(parseCheckinQrPayload('{"token":"RAW/123"}')).toMatchObject({
      token: 'RAW/123',
      guestId: 'RAW/123',
    })

    expect(
      parseCheckinQrPayload('{"data":{"invitation":{"prettyToken":"NESTED/123"},"guest":{"ID":"guest-nested"}}}')
    ).toMatchObject({
      token: 'NESTED/123',
      guestId: 'guest-nested',
    })
  })

  it('keeps malformed JSON payloads as raw token fallbacks', () => {
    expect(parseCheckinQrPayload('{"pretty_token":')).toEqual({
      raw: '{"pretty_token":',
      token: '{"pretty_token":',
      guestId: '{"pretty_token":',
    })
  })
})
