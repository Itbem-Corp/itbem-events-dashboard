# Moments Wall Infinite Scroll — Design

**Date:** 2026-03-03
**Feature:** Cursor-based infinite scroll for public moments wall, 25 per page, max 500 visible

---

## Goal

Replace the current 100-at-a-time page load on the public Astro moments wall with cursor-based infinite scroll: 25 moments per trigger, hard cap at 500 total, end message when limit reached or content exhausted.

## Architecture

Two-project change: Go backend adds cursor pagination support alongside existing page-based pagination; Astro frontend switches `MomentsGallery.tsx` from `page` state to `cursor` state.

**Tech Stack:** Go (Echo + GORM), React (Astro island), PostgreSQL keyset pagination

---

## API Contract

**Endpoint:** `GET /api/events/:id/moments`

### New cursor mode
```
GET /api/events/:id/moments?cursor=<base64>&limit=25
```

- First load: omit `cursor` → returns 25 most recent approved moments
- Subsequent loads: `cursor` = opaque base64 token from previous `next_cursor`
- Internally decodes to `(created_at, id)` tuple for stable keyset pagination
- Response adds `next_cursor: string` field — empty string `""` when no more results

### Existing page mode (unchanged)
```
GET /api/events/:id/moments?page=2&limit=100
```
Fully preserved for dashboard and other consumers. Cursor is additive only.

### Response shape (addition)
```json
{
  "moments": [...],
  "total": 1234,
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wMy0wM1QxMjowMDowMFoiLCJpZCI6ImFiYyJ9"
}
```

---

## Backend Changes

**File:** `controllers/moments/public_moments.go`

### Cursor encoding
```go
type momentCursor struct {
    CreatedAt time.Time `json:"created_at"`
    ID        string    `json:"id"`
}

func encodeCursor(m models.Moment) string {
    b, _ := json.Marshal(momentCursor{CreatedAt: m.CreatedAt, ID: m.ID.String()})
    return base64.StdEncoding.EncodeToString(b)
}

func decodeCursor(s string) (*momentCursor, error) {
    b, err := base64.StdEncoding.DecodeString(s)
    if err != nil { return nil, err }
    var c momentCursor
    return &c, json.Unmarshal(b, &c)
}
```

### Query logic
```go
// cursor mode
if cursorParam != "" {
    c, err := decodeCursor(cursorParam)
    // WHERE (created_at, id) < (c.CreatedAt, c.ID)
    // ORDER BY created_at DESC, id DESC
    // LIMIT limit
    query = query.Where(
        "(created_at < ? OR (created_at = ? AND id::text < ?))",
        c.CreatedAt, c.CreatedAt, c.ID,
    ).Order("created_at DESC, id DESC").Limit(limit)
} else {
    query = query.Order("created_at DESC, id DESC").Limit(limit)
}
```

### Response
```go
nextCursor := ""
if len(moments) == limit {
    nextCursor = encodeCursor(moments[len(moments)-1])
}
// include next_cursor in JSON response
```

**Index:** Existing `created_at` index is sufficient. Keyset on `(created_at DESC, id DESC)` is O(log n).

---

## Frontend Changes

**File:** `src/components/moments/MomentsGallery.tsx` (Astro project)

### Constants
```ts
const PAGE_SIZE = 25    // was 100
const MAX_TOTAL = 500
```

### State
```ts
// Remove:
const [page, setPage] = useState(1)

// Add:
const [cursor, setCursor] = useState<string | null>(null)   // cursor to send on next fetch
const [nextCursor, setNextCursor] = useState<string | null>(null)  // received from last response
const [reachedEnd, setReachedEnd] = useState(false)
```

### Fetch URL
```ts
const url = cursor
  ? `${EVENTS_URL}api/events/${id}/moments?cursor=${cursor}&limit=${PAGE_SIZE}`
  : `${EVENTS_URL}api/events/${id}/moments?limit=${PAGE_SIZE}`
```

### Load-more logic (IntersectionObserver callback)
```ts
// Guard: already loading, already at end
if (loadingMore || reachedEnd) return

// Guard: hard cap
if (moments.length >= MAX_TOTAL) {
  setReachedEnd(true)
  return
}

// Fetch next page
const data = await fetchMoments(url)
const combined = [...moments, ...data.moments]
setMoments(combined.slice(0, MAX_TOTAL))

if (!data.next_cursor || combined.length >= MAX_TOTAL) {
  setReachedEnd(true)
} else {
  setCursor(data.next_cursor)
}
```

### End message
```tsx
{reachedEnd && (
  <p className="col-span-3 text-center text-white/60 py-8 text-sm">
    ✨ Has visto todos los momentos del evento
  </p>
)}
```

---

## Error Handling

- Malformed cursor → backend returns 400 with `{"error": "invalid cursor"}` → frontend logs warning, stops pagination (treats as end)
- Network error on load-more → existing retry logic unchanged, `loadingMore` reset to false
- Backend returns 0 moments with empty cursor → frontend sets `reachedEnd = true`

---

## Out of Scope

- Dashboard MomentsWall — no changes (uses page-based pagination internally)
- MomentWall.tsx (embedded section) — no changes (separate component with manual "Ver más" button)
- Real-time polling while scrolling — existing `PROCESSING_POLL_MS` logic unchanged
