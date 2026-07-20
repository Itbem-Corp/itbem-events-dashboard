# Multi-tenant product boundaries

The dashboard is one deployable Next.js application with isolated product definitions. Shared runtime code must not branch on `eventiapp`, `itbem`, or `cafettonhouse` directly.

## Ownership

| Layer | Owns | Must not own |
| --- | --- | --- |
| `src/products/core` | Product types, feature/path rules | Brand copy, domains, Cognito IDs |
| `src/products/<product>/manifest.ts` | Identity, deployment, modules, feature ceiling, login copy | React components, access decisions |
| `src/products/registry.ts` | Registration of first-party products | Product-specific behavior |
| `src/lib/tenant-config.ts` | Host resolution and runtime credentials | Duplicated product identity or module lists |
| `src/lib/application-navigation.ts` | Shared visibility rules and bounded route-preload requests | JSX, icons, tenant-specific branches |
| Backend `applications` | Authoritative runtime entitlements and capabilities | Frontend presentation |
| Shared UI/routes | Rendering from manifest + session capabilities | `if (tenant === ...)` branches |

The frontend manifest is a product ceiling: a backend capability cannot expose a route the product does not declare. The backend session remains authoritative for the current user's access inside that ceiling.

## First render and loading

The protected server layout resolves the hostname before rendering and passes the tenant and product manifest into the client shell. Do not resolve the tenant in `useEffect`; that creates a second render and can briefly show the EventiApp brand on another origin.

Route and data preloads belong to shared shell helpers and should run only on user intent (`pointerenter`, `pointerdown`, or focus). Heavy panels, search, notifications, Studio, charts, and modals should remain dynamically imported until requested. Personalized API responses must stay outside the service-worker cache.

`createApplicationNavigation` combines the product ceiling with the active backend access profile. `applicationRoutePreloadPath` owns the first bounded request for each primary route. Keep both functions pure so a new product can validate its complete navigation contract without mounting the React shell.

`ApplicationPrimaryNavigation` renders the shared route contract. `ApplicationWorkspaceHeader` renders tenant and organization identity. Both receive stable callbacks and are memoized so search, notification, and modal state in the shell cannot trigger unnecessary navigation/header work.

The command palette has one imperative controller per shell. Search buttons only send stable open/preload intents; shortcut detection and palette state stay inside the controller. Notification buttons own their lazy-load state locally. Do not lift either state back into `ApplicationLayout`.

Navbar account controls and the sidebar footer are also shared memoized components. Tenant-specific products reuse the same session actions and profile preloading behavior without duplicating account UI in each product package.

## Product module boundaries

Each product owns a data-only route contract next to its manifest (`products/<code>/routes.ts`). The contract declares the feature and preload policy for every exposed route. Shared core types never import a concrete product, and concrete products cannot import one another; unit tests enforce both directions.

Product-specific workflows belong below their product directory. Shared authentication, request context, access profiles, primitives, and transport contracts belong in core or `lib`. Avoid tenant-code conditionals in route components: add a manifest feature or route contract instead.

## Request and cache isolation

Authenticated API requests send `X-Application-Code`, `X-Workspace-Mode`, and, in organization mode, `X-Organization-ID`. The backend must resolve the authenticated application independently and reject any header that conflicts with token/session scope; these headers are context, never authorization.

Manual organization switches first exchange the current Cognito application session at `POST /session/organization-context`. The returned five-minute credential stays in memory only and is sent as `X-Organization-Context` while its application and organization still match. A failed exchange leaves the previous workspace active; platform switches, tenant activation, logout, and organization changes clear the credential.

The application shell also obtains a credential after restoring an organization workspace and renews it 45 seconds before expiration. Exchanges for the same organization are single-flight, transient failures retry after 30 seconds, effect cleanup cancels timers, and the store discards late responses whose organization is no longer selected.

During cold startup, the browser hostname is authoritative for `X-Application-Code` until the application session and persisted workspace are hydrated. Before that session resolves, the frontend sends no workspace or organization header. This avoids both an EventiApp fallback from an ITBEM/Cafetton origin and a stale platform mode from another product. Platform requests never include a retained organization header.

SWR keys for tenant-sensitive screens include the same tenant, workspace, and organization tuple. This prevents cached organization or product data from being reused after a context switch even when the API path text is identical.

Use `useScopedFetcherKey` for a screen request and `useScopedFetcherScope` for its intent or pagination preloads. The rendered request and every preload must use the same tuple; a plain URL preload creates a separate global cache entry and defeats both reuse and tenant isolation.

This rule also applies to deferred UI such as global search, notifications, modal catalogs, and optimistic snapshots. Snapshot indexes must include the scoped request key rather than only a record ID because independent products may legitimately use the same identifier.

Cache-filter predicates used by global `mutate` calls must resolve both legacy string keys and scoped tuple keys. Otherwise a successful mutation can leave list, detail, check-in, or Studio views stale even though every request is correctly isolated.

The backend CORS policy must allow these three headers on dashboard origins. Other frontend projects should reuse the header names and semantics instead of inventing application-specific variants.

## Performance guardrails

Run `npm run build:budget` in CI. It performs a production build and fails when the home, organizations, users, event-detail, or shared first-load bundles exceed their checked-in budgets. Intent-only modals and secondary panels must remain dynamically imported.

## Adding a product

1. Add identity and deployment data to `src/products/catalog.json`, then add `src/products/<code>/manifest.ts` with modules, features, and login copy.
2. Add the code to `TenantCode` and register the manifest in `src/products/registry.ts`. The product contract rejects overlapping domains, API hosts, and incomplete module declarations.
3. Add the matching backend application seed and dedicated Cognito client/audience.
4. Add production and local hostname tests in `tenant-config.test.ts` plus feature-boundary tests in `product-manifest.test.ts`.
5. Validate the full contract: hostname -> Cognito audience -> backend application code -> organization entitlement -> frontend feature ceiling.

Do not add brand-specific pages by default. Prefer a shared route whose content and availability come from the manifest. Create a product-owned component only when the workflow itself differs, not merely its wording or colors.

## Cross-project boundary

- `dashboard-ts`: authenticated operations and product presentation.
- `itbem-events-backend`: identity, entitlements, authorization, business rules, persistence, and cache isolation.
- `cafetton-casero`: EventiApp public event experience; it must consume public event/design data and must not import dashboard tenant state.
- Workers/media/infrastructure: tenant identifiers travel as data and partition cache keys, storage prefixes, metrics, queues, and logs; they do not own UI branding.

Any module change must update the product manifest and backend application seed together. Public-event changes additionally require checking `cafetton-casero`; media-processing changes require checking workers and infrastructure.
