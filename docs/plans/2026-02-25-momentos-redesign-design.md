# Momentos Gallery — Redesign Design Doc

**Date:** 2026-02-25
**Files affected:**
- `cafetton-casero/src/components/moments/MomentsGallery.tsx`
- `cafetton-casero/src/components/moments/themes/index.ts`
- `cafetton-casero/src/pages/e/[identifier]/momentos.astro`
- `itbem-events-backend/` — new migration + phrases endpoint

**Goal:** Transform the moments gallery into a premium, emotional, mobile-first experience with editorial masonry cascade, memory cards with dynamic phrases from DB, and real performance for 100-120 items.

---

## Approved Design Decisions

| Question | Answer |
|----------|--------|
| Layout | Editorial masonry cascade (Pinterest-style, 2-col mobile / 3-col tablet) |
| Stats bar | ❌ Removed entirely |
| Comments marquee | ❌ Removed |
| Load more button | ❌ Replaced with infinite scroll (IntersectionObserver) |
| Max items | 120 (4 pages × 30) |
| Phrases source | DB (`event_phrases` table), cached Redis 1h, ~100 wedding phrases seeded |
| Memory card frequency | Every 9 photos |
| Visual style | White/cream bg, serif display type, theme decorations, emotional copy |

---

## 1. Database — `event_phrases` Table

```sql
CREATE TABLE event_phrases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,  -- 'WEDDING', 'BIRTHDAY', 'QUINCEANERA', 'GRADUATION', 'CORPORATE', 'DEFAULT'
  phrase     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_phrases_type ON event_phrases(event_type);
```

### Seed: 100 Wedding Phrases

Tone: warm, intimate, celebratory, literary — never cheesy. Mix of short (5 words) and lyrical (2-3 lines). Spanish.

Examples:
- "El amor no necesita explicaciones"
- "Hoy sus historias se vuelven una"
- "Lo más bonito no es el vestido ni las flores — es la mirada"
- "Que cada foto aquí sea un recuerdo que los haga sonreír en 30 años"
- "No se busca al amor, se reconoce"
- "El mejor día es siempre el que se comparte"
- (95 more, full list in migration file)

---

## 2. Backend — Phrases Endpoint

```
GET /api/events/phrases?type=WEDDING&count=15
```

**Cache:** Redis key `phrases:{type}:{count}`, TTL 1h. On cache miss: random DB query + cache.

**Response:**
```json
{ "phrases": ["...", "...", "..."] }
```

**Fallback:** If `type` not found → query `DEFAULT` type.

**Route:** Public (no auth needed — phrases are not sensitive).

---

## 3. Frontend — Performance Strategy (3 layers)

### Layer 1: Chunked auto-loading
- Page size: 30 items (unchanged in backend)
- Max pages: 4 → max 120 items in DOM
- IntersectionObserver on sentinel div at bottom → auto-triggers `loadMore()`
- No "load more" button

### Layer 2: `content-visibility: auto`
```css
.moment-card {
  content-visibility: auto;
  contain-intrinsic-size: 0 300px;
}
```
Browser skips layout+paint for off-screen cards. ~15 active nodes at any time.

### Layer 3: IntersectionObserver per image
- Each `<img>` only fires HTTP request when card is 200px from viewport
- First 4 images: `loading="eager"` + `fetchpriority="high"` (LCP optimization)
- Images 5+: custom lazy via `data-src` → IntersectionObserver sets `src`

---

## 4. Frontend — Gallery Structure

### What's removed
- Stats bar (photo/video/comment counts)
- Comments marquee
- "Cargar más" button

### What's added
- Memory cards every 9 photos (full-width, in the masonry flow)
- Infinite scroll (auto)
- Blur shimmer placeholder per image
- Fade-in on image load (`onLoad` → opacity 0→1, 400ms)
- Page cap at 120 items with a graceful end state

### Masonry grid
```
Mobile:  columns-2, gap-3
Tablet:  columns-3, gap-4
Desktop: columns-3, gap-4   (not 4-col — events are mobile-first, desktop is secondary)
```

### Item insertion algorithm
```
renderedItems = []
phraseIndex = 0
for i, moment in moments:
  renderedItems.push(moment)
  if (i + 1) % 9 === 0 and phraseIndex < phrases.length:
    renderedItems.push({ type: 'phrase', text: phrases[phraseIndex++] })
```

---

## 5. Hero Section

```
[event decoration — subtle, themed]

  Boda de Ana & Luis          ← font-display serif, text-4xl mobile
  15 de febrero, 2026         ← text-sm text-gray-400, enters 100ms after title

      ── sus momentos ──      ← decorative line, expands from center 200ms after
```

