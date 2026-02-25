# Moments Wall Admin Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow admins to see a real preview of the moments wall (even when it's not published to guests) by clicking "Vista previa" in the dashboard — secured via single-use OTP token stored in Redis.

**Architecture:** Dashboard calls `POST /events/:id/preview-token` (protected, Cognito auth) → backend generates UUID, stores in Redis with 1h TTL → dashboard opens `/e/:identifier/momentos?preview_token=<uuid>` in new tab → Astro passes token to `MomentsGallery` → component appends token to the public moments API call → backend validates OTP from Redis, deletes it (single-use), bypasses `ShowMomentWall` check → gallery renders with a polished admin banner.

**Tech Stack:** Go + Echo + Redis (`redisrepository`), Next.js 15 + Heroicons, Astro 5 + React + Framer Motion

---

## Task 1: Backend — `CreatePreviewToken` handler

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/public_moments.go`

Add this function after `ListPublicMoments` (after line ~152):

```go
// POST /events/:id/preview-token  — protected (Cognito JWT required)
// Generates a single-use preview token for the moments wall.
// Token is stored in Redis with a 1-hour TTL and deleted after first use.
func CreatePreviewToken(c echo.Context) error {
	idParam := c.Param("id")
	eventID, err := uuid.FromString(idParam)
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid event ID", err.Error())
	}

	// Verify event exists
	var event models.Event
	if err := configuration.DB.First(&event, "id = ?", eventID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return utils.Error(c, http.StatusNotFound, "Event not found", "")
		}
		return utils.Error(c, http.StatusInternalServerError, "Error loading event", err.Error())
	}

	token, err := uuid.NewV4()
	if err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error generating token", err.Error())
	}

	redisKey := fmt.Sprintf("preview:moments:%s:%s", eventID.String(), token.String())
	ctx := c.Request().Context()
	if err := redisrepository.SaveKey(ctx, redisKey, "1", time.Hour); err != nil {
		return utils.Error(c, http.StatusServiceUnavailable, "Cache unavailable", err.Error())
	}

	return utils.Success(c, http.StatusCreated, "Preview token created", map[string]interface{}{
		"token":      token.String(),
		"expires_in": 3600,
	})
}
```

Required imports to add at the top of the file (if not already present):
```go
"time"
redisrepository "events-stocks/repositories/redisrepository"
```

**Step 1:** Open `public_moments.go` and add `"time"` and `redisrepository` to imports.

**Step 2:** Add the `CreatePreviewToken` function after `ListPublicMoments`.

**Step 3:** Build to verify no compile errors:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```
Expected: no output (clean build).

**Step 4:** Commit:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add controllers/moments/public_moments.go
git commit -m "feat(moments): CreatePreviewToken handler — OTP via Redis, 1h TTL"
```

---

## Task 2: Backend — Validate `?preview_token` in `ListPublicMoments`

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/controllers/moments/public_moments.go`

Replace the `ShowMomentWall` check block (lines ~109-118):

```go
// Respect ShowMomentWall flag — unless a valid admin preview token is present.
cfg, _ := eventconfigrepository.GetEventConfigByID(event.ID)
if cfg != nil && !cfg.ShowMomentWall {
    // Check for admin preview token (single-use, 1h TTL)
    previewToken := c.QueryParam("preview_token")
    if previewToken != "" {
        redisKey := fmt.Sprintf("preview:moments:%s:%s", event.ID.String(), previewToken)
        ctx := c.Request().Context()
        valid, _ := redisrepository.ExistKey(ctx, redisKey)
        if valid {
            // Single-use: delete immediately after validation
            _ = redisrepository.DeleteKey(ctx, redisKey)
            // Fall through — serve moments normally below
        } else {
            return utils.Error(c, http.StatusForbidden, "Invalid or expired preview token", "")
        }
    } else {
        return utils.Success(c, http.StatusOK, "Moments not yet available", map[string]interface{}{
            "items":     []interface{}{},
            "published": false,
            "total":     0,
            "has_more":  false,
        })
    }
}
```

**Step 1:** Replace the existing `ShowMomentWall` block with the code above.

