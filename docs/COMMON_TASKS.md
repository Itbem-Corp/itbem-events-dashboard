# Common Tasks — Dashboard

> Step-by-step guides for the most frequent development tasks.
> Read this before writing any new page, component, model, or test.
> For copy-paste code: see `docs/TEMPLATES.md`. For file locations: see `docs/CODE_INDEX.md`.

---

## 1. Add a new protected page

**Goal:** New route at `/your-route` that only logged-in admins can access.

```
1. Create file:   src/app/(app)/your-route/page.tsx
2. Export default a React component (see TEMPLATES.md §5)
3. Add nav link:  src/components/sidebar.tsx  (or application-layout.tsx)
4. Test:          npm run dev → navigate to /your-route
5. Build check:   npx tsc --noEmit
```

The `(app)` route group is automatically protected by `middleware.ts`. No extra auth config needed.

For dynamic routes: `src/app/(app)/your-route/[id]/page.tsx` → params via `useParams<{ id: string }>()`.

---

## 2. Add a new event tab

**Goal:** New tab on the event detail page (`/events/[id]`).

```
1. Open:   src/app/(app)/events/[id]/page.tsx
2. Find:   the tab list (look for existing tabs like "Invitados", "Momentos", "Analytics")
3. Add:    a new tab button with an icon + label
4. Add:    the corresponding tab panel content below
5. Create: src/components/events/YourFeature.tsx  (see Task 3)
6. Import: YourFeature into the page and mount it inside the tab panel
7. Test:   npm run dev → go to any event → click new tab
```

Tabs use a local `activeTab` state string. Match your tab key exactly between the button and the panel.

---

## 3. Add a new feature component (with SWR)

**Goal:** A component that fetches data from the backend and displays it.

```
1. Create:   src/components/events/YourFeature.tsx  (see TEMPLATES.md §4)
2. Model:    if new data shape → create src/models/YourModel.ts  (see Task 4)
3. SWR key:  use the backend endpoint path, e.g. '/moments?event_id=...'
4. States:   loading skeleton → error empty-state → empty empty-state → data
5. Test:     import into any page and check all 4 states
6. Unit test: tests/unit/components/YourFeature.test.tsx  (see Task 7)
7. Docs:     add endpoint to docs/api.md if new; add component to docs/CODE_INDEX.md
```

**SWR key with conditional fetch:**
```typescript
// Skip fetch until eventId is available
useSWR(eventId ? `/endpoint?event_id=${eventId}` : null, fetcher)
```

**After a write, always revalidate:**
```typescript
await api.post('/endpoint', data)
await mutate(`/endpoint?event_id=${eventId}`)
```

---

## 4. Add a new TypeScript model

**Goal:** A new interface that matches a backend Go struct.

```
1. Create:   src/models/YourModel.ts
2. Extend:   BaseEntity (gives you id, created_at, updated_at, deleted_at)
3. Fields:   snake_case — the response normalizer handles PascalCase → snake_case
4. Export:   export interface YourModel extends BaseEntity { ... }
5. Import:   in any component or SWR call that needs the type
6. Docs:     add a row to docs/models.md
```

**Validate against backend:** read `docs/backend-agent.md` → use `/task backend-agent` to confirm field names match Go JSON tags before implementing.

---

## 5. Add a new modal form

**Goal:** Create/edit form in a dialog.

```
1. Create:   src/components/events/forms/YourFormModal.tsx  (see TEMPLATES.md §7)
2. Props:    { open, onClose, eventId, initialData? }
3. Submit:   api.post / api.put → mutate SWR key → toast → onClose()
4. isSubmitting: disable button + show "Guardando…" during request
5. Import:   into the parent component; toggle with local useState<boolean>
6. Test:     open modal → submit → verify SWR revalidates
```

Always use `Dialog` from `@/components/dialog` (Catalyst). Never build a custom modal from scratch.

---

## 6. Add a SWR hook for a new endpoint

**Goal:** Reusable fetch for a specific endpoint (shared across multiple components).

```
1. Use inline SWR in the component first — only extract if 2+ components need it
2. If extracting: create src/hooks/useYourData.ts
3. Return: { data, isLoading, error, mutate }
4. Docs:   add to docs/api.md
```

**Inline is usually better.** Don't extract hooks prematurely.

---

## 7. Add a unit test

**Goal:** Vitest + React Testing Library test for a component.

```
1. Create:   tests/unit/components/YourComponent.test.tsx
2. Mock SWR: vi.mock('swr', () => ({ default: vi.fn(() => ({ data: [], isLoading: false, error: null })), mutate: vi.fn() }))
3. Test:     loading state, error state, empty state, data state
4. Run:      npm run test:unit -- --reporter=verbose
5. Coverage: npm run test:coverage
```

See `TEMPLATES.md §8` for the full test template with SWR mock pattern.

**What to test:**
- Does it render the correct empty state?
- Does it show the skeleton when `isLoading: true`?
- Does it render items when data is present?
- Does a user action (button click) call the right API?

---

## 8. Add a new backend endpoint integration

**Goal:** Connect to a new Go backend endpoint.

```
1. Validate contract:  /task backend-agent — confirm method, path, response shape
2. Add to docs:        docs/api.md — endpoint, auth, response shape
3. Add model:          src/models/YourModel.ts if new shape (Task 4)
4. Implement SWR:      inside the component (Task 3)
5. Handle 429:         show user-facing error if rate-limited
6. Handle null/empty:  guard against undefined before accessing nested fields
```

**Response envelope:** All backend responses are `{ success, message, data }`. The fetcher unwraps via `r.data?.data ?? r.data`. You receive the inner `data` directly in your SWR result.

---

## 9. Deploy after a change

```
1. Verify:   npx tsc --noEmit  (no TypeScript errors)
2. Test:     npm run test:unit
3. Build:    npm run build      (must pass — catches SSR issues, missing imports)
4. Push:     git push origin main → Vercel deploys automatically (~2 min)
5. Check:    Vercel dashboard or /task release-coordinator for cross-project deploys
```

**Never push without a successful `npm run build`.** Build failures block the Vercel deploy.

---

## 10. Update docs after any change

| Changed | Update |
|---------|--------|
| New endpoint consumed | `docs/api.md` |
| New model | `docs/models.md` |
| New component | `docs/CODE_INDEX.md` |
| New page/route | `docs/routing.md` + `docs/CODE_INDEX.md` |
| New pattern | `docs/TEMPLATES.md` |
| Auth/middleware change | `docs/auth.md` |
| Store shape change | `docs/state.md` |