- No gradient background — clean white/cream (`bg-white` or `bg-stone-50`)
- Entrance: `y: 16 → 0, opacity: 0 → 1`, spring
- Theme decoration (🌿 botanical for WEDDING, ✦ sparkles for QUINCEANERA, etc.) appears subtly flanking the title
- Removed: stat counters, icon pills

---

## 6. Memory Card Component

```
┌──────────────────────────────────┐
│  rotate: [-2°, 1°, -1°, 2°, 0°][index % 5]
│  bg: theme gradient (soft)       │
│  border: 1px theme-color/20      │
│  border-radius: 20px             │
│  padding: 24px 20px              │
│  margin: 4px (fits masonry col)  │
│                                  │
│  [micro-icon, 20px, animated]    │  🌿 WEDDING / ✦ QUINCEANERA / 🎉 BIRTHDAY
│                                  │
│  "Lo más bonito no es el         │  ← serif display, text-xl/2xl
│   vestido ni las flores —        │     typewriter animation on enter
│   es la mirada"                  │     color: theme accent, 80% opacity
│                                  │
└──────────────────────────────────┘
```

**Typewriter animation:** Character-by-character reveal, 18ms/char, starts when card enters viewport (IntersectionObserver). Feels like the phrase is being written in real time.

**Micro-icon animation:** `scale: 1 → 1.15 → 1`, 3s loop, easeInOut.

**Card enters with:** `scale: 0.97 → 1`, `opacity: 0 → 1`, spring physics, slight rotate snap.

---

## 7. Image Cards

### Placeholder (while loading)
- `div` with theme gradient (e.g., `from-amber-50 to-amber-100` for WEDDING)
- Shimmer sweep: `background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)` animates `translateX(-100% → 100%)`, 1.5s loop

### On load
- Cross-fade from placeholder to image: `opacity: 0 → 1`, 400ms ease

### Cascade entrance
```
index 0-3:  delay 0ms    (eager LCP, no animation delay)
index 4+:   delay min(index * 30ms, 240ms)
```
Motion: `y: 20 → 0, opacity: 0 → 1`, spring `{ stiffness: 300, damping: 25 }`

### Video cards
- Thumbnail from `thumbnail_url` (video frame from Lambda)
- Play icon overlay (centered, `bg-black/30`, blur backdrop)
- On tap → lightbox with video player

---

## 8. Lightbox (improvements over current)

- Backdrop: `bg-black/95` (same as current)
- Entry: `scale: 0.95 → 1 + opacity: 0 → 1`, 200ms spring
- Guest description: larger text, better typography (`text-base` not `text-sm`)
- Close button: 44×44px tap target (accessibility)
- Swipe: kept as-is (works well on mobile)
- Nav arrows: desktop only (kept)

---

## 9. Infinite Scroll + Page Cap

```
[...120 moments in DOM]
[sentinel div]  ← IntersectionObserver watches this
[end card]      ← shown when page === 4 or !hasMore
  "Estos son todos los momentos compartidos ✦"
```

- When sentinel enters viewport AND page < 4 AND hasMore → auto loadMore()
- When page === 4 OR !hasMore → show graceful end card (no spinner, no button)
- End card: centered text, theme color, subtle decoration

---

## 10. Files to create/modify

### Backend (Go — `itbem-events-backend`)
| Action | File |
|--------|------|
| Create | `migrations/YYYYMMDD_create_event_phrases.sql` |
| Create | `controllers/phrases/phrases.go` — GET handler |
| Modify | `routes/routes.go` — register public route |
| Create | `controllers/phrases/phrases_test.go` |

### Frontend (Astro — `cafetton-casero`)
| Action | File |
|--------|------|
| Modify | `src/components/moments/MomentsGallery.tsx` — full redesign |
| Modify | `src/components/moments/themes/index.ts` — add micro-icon + memory card gradient per theme |

---

## Definition of Done

- [ ] `event_phrases` table created + 100 wedding phrases seeded
- [ ] `GET /api/events/phrases` endpoint working with Redis cache
- [ ] Stats bar removed
- [ ] Comments marquee removed
- [ ] Hero redesigned (no stats, serif display, theme decoration)
- [ ] Masonry 2-col mobile / 3-col tablet
- [ ] IntersectionObserver per image (lazy, 200px threshold)
- [ ] First 4 images eager + fetchpriority=high
- [ ] Shimmer placeholder while loading
- [ ] Fade-in on image load
- [ ] Cascade entrance animations (30ms stagger, capped at 240ms)
- [ ] Memory cards every 9 photos
- [ ] Memory card typewriter animation on viewport enter
- [ ] Infinite scroll (auto, no button)
- [ ] Page cap at 120 items (4 pages)
- [ ] Graceful end card
- [ ] `content-visibility: auto` on cards
- [ ] TypeScript zero errors (`npx tsc --noEmit`)