**Step 2:** Build:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend && go build ./...
```
Expected: clean.

**Step 3:** Commit:
```bash
git add controllers/moments/public_moments.go
git commit -m "feat(moments): bypass ShowMomentWall for valid admin preview OTP"
```

---

## Task 3: Backend — Register route

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/routes/routes.go`

Add after line `protected.POST("/events/:id/repair", events.RepairEvent)` (line ~189):

```go
protected.POST("/events/:id/preview-token", moments.CreatePreviewToken)
```

**Step 1:** Add the route.

**Step 2:** Build:
```bash
go build ./...
```

**Step 3:** Commit:
```bash
git add routes/routes.go
git commit -m "feat(moments): register POST /events/:id/preview-token protected route"
```

---

## Task 4: Backend — Integration tests

**Files:**
- Modify: `//wsl.localhost/Ubuntu/var/www/itbem-events-backend/integration/shared_upload_test.go`

Add a helper `previewEcho()` and three tests after the existing wall tests:

```go
// previewEcho returns an Echo instance wired for both the public moments GET
// and the protected preview-token POST (no JWT middleware — tests call it directly).
func previewEcho() *echo.Echo {
    e := echo.New()
    e.HideBanner = true
    e.Validator = customValidator.New()
    tokenRepo := invitationaccesstokenrepository.NewAccessTokenRepo()
    momentsCtrl.InitPublicMomentsController(tokenRepo, nil)
    svc := momentsSvc.NewMomentService(momentrepository.NewMomentRepo(), redisrepository.NewRedisRepo())
    momentsSvc.SetDefaultMomentService(svc)
    e.GET("/api/events/:identifier/moments", momentsCtrl.ListPublicMoments)
    e.POST("/events/:id/preview-token", momentsCtrl.CreatePreviewToken)
    return e
}

func TestPreviewToken_ValidToken_BypassesWall(t *testing.T) {
    fx := setupMomentsEvent(t, sharedUploadOpts{showWall: false})
    e := previewEcho()

    // Generate a preview token directly via Redis (simulating what the handler does)
    token := uuid.Must(uuid.NewV4()).String()
    redisKey := fmt.Sprintf("preview:moments:%s:%s", fx.eventID.String(), token)
    require.NoError(t, redisrepository.SaveKey(context.Background(), redisKey, "1", time.Hour))

    req := httptest.NewRequest(http.MethodGet,
        fmt.Sprintf("/api/events/%s/moments?preview_token=%s", fx.identifier, token), nil)
    rec := httptest.NewRecorder()
    e.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusOK, rec.Code, "body: %s", rec.Body.String())
    var resp map[string]interface{}
    require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
    data := resp["data"].(map[string]interface{})
    assert.NotEqual(t, false, data["published"], "preview should bypass wall")
}

func TestPreviewToken_InvalidToken_Returns403(t *testing.T) {
    fx := setupMomentsEvent(t, sharedUploadOpts{showWall: false})
    e := previewEcho()

    req := httptest.NewRequest(http.MethodGet,
        fmt.Sprintf("/api/events/%s/moments?preview_token=not-a-real-token", fx.identifier), nil)
    rec := httptest.NewRecorder()
    e.ServeHTTP(rec, req)

    assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestPreviewToken_SingleUse_SecondRequestReturns403(t *testing.T) {
    fx := setupMomentsEvent(t, sharedUploadOpts{showWall: false})
    e := previewEcho()

    token := uuid.Must(uuid.NewV4()).String()
    redisKey := fmt.Sprintf("preview:moments:%s:%s", fx.eventID.String(), token)
    require.NoError(t, redisrepository.SaveKey(context.Background(), redisKey, "1", time.Hour))

    url := fmt.Sprintf("/api/events/%s/moments?preview_token=%s", fx.identifier, token)

    // First request — should succeed (bypasses wall)
    req1 := httptest.NewRequest(http.MethodGet, url, nil)
    rec1 := httptest.NewRecorder()
    e.ServeHTTP(rec1, req1)
    assert.Equal(t, http.StatusOK, rec1.Code, "first use should succeed")

    // Second request — token already consumed, should be forbidden
    req2 := httptest.NewRequest(http.MethodGet, url, nil)
    rec2 := httptest.NewRecorder()
    e.ServeHTTP(rec2, req2)
    assert.Equal(t, http.StatusForbidden, rec2.Code, "second use should fail (single-use)")
}
```

