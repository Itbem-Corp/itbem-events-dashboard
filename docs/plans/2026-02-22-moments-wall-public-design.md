# Public Moments Wall — Design Document

**Date:** 2026-02-22
**Status:** Approved

## Goal

Build a public, beautifully themed moments gallery page in the Astro project (`/events/{identifier}/moments`) that displays approved photos/videos with guest comments. Modify the existing upload page to show a "thank you" screen when the wall is published.

## Architecture

### New Page: `/events/{identifier}/moments`

- **File:** `src/pages/events/[identifier]/moments.astro` (Astro shell)
- **Component:** `src/components/MomentsGallery.tsx` (React, `client:only="react"`)
- **Prerender:** `false` (dynamic route)
- **Redirect:** Add `/events/*/moments /events/moments 200` to `public/_redirects`

### Data Flow

1. Astro page passes `EVENTS_URL` prop to React component
2. React extracts `identifier` from `window.location.pathname`
3. Parallel fetches:
   - `GET /api/events/{identifier}/moments?page=1&limit=50` — approved moments
   - `GET /api/events/{identifier}/page-spec` — event meta (title, date, design template, colors, event type)
4. If `moments_wall_published === false` → show "Coming soon" animation
5. If `true` → render gallery

### Backend Requirements

- New field on Event model: `moments_wall_published: boolean` (default `false`)
- This field should be included in the moments endpoint response or in the page-spec meta
- Dashboard sends `PUT /events/{id}` with `moments_wall_published: true` to publish

### Upload Page Modification

- On load, check `moments_wall_published` from moments endpoint response
- If `true` → replace uploader with "Thank You" screen
- "Thank You" screen links to `/events/{identifier}/moments`

## Visual Design

### Theming System (Dual Source)

**Source 1 — Event Type** (decorations, icons, font feel):

| Type | Style | Decorations | Font |
|------|-------|-------------|------|
| Wedding | Elegant, gold, minimal | Botanical leaves SVG, subtle rings, fine lines | Serif (Bigilla/Playfair) |
| Graduation | Formal, navy/blue | Cap, subtle confetti | Sans-serif bold |
| Birthday | Colorful, fun | Animated confetti, balloons | Rounded/friendly |
| Corporate | Clean, professional | Geometric lines | Sans-serif minimal |
| Quinceañera | Pink/gold, glamour | Flowers, crown, sparkles | Elegant serif |
| Default | Modern, neutral | Soft gradients | System font |

**Source 2 — Color Palette** (from design template configured in dashboard):

Colors (PRIMARY, SECONDARY, BACKGROUND) applied as CSS custom properties over the event-type base theme.

### Page Layout

```
┌──────────────────────────────────────┐
│  HERO HEADER (fade-in)               │
│  "Los momentos de [Event Name]"      │
│  Themed decorations + date           │
├──────────────────────────────────────┤
│  STATS BAR (animated counters)       │
│  📸 24 fotos  🎬 3 videos  💬 12    │
├──────────────────────────────────────┤
│  MASONRY GRID (stagger animation)    │
│  Responsive: 2 cols → 3 → 4         │
│  Cards with hover overlay showing    │
│  comment/description                 │
│  Video cards with play icon          │
│  Click opens lightbox                │
│         [Load more...]               │
├──────────────────────────────────────┤
│  COMMENTS MARQUEE (infinite scroll)  │
│  "Felicidades!" → "Los amo" → ...   │
├──────────────────────────────────────┤
│  FOOTER                              │
│  "Gracias por ser parte de este día" │
│  Themed decorations                  │
└──────────────────────────────────────┘
```

### Components

1. **HeroHeader** — Event title with themed animated decorations. Gradient background using palette colors. Fade-in + slide-up entry.

2. **StatsBar** — Animated count-up counters for photos, videos, and comments. Themed icons.

