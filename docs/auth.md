# Authentication and authorization

The dashboards use a custom first-party login UI backed by Amazon Cognito.
Cognito owns passwords, recovery and MFA. The dashboard BFF submits credentials
to Cognito over TLS and stores tokens only in HttpOnly cookies.

## Product audiences

Each production origin requires its own public Cognito app client:

```dotenv
COGNITO_EVENTIAPP_CLIENT_ID=
COGNITO_ITBEM_CLIENT_ID=
COGNITO_CAFETTONHOUSE_CLIENT_ID=
COGNITO_AWS_REGION=us-east-1
```

Production fails closed if the dedicated client for the current hostname is
missing. `COGNITO_CLIENT_ID` remains a local-development compatibility fallback
only. No Cognito client secret is used by the browser login flow.

## Login flow

1. The hostname selects EventiApp, ITBEM or Cafetton House.
2. `POST /api/auth/sign-in` validates same-origin requests, rate limits the
   identity/IP pair and starts `USER_PASSWORD_AUTH`.
3. Cognito may return:
   - an authenticated token set;
   - `NEW_PASSWORD_REQUIRED`;
   - SMS, email or authenticator-app MFA/OTP.
4. Before setting the session cookie, the BFF calls the branded backend
   `/api/session`. A valid Cognito identity without an application entitlement
   is rejected.
5. The ID and refresh tokens are stored in Secure, HttpOnly cookies.

The password is never stored or logged by the application.

## Session renewal

`POST /api/auth/token` returns the current ID token only to the in-memory API
client and verifies the application session in the same response. When the ID
token is near expiry, it obtains a new token from Cognito and repeats the
application access check. The dashboard revalidates session capabilities and
organization access periodically and when the tab returns to focus. Revoked
product access therefore cannot survive indefinitely in a refresh token.

Authenticated API requests include:

```http
Authorization: Bearer <cognito-id-token>
```

The backend verifies signature, issuer, audience and the audience-to-product
mapping before resolving database authorization.

## Authorization layers

Authorization is capability-based, not `is_root`-based:

1. application entitlement;
2. organization membership and role;
3. optional event assignment.

The session returns effective capabilities such as `events:view`,
`events:manage`, `members:manage`, `platform:users:view` and
`platform:users:root-manage`. Navigation and route guards consume them, while
the API independently enforces the same product and resource boundaries.

Root level 1 owns governance. Root level 2 is operational/read-support and
cannot change organization structure, teams, event structure or root levels.
Customer portals never inherit platform-root authority.

## Event access and the caller-access workspace

`GET /api/session` may include event-level grants:

```json
"event_access": { "assigned_events": 2, "capabilities": ["events:view", "events:manage", "guests:manage", "checkin:run", "analytics:view"] }
```

It is present only when the backend has event-client access on, the product has
the events module (EventiApp), the user is not a root and holds an active grant.
`organizations` may then be `[]`; the top-level `capabilities` already include
`event_access.capabilities`. When the field is absent or `null` the dashboard
behaves exactly as before (`src/models/ApplicationSession.ts`).

`createAccessProfile` (`src/lib/access-profile.ts`), read through
`useAccessProfile()`, applies the product shell policy and derives:

- `isOrganizationAdmin`: any session organization role is `OWNER` or `ADMIN`
  (case-insensitive, `INHERITED_` allowed).
- `isEventClientOnly`: no root, no organizations and `assigned_events > 0`.
- `isPortfolioForced`: the shell uses `memberWorkspace: 'caller-access'`
  (EventiApp) and the user is neither a root nor an Owner/Admin.
- `isPortfolioContext`: forced, or chosen by an Owner/Admin who also holds
  grants ("Eventos asignados" in the switcher).

In the caller-access workspace requests carry `X-Application-Code` and
`X-Workspace-Mode: organization` without `X-Organization-ID` or
`X-Organization-Context`; the backend scopes reads to every membership and grant
of the caller and authorizes each write per resource. Event lists are requested
without `client_id` (`accessProfile.listsAcrossOrganizations`). Controls use the
top-level capability union; the API remains the authority.

The pinned `itbem-product-contract` must declare this scope
(`rules.organizationRequiresOrganizationId: false`,
`rules.organizationWithoutIdScope: 'caller-access'`). `npm run contract:check`
(`scripts/verify-product-contract.mjs`) fails until it does, so CI blocks a
merge before the contract change is merged and re-pinned.

### Release prerequisite: list scope of the caller-access workspace

The caller-access list is only as narrow as the backend's user-scoped list
query. In the backend, `dashboardEventsScope` (`repositories/eventsrepository/EventsRepository.go`)
answers `GET /api/events`, `/api/events/dashboard` and
`/api/events/notifications` without `client_id` with the events of every
organization where the caller has an active `client_members` row. That query
does not check `clients.is_active` or `clients.deleted_at`, the member's
EventiApp application access (`client_member_applications`), or the
organization's product. `GET /api/session` does check them
(`SessionService.organizationAccess`).

Before this workspace, a member's default list was the selected session
organization (`?client_id=`), which is always eligible. In the caller-access
workspace the default list (and command-palette search and notifications) can
also show events of organizations the session excludes. The dashboard cannot
narrow this: one request cannot name several organizations, and a client-side
filter would hide rows without denying them. A backend change must ship before
the dashboard release: the user-scoped list query must keep only active,
non-deleted organizations where the member has active EventiApp access, plus
event grants. Otherwise the remaining exposure must be measured with the R4/Q6
production queries and accepted as a security finding before the release.

## Organization context credential lifecycle

- Issued (`POST /session/organization-context`) when an organization workspace
  is selected or restored without a valid credential, and renewed 45 seconds
  before its five-minute expiry.
- Kept when the session revalidates: the renewal hook and the workspace
  activation depend on whether a session exists, not on the session object, and
  re-activating the same tenant and organization keeps the credential. An idle
  tab therefore sends at most one renewal per ~4m15s. This applies to every
  product.
- Dropped on a tenant change, a platform workspace, a different organization,
  the caller-access workspace and logout. The caller-access workspace never
  issues one.

## Cookies

| Cookie | Purpose | Typical TTL |
| --- | --- | --- |
| `session` | Cognito ID token | 1 hour |
| `refresh_token` | Session renewal | 5 days (Cognito client lifetime) |
| `auth_challenge_*` | Temporary password or MFA transaction | 10 minutes |

All authentication responses are private/no-store. Refresh and challenge
cookies use SameSite Strict. Logout uses a same-origin POST, revokes the
Cognito refresh token, clears every authentication cookie and synchronizes the
sign-out across open dashboard tabs.

## Local domains

Use the same server with product-specific hostnames:

- `dashboard.eventiapp.localhost:3000`
- `dashboard.itbem.localhost:3000`
- `dashboard.cafettonhouse.localhost:3000`

The backend remains `http://localhost:8080`; the hostname still selects the
product configuration and entitlement boundary.
