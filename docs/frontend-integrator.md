# Frontend Integrator

This document is the cross-repo contract between the Go backend, the authenticated dashboard, and the public Astro frontend.

## Project Registry

| Project | Role | Local Path |
|---|---|---|
| `itbem-events-backend` | Shared Go API | `C:\Users\AndBe\Desktop\Projects\EventiApp\itbem-events-backend` |
| `dashboard-ts` | Admin dashboard, authenticated | `C:\Users\AndBe\Desktop\Projects\EventiApp\dashboard-ts` |
| `cafetton-casero` | Public event pages, unauthenticated | `C:\Users\AndBe\Desktop\Projects\EventiApp\cafetton-casero` |

Check remotes when paths or repo ownership are in doubt:

```bash
git -C "C:\Users\AndBe\Desktop\Projects\EventiApp\itbem-events-backend" remote -v
git -C "C:\Users\AndBe\Desktop\Projects\EventiApp\dashboard-ts" remote -v
git -C "C:\Users\AndBe\Desktop\Projects\EventiApp\cafetton-casero" remote -v
```

## Runtime Roles

| Concern | Dashboard | Cafetton |
|---|---|---|
| Audience | Authenticated admins and client users | Anonymous guests |
| Auth | Cognito JWT via `Authorization: Bearer <token>` | No auth header on public API calls |
| API base env | `NEXT_PUBLIC_BACKEND_URL` | `PUBLIC_EVENTS_URL` |
| Public frontend env | `NEXT_PUBLIC_ASTRO_URL` | `PUBLIC_DASHBOARD_URL` for `/api/og` |
| URL normalization | `src/lib/base-url.ts` strips trailing slash and final `/api` | `src/lib/eventsUrl.ts` strips trailing slash and final `/api` |
| Backend path helpers | `src/lib/api-paths.ts` | `src/lib/apiUrls.ts` and `src/lib/pageSpecUrl.ts` |

## Shared Backend Contract

Backend responses can arrive as direct payloads or as envelopes:

```ts
{ status: number, message: string, data: T }
```

Dashboard unwraps and normalizes Go/Pascal keys in `src/lib/api.ts`. Cafetton unwraps public responses with `readApiData()` and its fetch helpers. New integration code should use those helpers instead of `response.data.data` or ad hoc path strings.

## Shared Public Routes

| Endpoint | Dashboard use | Cafetton use |
|---|---|---|
| `GET /api/events/:identifier/page-spec` | Studio preview links | PageSpec render source |
| `GET /api/events/:identifier/meta` | Preview/OG checks | SSR OG metadata |
| `GET /api/events/page-spec?token=...` | Invitation preview checks | Legacy token PageSpec |
| `GET /api/events/:identifier/moments` | Moments moderation | Public moments gallery/TV |
| `GET /api/events/section/:id/attendees` | Attendee section admin | Public attendee sections |
| `GET /api/admin/resources/section/:id` | Section resource admin/preview | Not used |
| `GET /api/resources/section/:id` | Not used | Public section resources |
| `GET /api/resources/:id` | Resource preview/detail | Single public resource |
| `GET /api/invitations/ByToken?token=...` | Invitation tracking context | RSVP and private access context |
| `POST /api/invitations/rsvp` | RSVP tracking result | RSVP submission |

Protected dashboard routes remain dashboard-only. Cafetton must not send fake auth headers to public routes.

## Access Rules

Preview access is authorized by the backend. The dashboard may add `preview=1`, `t`, and `preview_token` to public URLs, but Cafetton only bypasses gates and tracking when PageSpec returns `access.previewAuthorized=true`. The backend also accepts `previewToken` and `PreviewToken` for integrations, while generated dashboard links should keep using canonical `preview_token`.

Invitation access travels canonically as `token`. The backend, dashboard QR/check-in flow, and Cafetton public loaders also accept `Token`, `invitation_token`, `invitationToken`, `InvitationToken`, `pretty_token`, `prettyToken`, and `PrettyToken`; generated links should keep using canonical `token`. Cafetton forwards invitation context only to public endpoints that accept it.

Password-protected public pages use a two-step backend contract. The first PageSpec response is locked when `access.passwordProtected=true` and no valid proof is present: it carries only gate-safe metadata and no sections/media URLs. Cafetton posts to `POST /api/events/:identifier/verify-access`; on success, the backend returns `accessToken`, `expiresAt`, and `accessVersion`, and Cafetton refetches PageSpec with `X-Event-Access-Token`. A full PageSpec should then include `access.passwordVerified=true`. Cafetton must reuse the same proof header for every public surface that fetches protected event data directly: `/e/:identifier/momentos`, `/e/:identifier/tv`, `/events/:identifier/upload`, the embedded `MomentWall`, `GET /api/resources/section/:id`, `GET /api/resources/:id`, `GET /api/events/section/:id/attendees`, public moments/upload endpoints, and protected-event `GET /api/events/:identifier/meta` requests. Shared links may carry the same proof as `event_access_token`, `eventAccessToken`, or `EventAccessToken`; Cafetton converts those query aliases into `X-Event-Access-Token` before calling the backend. Anonymous public-event `/meta` requests remain safe OG/SSR metadata and are cacheable by default; scoped `/meta` requests with preview, invitation, or password proof are `no-store`. Dashboard Studio preview still uses `preview_token` and bypasses this only when the backend marks `previewAuthorized=true`.

## Env Examples

Dashboard:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
NEXT_PUBLIC_ASTRO_URL=http://localhost:4321
```

Cafetton:

```env
PUBLIC_EVENTS_URL=http://localhost:8080
PUBLIC_DASHBOARD_URL=http://localhost:3000
PORT=4321
```

Backend local CORS:

```env
CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:4321
EVENT_PREVIEW_SECRET=dev-preview-secret
EVENT_ACCESS_SECRET=dev-access-secret
```

`CORS_ALLOW_ORIGINS` accepts comma-separated origins. If a value accidentally includes a path or `/api`, the backend normalizes it to scheme, host, and port.

## Validation Checklist

- Backend route exists in `routes/routes_test.go`.
- Dashboard uses `src/lib/api-paths.ts` for protected/admin paths.
- Cafetton uses `src/lib/apiUrls.ts` or `src/lib/pageSpecUrl.ts` for public paths.
- Tests cover URL normalization with and without final `/api`.
- Public calls do not include `Authorization`.
- Docs are updated in the repo whose contract changed.
