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

`GET /api/auth/token` returns the current ID token to the in-memory API client.
When refreshing, it obtains a new Cognito ID token and repeats the application
access check. Revoked product access therefore cannot survive indefinitely in a
refresh token.

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

## Cookies

| Cookie | Purpose | Typical TTL |
| --- | --- | --- |
| `session` | Cognito ID token | 1 hour |
| `refresh_token` | Session renewal | configured Cognito client lifetime |
| `auth_challenge_*` | Temporary password or MFA transaction | 10 minutes |

All authentication responses are private/no-store. Challenge cookies use
SameSite Strict. Logout revokes the Cognito refresh token and clears every
authentication cookie.

## Local domains

Use the same server with product-specific hostnames:

- `dashboard.eventiapp.localhost:3000`
- `dashboard.itbem.localhost:3000`
- `dashboard.cafettonhouse.localhost:3000`

The backend remains `http://localhost:8080`; the hostname still selects the
product configuration and entitlement boundary.
