# Audit — Estado actual del proyecto

> Generado tras lectura directa de todos los archivos fuente.
> Clasificado por severidad real.

---

## 🔴 BUGS CRÍTICOS (rompen funcionalidad en producción)

### 1. `api.ts` llama métodos que NO existen en el store
**Archivo:** `src/lib/api.ts` líneas 34, 45

```typescript
// LÍNEA 34 — setUser NO EXISTE en el store
setUser({ id: decoded.sub, email: decoded.email, ... })

// LÍNEA 45 — logout NO EXISTE en el store
useStore.getState().logout()
```

El store solo tiene: `setToken`, `setProfile`, `invalidateProfile`, `setCurrentClient`, `clearSession`.
**Impacto:** Cada vez que un token no está en cache (primera carga, refresh), `getAuthToken()` lanza un error JS → Axios interceptor falla → todas las peticiones fallan en silencio.

---

### 2. `events/`, `events/[id]/` y `orders/` usan MOCK DATA, no la API real
**Archivos:** `src/app/(app)/events/page.tsx`, `src/app/(app)/events/[id]/page.tsx`, `src/app/(app)/orders/page.tsx`

```typescript
import { getEvents } from '@/data'     // ← mock
import { getEvent, getEventOrders } from '@/data'  // ← mock
import { getOrders } from '@/data'     // ← mock
```

Además son Server Components sin `'use client'` ni SWR — datos hardcodeados de `src/data.ts`. **Estas tres páginas no muestran datos reales.**

---

### 3. `profile/page.tsx` llama `res.data.data` sin fallback
**Archivo:** `src/app/(app)/settings/profile/page.tsx` línea 36

```typescript
// SessionBootstrap sí tiene fallback: res.data.data ?? res.data
// Pero profile/page.tsx NO:
setProfile(res.data.data)   // ← si la respuesta es directa, esto es undefined
```

Si el backend devuelve `User` directo (sin envelope `{data: ...}`), el perfil se pone a `undefined` después de guardar.

---

### 4. `clients/page.tsx` accede campos en PascalCase pero el store espera snake_case
**Conflicto entre API response y store Client interface:**

```typescript
// API response (PascalCase — Go GORM default):
client.ID, client.Name, client.Logo, client.IsActive, client.ClientTypeID

// Store Client interface (snake_case):
{ id: string, name: string, logo?: string, client_type: { code: string } }

// application-layout.tsx accede desde el store (snake_case):
currentClient.name, currentClient.id
```

Cuando `setCurrentClient(client)` se llama con un objeto PascalCase del API, `currentClient.name` devuelve `undefined` en toda la app.

---

## 🟠 PROBLEMAS DE CALIDAD ALTA (afectan UX y mantenibilidad)

### 5. Sin toasts en operaciones CRUD
Todas las mutaciones fallan silenciosamente ante el usuario:

| Archivo | Operación | Toast éxito | Toast error |
|---|---|---|---|
| `clients/page.tsx` | Delete | ❌ | Solo `console.error` |
| `users/page.tsx` | Toggle active | ❌ | Sin try/catch ❌ |
| `user-form-modal.tsx` | Create/Edit | ❌ | Solo `console.error` |
| `client-form-modal.tsx` | Create/Edit | ❌ | Solo `console.error` |
| `settings/profile/page.tsx` | Save profile | ❌ | Sin catch ❌ |

---

### 6. Tipos `any` en props y state críticos

```typescript
// clients/page.tsx
const [selectedClient, setSelectedClient] = useState<any>(null)
clients.map((client: any) => ...)

// users/page.tsx
const [selectedUser, setSelectedUser] = useState<any>(null)
const toggleActive = async (user: any) => ...
users.map((user: any) => ...)

// client-form-modal.tsx
client?: any  ← en Props
clientTypes.map((type: any) => ...)

// user-form-modal.tsx
user?: any  ← en Props
```

Los tipos reales (`Client`, `User`) **existen en `src/models/`** pero no se importan.

---

### 7. Sin estado de error en SWR

Todas las páginas hacen:
```typescript
const { data, isLoading } = useSWR(...)  // ← error ignorado
```

Deberían:
```typescript
const { data, isLoading, error } = useSWR(...)
if (error) return <ErrorState />
```

---

### 8. `toggleActive` en `users/page.tsx` sin try/catch ni loading
```typescript
// Sin loading state → doble click posible
// Sin try/catch → error silencioso
const toggleActive = async (user: any) => {
    await api.put(endpoint)    // ← sin manejo de error
    await mutate('/users/all')
}
```

---

### 9. `profile/page.tsx` usa `<Input label="...">` que no es una prop válida del componente
```typescript
<Input label="Nombre" value={firstName} ... />
```
`Input` en este proyecto es un elemento `<input>` estilizado sin prop `label`. Debería usar:
```typescript
<Field><Label>Nombre</Label><Input value={firstName} .../></Field>
```

