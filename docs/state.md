# State Management

Store: `src/store/useStore.ts` — one Zustand store, persisted under the
`eventi-storage` localStorage key.

## Persistence boundary

Only non-sensitive workspace preferences are persisted: the selected workspace
mode and organization per product. JWTs, profile data, roles, capabilities and
application sessions never enter localStorage; they are resolved from the
server-verified application session after every new page load.

```typescript
interface AppState {
  token: string | null                    // JWT — memory only
  user: User | null                       // verified session — memory only
  applicationSession: ApplicationSession | null
  currentClient: Client | null            // memory only
  workspaceMode: 'organization' | 'platform'
  workspacePortfolio: boolean             // caller-access workspace — memory only
  organizationContext: OrganizationContextCredential | null // memory only
  workspaceContexts: Record<TenantCode, TenantWorkspaceContext> // persisted preference only
  profileLoaded: boolean
}

interface TenantWorkspaceContext {
  mode: 'organization' | 'platform'
  organization: Client | null
  portfolio?: boolean                     // the caller-access workspace was chosen
}
```

## Workspace actions

| Action | Effect |
| --- | --- |
| `activateTenantWorkspace(tenant, { canUsePlatformMode, portfolio?, allowPortfolioSelection? })` | Called by `ApplicationLayout` once the session is present (it depends on `Boolean(applicationSession)`, not on the session object). `portfolio: true` (the shell forces caller access) or `allowPortfolioSelection && saved.portfolio` selects the caller-access workspace. Otherwise it restores the saved platform or organization workspace as before, and **keeps the organization credential** when the same tenant and organization are activated again. |
| `selectPortfolioWorkspace(tenant)` | Caller-access workspace: `workspaceMode: 'organization'`, `currentClient: null`, `organizationContext: null`, `workspacePortfolio: true`, saved as `{ mode: 'organization', organization: null, portfolio: true }`. This overwrites an organization persisted on an earlier visit, so no `X-Organization-ID` is ever sent. |
| `selectOrganizationWorkspace(tenant, client, credential?)` | Organization workspace; clears `workspacePortfolio`. |
| `selectPlatformWorkspace(tenant)` | Platform workspace (roots); clears `workspacePortfolio` and the credential. |

The portfolio decision is made in the store, before any request: the access
profile derives `isPortfolioForced` from the session alone (EventiApp members
without Owner/Admin), so the first render already knows it and never asks for
`GET /clients` or an organization credential.

## Lifecycle

```
Page load → workspace preference hydrates
  → SessionBootstrap calls POST /api/auth/token
  → token + verified user/roles/organizations arrive together
  → dashboard renders

Every 5 min / tab focus → access and user context revalidate
Logout in any tab → Cognito refresh revoked, cookies and in-memory state clear
  → other dashboard tabs return to login
```

The token stays only in memory and is refreshed proactively near its Cognito
expiry. A 401 retries the original API request once after refresh; a failed
refresh performs a safe logout.