Add `"context"` to imports if not present.

**Step 1:** Write the three tests above.

**Step 2:** Run integration tests:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test -v -tags=integration ./integration/... -run TestPreviewToken 2>&1
```
Expected: 3 PASS.

**Step 3:** Commit:
```bash
git add integration/shared_upload_test.go
git commit -m "test(moments): preview token integration tests — valid, invalid, single-use"
```

---

## Task 5: Dashboard — "Vista previa" button in MomentsWall

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\moments-wall.tsx`

**Step 1:** Add preview state and handler. Find `const handleToggleShare` (around line 921) and add above it:

```typescript
const [generatingPreview, setGeneratingPreview] = useState(false)

const handleOpenPreview = async () => {
  if (generatingPreview) return
  setGeneratingPreview(true)
  try {
    const res = await api.post<{ data: { token: string } }>(`/events/${eventId}/preview-token`)
    const token = res.data.data.token
    window.open(`${wallUrl}?preview_token=${token}`, '_blank', 'noopener,noreferrer')
  } catch {
    toast.error('No se pudo generar el preview')
  } finally {
    setGeneratingPreview(false)
  }
}
```

**Step 2:** Add the button in Row 2 of the toolbar, right before the existing "Ver muro" `<a>` tag (around line 1155). Add it after the separator `<div>`:

```tsx
{/* Vista previa admin */}
<button
  onClick={handleOpenPreview}
  disabled={generatingPreview}
  title="Abrir vista previa del muro — solo visible para ti"
  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors border border-violet-500/20 disabled:opacity-50"
>
  {generatingPreview ? (
    <ArrowPathIcon className="size-3.5 animate-spin" />
  ) : (
    <EyeIcon className="size-3.5" />
  )}
  <span className="hidden sm:inline">{generatingPreview ? 'Generando…' : 'Vista previa'}</span>
  <span className="sm:hidden">Preview</span>
</button>
```

**Step 3:** Add `EyeIcon` to the Heroicons import at the top of the file. Find the existing heroicons import block and add `EyeIcon` to it.

**Step 4:** TypeScript check:
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts && npx tsc --noEmit
```
Expected: zero errors.

**Step 5:** Commit:
```bash
git add src/components/events/moments-wall.tsx
git commit -m "feat(moments): Vista previa button — generates OTP and opens preview tab"
```

---

## Task 6: Astro — Pass `preview_token` from URL to MomentsGallery

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\pages\e\[identifier]\momentos.astro`

**Step 1:** Read `preview_token` from URL params (server-side, Astro handles this at request time):

```astro
---
export const prerender = false

import TemplateLayout from '../../../layouts/template.astro'
import MomentsGallery from '../../../components/moments/MomentsGallery'
import { fetchEventOgData, buildOgImageUrl } from '../../../lib/og'

const EVENTS_URL = import.meta.env.PUBLIC_EVENTS_URL as string ?? 'http://localhost:8080/'
const { identifier } = Astro.params
// Admin preview token — passed from dashboard, validated by backend on each request.
const previewToken = Astro.url.searchParams.get('preview_token') ?? ''

// ... rest of OG data fetching unchanged ...
---

<TemplateLayout ...>
  <MomentsGallery
    client:only="react"
    EVENTS_URL={EVENTS_URL}
    previewToken={previewToken}
  />
</TemplateLayout>
```

**Step 2:** Commit:
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
git add src/pages/e/[identifier]/momentos.astro
git commit -m "feat(moments): pass preview_token from URL to MomentsGallery"
```

---

## Task 7: MomentsGallery — Preview mode fetch + admin banner

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\cafetton-casero\src\components\moments\MomentsGallery.tsx`

### Step 1: Add `previewToken` to Props interface

```typescript
interface Props {
  EVENTS_URL: string
  previewToken?: string
}
```

### Step 2: Accept `previewToken` in component signature and detect preview mode

```typescript
export default function MomentsGallery({ EVENTS_URL: rawEventsUrl, previewToken = '' }: Props) {
  const EVENTS_URL = rawEventsUrl.endsWith('/') ? rawEventsUrl : rawEventsUrl + '/'
  const isAdminPreview = previewToken.length > 0
  // ... existing state ...
```

