# MomentsWall UX Redesign — Design Document

**Date:** 2026-02-24
**Goal:** Fix all bugs in the MomentsWall section and deliver top-tier UX/UI improvements: video playback, QR download quality, notes visibility, QR open-link button, toolbar reorganization.

**Approach:** Surgical fixes + targeted polish. Keep the existing grid/card/lightbox/modal architecture intact — add, fix, and polish without structural rewrites.

---

## Bug Fixes

### 1. Video playback blocked by CSP
**Root cause:** `next.config.mjs` CSP is missing `media-src`. When `media-src` is absent, browsers fall back to `default-src 'self'`, which blocks all S3 video URLs. The `<video>` element silently fails.
**Fix:** Add `media-src 'self' blob: ${awsSources}` to the CSP. Also add `us-east-2` to `awsSources` since the bucket is in Ohio.
**File:** `next.config.mjs`

### 2. QR download missing logo
**Root cause:** The hidden `QRCodeCanvas` used for hi-res PNG generation doesn't have `imageSettings`, so the downloaded PNG has no center logo even though the visible QR does.
**Fix:** Add `imageSettings` to `QRCodeCanvas` with the same pink eventiapp SVG logo. Increase `downloadSize` to `1200` for sharper output.
**File:** `src/components/ui/branded-qr.tsx`

### 3. Lightbox download uses direct fetch (CORS risk)
**Root cause:** `handleDownload` in the `Lightbox` component calls `fetch(url)` directly on the presigned S3 URL. This can fail due to CORS if the dashboard origin isn't in S3's CORS policy, and it bypasses auth on large files.
**Fix:** Replace with `api.get('/moments/${moment.id}/download', { responseType: 'blob' })` — the same backend proxy used for ZIP downloads.
**File:** `src/components/events/moments-wall.tsx` (Lightbox component)

---

## QR Modal Improvements

Both `QRModal` and `WallShareModal` need:
- **"Abrir enlace" button** — opens the URL in a new tab (`target="_blank" rel="noopener noreferrer"`), styled with `ArrowTopRightOnSquareIcon`. Placed above the "Copiar enlace" button.
- **Eventiapp pink logo** in QR center — copy `cafetton-casero/public/favicon.svg` to `dashboard-ts/public/eventiapp-icon.svg`, reference as `/eventiapp-icon.svg` in `BrandedQR`'s `imageSettings`.

The `WallShareModal` also gets a second QR for the upload link (it currently only shows the wall QR but lists both links). The two QR codes get tabs: "Ver muro" / "Subir fotos", switching which QR is displayed.

---

## Notes / Description Visibility

The `description` field (guest's note at upload time) is invisible unless there's no media on the card. Changes:

**On the card:**
When `moment.description` is present AND the card has media, show a small speech-bubble chip at the bottom-left of the card (overlays the gradient, above the action bar). Truncated to 1 line with a `ChatBubbleOvalLeftIcon` icon prefix.

**In the lightbox:**
Below the media, if `description` is present, show it in a styled block: semi-transparent dark pill, italic text, full text (not truncated).

---

## Toolbar Reorganization

Current state: ~8 small buttons in 2 disorganized rows.
New layout (3 clear rows with consistent styling):

**Row 1 — Content actions:**
`[{N} momentos en total] [pendientes badge] [errores badge]` → spacer → `[ZIP download] [Aprobar todos]` → `[auto-refresh indicator]`

**Row 2 — Sharing & settings:**
`[QR subida toggle] [Publicar muro toggle]` → separator → `[Compartir muro button]` → `[QR de subida button (conditional)]`

**Row 3 — Filters:**
`Todos | Pendientes | Aprobados | Errores` (full width, unchanged)

Visual changes:
- `border-b border-white/5` divider between rows
- Consistent `rounded-lg border border-white/10` button style
- "Sharing" row gets a subtle left border accent to visually separate settings from content actions

---

## Files Changed

| File | Change |
|------|--------|
| `next.config.mjs` | Add `media-src`, add `us-east-2` to awsSources |
| `src/components/ui/branded-qr.tsx` | Add `imageSettings` to `QRCodeCanvas`, increase `downloadSize`, use `/eventiapp-icon.svg` |
| `src/components/events/moments-wall.tsx` | Fix lightbox download, add notes chip on cards + in lightbox, add "Abrir" buttons to QR modals, add tabs to WallShareModal, reorganize toolbar |
| `public/eventiapp-icon.svg` | Copy from cafetton-casero/public/favicon.svg |

---

## Out of Scope
- Backend changes (not required — all fixes are frontend)
- Replacing the grid layout or card design structure
- Adding pagination (existing component handles this)
