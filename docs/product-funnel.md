# Product funnel

EventiApp measures activation without sending guest or organizer PII to the analytics provider.

## Operator funnel

Custom dashboard events:

1. `event_created`
2. `design_saved`
3. `event_published`
4. `invitation_handoff`
5. `checkin_completed`

`event_unpublished` is a guardrail event, not an activation step. Event IDs, names, emails,
phones, addresses, URLs, access proofs and tokens are intentionally excluded. Client-side
tracking is best-effort and never blocks the product action.

Every provider event includes `schema_version=1` and `surface=dashboard`. Event properties are
runtime-allowlisted as well as typed:

- `event_created`: `has_capacity`, `has_organizer`
- `design_saved`: `template_kind`, `palette_override`, `font_override`
- `event_published` / `event_unpublished`: `trigger=active_toggle`
- `invitation_handoff`: `channel=resend|whatsapp`
- `checkin_completed`: `method=manual|qr`

Unknown properties and enum values are dropped. This is deliberate defense in depth: callers
cannot add an event ID, guest identifier or arbitrary text to the provider payload by mistake.

## Guest engagement

The backend remains the canonical source for event views, RSVP outcomes, moment uploads and
moment messages. These counters are tied to an event and exposed through the protected event
analytics endpoint. Upload success is recorded only after the backend confirms the final object.

## Core metrics

- Successful `event_created` to `event_published` action progression (provider-level leading signal).
- Share of successful creation actions followed by a design save and publish action.
- Invitation handoffs per published event.
- Public view to confirmed/declined RSVP conversion.
- Confirmed RSVP to check-in conversion.
- Public view to successful moment upload conversion.

Provider-level custom events and backend counters must be reconciled as aggregates; they are not
joined with personal identifiers. Provider action counts are not a unique-event ledger: repeated
design saves or publish toggles can legitimately emit more than once. Domain conversion reporting
must therefore use backend event/guest/moment records as its source of truth; the provider stream
is for path, channel and UX diagnosis.