3. **MasonryGrid** — CSS columns (`columns-2 sm:columns-3 lg:columns-4`). Each card appears with stagger animation (fadeIn + scale 0.95→1). Photos show hover overlay with comment. Videos show play icon overlay. Click opens lightbox.

4. **Lightbox** — Fullscreen with touch swipe navigation. Shows photo/video large + comment below with slide-up animation. Keyboard navigation (arrows, Escape). Backdrop blur.

5. **CommentsMarquee** — Infinite horizontal scroll with best comments/descriptions. Elegant themed font. Only shown if comments exist.

6. **ThemeFooter** — Closing message with event-type decorations.

### Animations (Framer Motion)

- Hero: `fadeIn` + `slideUp` with spring physics
- Stats: `countUp` animated (0 → actual number)
- Grid cards: `staggerChildren` with `fadeIn + scale(0.95→1)`
- Lightbox: `scale(0→1)` with backdrop blur transition
- Marquee: CSS `@keyframes marquee` infinite
- Decorations: Subtle `float` (2-3px up/down)

## "Thank You" Screen (Upload Page)

When `moments_wall_published === true`:

```
┌──────────────────────────────────────┐
│         ✨ (sparkle animation)       │
│                                      │
│    Gracias por compartir tus         │
│    mejores momentos con nosotros     │
│                                      │
│    [Event Name]                      │
│    [Event Date]                      │
│                                      │
│    Estamos muy agradecidos de        │
│    que hayas sido parte de este      │
│    día tan especial                  │
│                                      │
│    [Ver el muro de momentos →]       │
│                                      │
│    💐 Themed decorations 💐          │
└──────────────────────────────────────┘
```

- Sequential fade-in (title → message → button)
- Floating sparkles/particles (CSS keyframes)
- Event-type themed decorations
- Button links to `/events/{identifier}/moments`

## Dashboard Integration

In the Momentos tab of the event detail page:
- Toggle/button: "Publicar muro de momentos"
- Sends `PUT /events/{id}` with `moments_wall_published: true`
- This closes upload access and opens the wall

## File Structure (Astro Project)

```
src/
├── pages/events/[identifier]/moments.astro    # New Astro shell
├── components/
│   ├── MomentsGallery.tsx                     # Main gallery orchestrator
│   ├── moments/
│   │   ├── HeroHeader.tsx                     # Themed hero with title
│   │   ├── StatsBar.tsx                       # Animated counters
│   │   ├── MasonryGrid.tsx                    # Photo/video grid
│   │   ├── MomentCard.tsx                     # Individual card
│   │   ├── GalleryLightbox.tsx                # Fullscreen viewer
│   │   ├── CommentsMarquee.tsx                # Scrolling comments
│   │   ├── ThemeFooter.tsx                    # Closing section
│   │   ├── ThankYouScreen.tsx                 # Upload page replacement
│   │   └── themes/
│   │       ├── index.ts                       # Theme registry + CSS var injector
│   │       ├── wedding.ts                     # Wedding decorations + style
│   │       ├── graduation.ts                  # Graduation style
│   │       ├── birthday.ts                    # Birthday style
│   │       ├── quinceanera.ts                 # Quinceañera style
│   │       ├── corporate.ts                   # Corporate style
│   │       └── default.ts                     # Fallback
│   └── SharedUploadPage.tsx                   # Modified: check published flag
```

## API Contract

### Moments Endpoint (existing, may need extension)

`GET /api/events/{identifier}/moments?page=1&limit=50`

Response needs to include:
```json
{
  "data": {
    "items": [...],
    "total": 27,
    "has_more": false,
    "moments_wall_published": true,
    "event_name": "Boda Ana & Carlos",
    "event_type": "wedding",
    "event_date": "2026-03-15T18:00:00Z"
  }
}
```

### Page Spec (existing)

Already includes `meta.pageTitle`, `meta.identifier`, `meta.eventId`. May need to add `event_type` and `color_palette` to meta if not already present.