### Step 3: Update `fetchMoments` to include the token

```typescript
const fetchMoments = useCallback(async (id: string, pageNum: number, append: boolean) => {
  try {
    const tokenParam = previewToken ? `&preview_token=${encodeURIComponent(previewToken)}` : ''
    const res = await fetch(
      `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?page=${pageNum}&limit=${PAGE_SIZE}${tokenParam}`
    )
    // ... rest unchanged, but update the 403 case:
    if (!res.ok) {
      if (res.status === 404) { setError("Evento no encontrado"); return }
      if (res.status === 403) { setError("Token de vista previa inválido o expirado"); return }
      throw new Error(`HTTP ${res.status}`)
    }
    // ... rest unchanged ...
  } catch {
    setError("No se pudieron cargar los momentos")
  }
}, [EVENTS_URL, previewToken])
```

Note: The token is **single-use** on the backend. `fetchMoments` is called once on mount with page 1. `loadMore` calls it again for subsequent pages — but those will get 403 since the token was consumed. **Fix:** For load-more pages in preview mode, omit the token (moments are already authorized on first call and the wall state check passed).

```typescript
// In loadMore, don't re-pass the token for subsequent pages
const loadMore = useCallback(async () => {
  if (loadingMore || !hasMore || !identifier) return
  const nextPage = page + 1
  setLoadingMore(true)
  // For load-more in preview mode, token is already consumed — pass empty string
  // so backend treats it as a normal request. Wall is published=true by this point.
  await fetchMomentsForPage(identifier, nextPage, true)
  setPage(nextPage)
  setLoadingMore(false)
}, [loadingMore, hasMore, identifier, page])
```

**Simplest fix for paginated preview:** Store a flag `previewGranted` set to `true` after first successful preview fetch. For loadMore, if `previewGranted`, temporarily toggle the wall via... actually this is complex because the token is consumed.

**Better approach:** The backend token is used once for page 1. For pages 2+, the backend requires `ShowMomentWall=true` normally. Since in preview mode the admin wants to paginate through all moments, use a **different strategy**: don't delete the token until the session tab is closed.

**Revised backend behavior:** Instead of deleting the token on first use, store the event_id in Redis and keep the token valid for the full 1h TTL. Multiple paginated requests from the same preview session all work. The token expires naturally after 1h.

**Update Task 2:** In `ListPublicMoments`, remove the `DeleteKey` call — just validate with `ExistKey` and do NOT delete:

```go
valid, _ := redisrepository.ExistKey(ctx, redisKey)
if valid {
    // Token is valid — fall through to serve moments.
    // Token remains in Redis until TTL expires (1 hour) so pagination works.
} else {
    return utils.Error(c, http.StatusForbidden, "Invalid or expired preview token", "")
}
```

Update Task 4 test `TestPreviewToken_SingleUse_SecondRequestReturns403` → rename to `TestPreviewToken_ValidToken_AllowsPagination` and assert that a second request with the SAME token also succeeds (since we no longer delete it).

### Step 4: Skip ComingSoonScreen in preview mode

```typescript
if (published === false && !isAdminPreview) {
  return <ComingSoonScreen eventName={eventName} theme={theme} />
}
```

### Step 5: Add `AdminPreviewBanner` component at the return root

Wrap the entire gallery render in a fragment with the banner at top:

```tsx
return (
  <>
    {isAdminPreview && <AdminPreviewBanner onClose={() => {/* just hides UI, not functional */}} />}
    <div className="min-h-screen bg-white">
      {/* ... existing gallery JSX ... */}
    </div>
  </>
)
```

### Step 6: Write the `AdminPreviewBanner` component (add at bottom of file):

```tsx
// ── AdminPreviewBanner ───────────────────────────────────────────────────────

function AdminPreviewBanner({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(true)

  const handleClose = () => {
    setVisible(false)
    onClose()
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -64, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 sm:px-6 h-14 bg-gray-950/95 backdrop-blur-md border-b border-white/10 shadow-2xl shadow-black/40"
        >
          {/* Left: label */}
          <div className="flex items-center gap-3 min-w-0">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center"
            >
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </motion.div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Vista previa de administrador</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                  Solo tú ves esto
                </span>
              </div>
              <p className="hidden sm:block text-xs text-gray-400 truncate">El muro aún no es público — los invitados ven la pantalla de "Próximamente"</p>
            </div>
          </div>

          {/* Right: close */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar aviso de vista previa"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

When the banner is shown, the hero header overlaps with it (banner is `h-14 fixed top-0`). Add top padding to the main gallery div:

```tsx
<div className={`min-h-screen bg-white ${isAdminPreview ? 'pt-14' : ''}`}>
```

**Step 7:** TypeScript check:
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero && npx tsc --noEmit 2>&1 | grep MomentsGallery
```
Expected: no errors for this file.

