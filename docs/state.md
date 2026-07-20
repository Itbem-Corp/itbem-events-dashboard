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
  currentClient: Client | null
  workspaceContexts: Record<TenantCode, TenantWorkspaceContext> // persisted preference only
  profileLoaded: boolean
}
```

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
