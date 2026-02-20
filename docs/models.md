# Domain Models (`src/models/`)

All entities extend `BaseEntity` (`id: number`, `created_at`, `updated_at`, `deleted_at?`).

## Core Entities & Key Fields

**User** — `cognito_sub` `email` `first_name` `last_name` `profile_image?` `is_root` `is_active` `clients?`

**Client** — `name` `code` `logo?` `website?` `address?` `phone?` `client_type_id` `client_type?` `parent_client_id?` (sub-clients)

**Event** — `name` `identifier` (URL slug) `event_date_time` (ISO) `timezone` `location_name?` `location_address?` `max_guests?` `is_active` `client_id` `event_type_id` `event_type?` `config?` `analytics?` `cover_image?`

**Guest** — `event_id` `first_name` `last_name` `email?` `phone?` `guests_count` (party size) `status_id` `status?` `table_number?` `dietary_restrictions?` `notes?`

**Invitation** — `event_id` `guest_id` `token` `sent_at?` `opened_at?` `responded_at?` → has `access_tokens[]` `logs[]` `guest?`

**Resource** — `path` `url` `file_name` `file_size` `mime_type` `resource_type_id` `resource_type?` — scoped to `event_id?` or `user_id?`

**Moment** — `event_id` `guest_id?` `moment_type_id` `moment_type?` `resource_id?` `resource?` `message?` `is_approved`

## Supporting Entities

**EventConfig** — `event_id` `is_public` `show_guest_list` `allow_registration` `password?` `design_template_id?` `color_palette_id?` `font_set_id?`

**EventAnalytics** — `event_id` `views` `unique_visitors` `rsvp_yes` `rsvp_no`

**EventSection** — `event_id` `name` `type` `order` `content_json?` (JSON string) `is_visible`

**EventMember** — `event_id` `user_id` `role` (`HOST` | `CO_HOST`)

## Design System Entities

**DesignTemplate** — `name` `identifier` `preview_image_url` `default_color_palette_id?` `default_font_set_id?`

**ColorPalette** → patterns: `ColorPalettePattern` (role: `PRIMARY|SECONDARY|BACKGROUND|TEXT|ACCENT`)

**FontSet** → patterns: `FontSetPattern` (role: `HEADING|BODY|ACCENT`)

**Font** — `name` `family` `url` | **Color** — `name` `hex_code`

## Type/Status Codes (entities, not TS enums)

| Entity | Codes |
|---|---|
| `ClientType` | `AGENCY` `PLATFORM` `CUSTOMER` |
| `ClientRole` | `OWNER` `ADMIN` `EDITOR` |
| `EventType` | `WEDDING` `CORPORATE` |
| `GuestStatus` | `PENDING` `CONFIRMED` `DECLINED` |
| `MomentType` | `PHOTO` `MESSAGE` |
| `ResourceType` | `IMAGE` `VIDEO` `DOCUMENT` |
| `EventSection.type` | `TEXT` `GALLERY` `MAP` `SCHEDULE` `RSVP` |

## Mock Data (`src/data.ts`)

Available for local dev/testing when backend is unavailable:
- `getOrders()` / `getOrder(id)` / `getRecentOrders()`
- `getEvents()` / `getEvent(id)` / `getEventOrders(eventId)`
- `getCountries()` — countries with regions (Canada, Mexico, USA)

## Helpers

```typescript
// src/utils/client-context.ts
isRootClient(client) // true when client_type.code === 'PLATFORM'

// src/utils/jwt.ts
decodeJWT(token)     // returns claims: sub, email, given_name, family_name — no sig verify
```

## Payload Pattern

Create/update payloads are plain objects, separate from response interfaces:
```typescript
interface CreateClientPayload {
  name: string
  client_type_id: number
  logo?: File        // only in FormData requests
}
// Keep payload types separate from entity types
```