**Step 8:** Commit:
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(moments): admin preview mode — OTP fetch, bypass ComingSoon, AnimatePresence banner"
```

---

## Task 8: Update `TestPreviewToken_SingleUse` → token stays valid for pagination

Go back to Task 4 (backend integration test) and update:

1. In `ListPublicMoments` (Task 2), remove the `DeleteKey` call — token stays valid until TTL.
2. Rename and rewrite the third test to confirm pagination works (same token, second request succeeds).

```go
func TestPreviewToken_ValidToken_AllowsPagination(t *testing.T) {
    fx := setupMomentsEvent(t, sharedUploadOpts{showWall: false})
    e := previewEcho()

    token := uuid.Must(uuid.NewV4()).String()
    redisKey := fmt.Sprintf("preview:moments:%s:%s", fx.eventID.String(), token)
    require.NoError(t, redisrepository.SaveKey(context.Background(), redisKey, "1", time.Hour))

    url := fmt.Sprintf("/api/events/%s/moments?preview_token=%s", fx.identifier, token)

    for i := 0; i < 3; i++ {
        req := httptest.NewRequest(http.MethodGet, url, nil)
        rec := httptest.NewRecorder()
        e.ServeHTTP(rec, req)
        assert.Equal(t, http.StatusOK, rec.Code, "page %d should succeed with same token", i+1)
    }
}
```

Run:
```bash
go test -v -tags=integration ./integration/... -run TestPreviewToken 2>&1
```
Expected: 3 PASS.

Commit:
```bash
git add controllers/moments/public_moments.go integration/shared_upload_test.go
git commit -m "fix(moments): keep preview token valid for full session (no delete on use)"
```

---

## Task 9: Full verification

**Step 1:** Backend build + integration tests:
```bash
cd //wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
go test -v -tags=integration ./integration/... -run TestPreviewToken
go test ./... 2>&1 | tail -5
```

**Step 2:** Dashboard TypeScript + unit tests:
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
npx tsc --noEmit
npm run test:unit
```

**Step 3:** Astro TypeScript:
```bash
cd C:\Users\AndBe\Desktop\Projects\cafetton-casero
npx tsc --noEmit 2>&1 | grep -v "astro.config"
```

**Step 4:** Manual smoke test flow:
1. Start backend locally: `go run server.go`
2. Start dashboard: `npm run dev`
3. Open an event with approved moments but `show_moment_wall = false`
4. Go to Momentos tab → click "Vista previa"
5. New tab opens: `/momentos?preview_token=<uuid>`
6. Gallery loads with violet admin banner at top, full moments visible
7. Clicking banner close hides it, moments remain
8. Reloading the tab → banner gone, `published: false` from API → ComingSoonScreen (token was not for this URL reload — page reload loses the query param? No, the URL still has `?preview_token=<uuid>` but on reload the same token is still in Redis and valid for 1h)
9. Open the URL in incognito → same preview (token is URL-based, not user-based — acceptable for admin tool)

**Step 5:** Commit docs update:
```bash
cd C:\Users\AndBe\Desktop\Projects\dashboard-ts
git add docs/
git commit -m "docs: admin preview token design and plan"
```

---

## Security Notes

- **Token scope:** UUID v4, 122 bits of entropy — brute-force infeasible
- **TTL:** 1 hour — expired tokens auto-purged by Redis
- **Data exposed:** Only already-approved moments — no pending/rejected content
- **Incognito sharing:** If an admin shares the URL with preview_token, the recipient sees approved moments for 1h — acceptable risk for an admin tool
- **Rate limiting:** `POST /events/:id/preview-token` is behind the protected rate limiter (60 req/s) — no abuse vector
