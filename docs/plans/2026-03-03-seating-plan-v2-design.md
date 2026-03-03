# Design Doc — Seating Plan v2 (Grid + Mini Mapa)

**Date:** 2026-03-03
**Status:** Approved
**Projects affected:** itbem-events-backend (Go), dashboard-ts (Next.js)

---

## Problem

The seating plan frontend (SeatingPlanV2) is fully built with drag-and-drop, undo/redo, mobile bottom sheet, and batch save. However, the **backend has zero table infrastructure**: no `Table` model, no `table_id` on `Guest`, and no endpoints. The feature is 100% dead until the backend exists.

Additionally, the existing frontend lacks three high-value UX features:
1. Mini map — at-a-glance overview of all tables colored by fill %
2. Stats bar — total seated / capacity / unassigned counts
3. Auto-assign — one-click random assignment of unassigned guests
4. Print view — clean printable seating chart

---

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  TOOLBAR: [+ Mesa] [Undo] [Auto-asignar]  [Imprimir][Guardar]│
│           Stats: 120/200 sentados · 80 sin asignar           │
├──────────────────────────────────────────────────────────────┤
│  MINI MAPA (colapsable, Framer Motion)                        │
│  ○ ○ ○ ○ ○ ○ ○ ○ ○ ○  (circles colored by fill %)           │
│  M1 M2 M3 VIP ...                                            │
├────────────┬─────────────────────────────────────────────────┤
│ SIN ASIG.  │  GRID DE MESAS (2-3 col responsive)             │
│ (sidebar)  │  [TableCard] [TableCard] [TableCard]            │
│ 🔍 buscar  │  [TableCard] [TableCard] ...                    │
└────────────┴─────────────────────────────────────────────────┘
```

---

## Backend Changes (`itbem-events-backend`)

### New model: `models/Table.go`

```go
type Table struct {
    ID        uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
    EventID   uuid.UUID      `gorm:"type:uuid;index;not null" json:"event_id"`
    Name      string         `gorm:"type:varchar(100);not null" json:"name"`
    Capacity  int            `gorm:"not null;default:10" json:"capacity"`
    SortOrder int            `gorm:"not null;default:0" json:"sort_order"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
```

### Migration: `models/Table.go` + `guests.table_id`

Two DB changes via AutoMigrate (GORM):
1. `CREATE TABLE tables (...)` — from new Table model
2. `ALTER TABLE guests ADD COLUMN table_id UUID REFERENCES tables(id) ON DELETE SET NULL` — via GORM tag on Guest

### Guest model addition

Add to `models/Guest.go`:
```go
TableID *uuid.UUID `gorm:"type:uuid;index" json:"table_id,omitempty"`
Table   *Table     `gorm:"foreignKey:TableID" json:"-"`
```

### New endpoints

```
GET    /events/:id/tables          → []Table (sorted by sort_order)
POST   /events/:id/tables          → Table (create)
PUT    /tables/:id                 → Table (update name/capacity/sort_order)
DELETE /tables/:id                 → 204 (unassigns guests first via SET NULL)
PUT    /events/:id/tables/assign   → 200 (batch assign/unassign guests)
```

Batch assign payload:
```json
{
  "assignments": [
    { "guest_id": "uuid", "table_id": "uuid" },
    { "guest_id": "uuid", "table_id": null }
  ]
}
```

### File structure (backend)

```
models/Table.go                              ← new
controllers/tables/tables.go                 ← new (5 handlers)
services/tables/TableService.go              ← new
repositories/tablesrepository/TablesRepo.go  ← new
routes/routes.go                             ← add 5 routes
models/Guest.go                              ← add TableID field
```

---

## Frontend Changes (`dashboard-ts`)

### New component: `SeatingMiniMap`

File: `src/components/events/seating/seating-mini-map.tsx`

- Horizontal scrollable strip of circles (36px each)
- Each circle = one table, colored by fill %:
  - ⬜ gray: 0% (empty)
  - 🟢 green: 1–69%
  - 🟡 yellow: 70–89%
  - 🔴 red: ≥90%
- Shows table name below circle (truncated)
- Click → scrolls to corresponding TableCard with 500ms highlight ring
- Collapsible with `AnimatePresence` (chevron toggle)
- Default: expanded on `md+`, collapsed on mobile

### Stats bar

In `seating-toolbar.tsx`, add computed stats row below main toolbar:
```
120 sentados · 200 capacidad total · 80 sin asignar · 3 mesas
```
All derived from `guests`, `serverTables`, and pending `assignments` state.

### Auto-assign button

In toolbar: "Auto-asignar" button (only shown when `unassignedGuests.length > 0 && availableTables.length > 0`).

Algorithm:
1. Sort unassigned guests by `guests_count` desc (place large parties first)
2. For each guest: find table with most remaining capacity that fits `guests_count`
3. Dispatch `ASSIGN_GUEST` for each — goes into pending state (not saved until user clicks Guardar)

### Print view

`window.print()` + `@media print` CSS: hide sidebar/toolbar/mini-map, render clean two-column table list with guest names. Button in toolbar.

---

## Definition of Done

- [ ] `GET /events/:id/tables` returns tables sorted by sort_order
- [ ] `POST /events/:id/tables` creates table, persists to DB
- [ ] `PUT /tables/:id` updates name/capacity
- [ ] `DELETE /tables/:id` auto-unassigns guests (SET NULL), then deletes
- [ ] `PUT /events/:id/tables/assign` batch-updates guest.table_id
- [ ] DB migrations run cleanly (AutoMigrate)
- [ ] `go build ./...` zero errors
- [ ] `go test ./...` passes
- [ ] Mini map renders, colors correct, click scrolls to card
- [ ] Stats bar shows correct counts including pending changes
- [ ] Auto-assign fills tables correctly, respects capacity
- [ ] Print button opens clean print view
- [ ] `npx tsc --noEmit` zero errors in dashboard-ts
- [ ] Existing drag-and-drop + undo/redo + batch save still works end-to-end
