# Moments Wall E2E Testing — Design

## Goal
Full end-to-end test suite for the Moments Wall that runs against real backend + real public frontend (localhost:4321). Tests create a fresh event, upload a real photo as a guest, then verify every feature of the dashboard Moments Wall.

## Architecture
Single file: `tests/e2e/moments.spec.ts`
Sequential execution (fullyParallel: false already set).
Shares `eventId` and `eventIdentifier` across tests via module-level `let`.
Reuses existing `tests/e2e/.auth/session.json` auth state.

## Test image fixture
Small 10×10 px JPEG at `tests/e2e/fixtures/test-photo.jpg` (generated with sharp or embedded as base64).

## Upload URL
`http://localhost:4321/events/{identifier}/upload`
File input: `input[type="file"]` (sr-only, multiple).
Submit button: text "Compartir momento".
Success indicator: text "¡Momento compartido!".

## Flow
1. Create event → navigate to `/events/{id}`
2. Enable QR uploads (click toolbar button)
3. Capture `identifier` from URL
4. Open new Playwright page → `localhost:4321/events/{identifier}/upload`
5. `setInputFiles` on hidden file input + click submit
6. Wait for success screen
7. Back on dashboard → verify pending moment → approve → verify approved
8. Test: Fotos tab, multi-select, lightbox, ZIP dropdown, Por hora toggle
9. Cleanup: delete event via API (`request.delete`)

## Selectors strategy
- Prefer `getByRole`, `getByText`, `getByTitle` over CSS classes
- Tab buttons: `page.getByRole('tab', { name: 'Fotos' })`
- Toolbar buttons: `page.getByTitle('...')`
- Moment cards: `.group.aspect-square` (first card)
