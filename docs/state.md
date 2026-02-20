# State Management

Store: `src/store/useStore.ts` — single Zustand store, persisted to `localStorage` key `eventi-storage`.

## Shape

```typescript
interface AppState {
  token: string | null          // JWT — NOT persisted
  user: User | null             // persisted
  currentClient: Client | null  // persisted
  profileLoaded: boolean        // NOT persisted — always false on fresh load

  setToken(token: string): void
  setProfile(user: User): void       // sets user + profileLoaded=true
  invalidateProfile(): void          // profileLoaded=false → re-triggers bootstrap
  setCurrentClient(client: Client): void
  clearSession(): void               // wipes all state + localStorage
}
```

Only `user` and `currentClient` survive page refresh. `token` is fetched fresh each session from `/api/auth/token`.

## Usage

```tsx
// Client components only ('use client')
import { useStore } from '@/store/useStore'

const { user, currentClient, profileLoaded } = useStore()
const setCurrentClient = useStore((s) => s.setCurrentClient)  // selector pattern
```

## Lifecycle

```
Page load → localStorage hydrates user + currentClient
  → SessionBootstrap → setToken() → setProfile(user) → profileLoaded=true
  → App renders

Org switch → setCurrentClient(client) → SWR re-fetches (keys change)
Logout     → clearSession() → localStorage cleared → redirect /login
Profile edit → invalidateProfile() → SessionBootstrap re-runs → fresh /users
```

## SWR Dependency Pattern

```tsx
// Fetch only when currentClient exists
useSWR(currentClient ? `/events?client_id=${currentClient.id}` : null, fetcher)

// Fetch only when profileLoaded
useSWR(profileLoaded ? '/users/settings' : null, fetcher)
```