---

### 10. Dashboard (`page.tsx`) — UI mezclada y datos hardcodeados

- Labels en inglés ("Total revenue", "Total events", "Active events", "Period") mientras el resto del app está en español
- `totalRevenue` hardcodeado como `"$0.00"` — no viene de API
- `event.domain` (línea 131) — campo que **no existe** en el modelo `Event`
- El `<Select name="period">` no hace nada — no hay estado ni filtro aplicado
- Spinner de carga (`"..."`) en lugar de skeleton

---

### 11. `client-form-modal.tsx` usa `<select>` nativo en lugar del componente `Select`
```typescript
// Usa select HTML nativo con estilos manuales en zinc-900
<select {...register('client_type_id')} className="block w-full...">

// Debería usar el componente del sistema de diseño:
<Select {...register('client_type_id')}>
```

---

## 🟡 MEJORAS DE ARQUITECTURA Y UX

### 12. Envelope de respuesta no estandarizado en el fetcher
`SessionBootstrap`, `clients/page.tsx`, `users/page.tsx` todos tienen este patrón defensivo:
```typescript
res.data.data ?? res.data          // SessionBootstrap
Array.isArray(res) ? res : res?.data || []   // clients, users
```
Confirmar una sola vez si el backend envuelve en `{data: T}` y estandarizar en `fetcher.ts`.

---

### 13. `users/page.tsx` navega a `/users/${user.id}/clients` — ruta que no existe
```typescript
router.push(`/users/${user.id}/clients`)  // ← esta página no está creada
```

---

### 14. `(app)/layout.tsx` usa `useStore` directamente en un layout — posible hydration mismatch
Layout es un componente cliente que bloquea el render hasta `profileLoaded`. Revisar si hay flash de contenido antes del bootstrap.

---

### 16. Double-toast on network errors and 403
`api.ts` response interceptor already fires `toast.error('Sin conexión...')` on network errors and `toast.error('Sin permisos...')` on HTTP 403. Components that also `toast.error(...)` in their catch blocks will show two toasts for the same failure. Pattern exists across `event-form-modal.tsx`, `invitation-tracker.tsx`, and others. Fix globally: either move all user-facing error toasts to the interceptor, or suppress catch-block toasts for status codes the interceptor already handles (401, 403, network). See `src/lib/api.ts` lines 81-88.

---

### 15. Spinner en lugar de skeleton loaders
`clients/page.tsx` y `users/page.tsx` usan un spinner centrado durante la carga:
```typescript
<div className="h-10 w-10 animate-spin rounded-full border-2 ..."/>
```
Los docs definen que se deben usar skeleton loaders que coincidan con el layout real.

---

## 📋 RESUMEN — ESTADO

### Fase 1 — Bugs críticos ✅ RESUELTOS
1. ✅ `api.ts`: `setUser` eliminado, `logout` → `clearSession` (ambos call sites)
2. ✅ `application-layout.tsx`: `normalizeClient()` aplica antes de `setCurrentClient`; `clients.data` → `clients` (array directo tras fetcher fix)
3. ✅ `/events`, `/events/[id]`, `/orders`: convertidos a `'use client'` + SWR con datos reales
4. ✅ `fetcher.ts`: `r => r.data?.data ?? r.data` — envelope desenvuelto automáticamente

### Fase 2 — Calidad ✅ RESUELTA
5. ✅ `toast.success/error` en: `client-form-modal`, `user-form-modal`, `clients/page` (delete), `users/page` (toggle), `profile/page` (save + avatar)
6. ✅ `users/page` → `User[]`, `user-form-modal` → `User | null`; clients mantiene `any` (API PascalCase vs modelo snake_case)
7. ✅ `error` state en: `clients/page`, `users/page`, `events/page`, `events/[id]/page`
8. ✅ `toggleActive`: `try/catch` + `togglingId` guard contra doble-click
9. ✅ `profile/page.tsx`: `<Input label>` → `<Field><Label><Input>`
10. ✅ `profile/page.tsx`: `setProfile(res.data.data ?? res.data)`

### Fase 3 — Refactor y UX ✅ RESUELTA
11. ✅ Dashboard: español, `event.domain` eliminado, KPIs reales (`events.length`, `activeEvents.length`, `totalCapacity`), period Select eliminado
12. ✅ Spinners → skeleton loaders en `clients/page` y `users/page`
13. ✅ `/users/[id]/clients` página creada (`src/app/(app)/users/[id]/clients/page.tsx`)
14. ✅ `<select>` nativo → `<Select>` del design system en `client-form-modal`
15. ⏳ Hydration del layout — pendiente de validación manual
