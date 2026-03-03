# Seating Plan v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the fully-built SeatingPlanV2 frontend to a new backend (Table model, 5 endpoints, batch assign), then add SeatingMiniMap, stats bar, auto-assign, and print view.

**Architecture:** Backend-first (Tasks 1–6 in itbem-events-backend), then frontend enhancements (Tasks 7–9 in dashboard-ts). Backend uses the standard pattern: model → port interface → repository → service → controller → routes → server.go DI. Frontend adds one new component and enhances the existing toolbar and main orchestrator.

**Tech Stack:** Go 1.24 + GORM + Echo (backend) · Next.js 15 + React + @dnd-kit + Framer Motion (dashboard)

---

## Task 1: Table model + Guest.TableID + AutoMigrate registration

**Files:**
- Create: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\models\Table.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\models\Guest.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\configuration\gorm.go`

### Step 1: Create Table model

Create `models/Table.go`:

```go
package models

import (
	"github.com/gofrs/uuid"
	"gorm.io/gorm"
	"time"
)

type Table struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	EventID   uuid.UUID      `gorm:"type:uuid;index;not null" json:"event_id"`
	Name      string         `gorm:"type:varchar(100);not null" json:"name" validate:"required,min=1,max=100"`
	Capacity  int            `gorm:"not null;default:10" json:"capacity" validate:"required,min=1,max=500"`
	SortOrder int            `gorm:"not null;default:0" json:"sort_order"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
```

### Step 2: Add TableID to Guest model

In `models/Guest.go`, after `RSVPGuestCount` and before `DietaryRestrictions`, add:

```go
TableID *uuid.UUID `gorm:"type:uuid;index" json:"table_id,omitempty"`
```

### Step 3: Register Table in AutoMigrate

In `configuration/gorm.go`, in the `GetAllModels()` function, add `&models.Table{}` to the slice. Find the line `&models.Guest{},` and add after it:

```go
&models.Table{},
```

### Step 4: Build check

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
```

Expected: zero errors. GORM will run `CREATE TABLE tables` and `ALTER TABLE guests ADD COLUMN table_id` on next startup.

### Step 5: Commit

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add models/Table.go models/Guest.go configuration/gorm.go
git commit -m "feat(tables): Table model + Guest.TableID — DB migration via AutoMigrate"
```

---

## Task 2: TableRepository + port interface

**Files:**
- Create: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\repositories\tablerepository\TableRepository.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\ports\ports.go`

### Step 1: Add TableRepository interface to ports.go

In `services/ports/ports.go`, after the `GuestRepository` interface, add:

```go
// TableRepository is the data access contract for Table records.
type TableRepository interface {
	ListByEventID(eventID uuid.UUID) ([]models.Table, error)
	Create(table *models.Table) error
	Update(table *models.Table) error
	Delete(id uuid.UUID) error
	GetByID(id uuid.UUID) (*models.Table, error)
	BatchAssign(assignments []dtos.SeatAssignment) error
}
```

### Step 2: Add SeatAssignment DTO

In `dtos/` directory, check if a `seating.go` file exists. If not, create `dtos/seating.go`:

```go
package dtos

type SeatAssignment struct {
	GuestID string  `json:"guest_id"`
	TableID *string `json:"table_id"` // nil = unassign
}

type BatchAssignRequest struct {
	Assignments []SeatAssignment `json:"assignments"`
}
```

### Step 3: Create TableRepository

Create `repositories/tablerepository/TableRepository.go`:

```go
package tablerepository

import (
	"events-stocks/configuration"
	"events-stocks/dtos"
	"events-stocks/models"
	"github.com/gofrs/uuid"
)

type TableRepo struct{}

func NewTableRepo() *TableRepo { return &TableRepo{} }

func (r *TableRepo) ListByEventID(eventID uuid.UUID) ([]models.Table, error) {
	var tables []models.Table
	err := configuration.DB.
		Where("event_id = ?", eventID).
		Order("sort_order ASC, created_at ASC").
		Find(&tables).Error
	return tables, err
}

func (r *TableRepo) Create(table *models.Table) error {
	return configuration.DB.Create(table).Error
}

func (r *TableRepo) Update(table *models.Table) error {
	return configuration.DB.
		Model(table).
		Where("id = ?", table.ID).
		Select("name", "capacity", "sort_order").
		Updates(table).Error
}

func (r *TableRepo) Delete(id uuid.UUID) error {
	// Unassign guests first (SET NULL), then hard-delete table
	if err := configuration.DB.
		Model(&models.Guest{}).
		Where("table_id = ?", id).
		Update("table_id", nil).Error; err != nil {
		return err
	}
	return configuration.DB.Where("id = ?", id).Delete(&models.Table{}).Error
}

func (r *TableRepo) GetByID(id uuid.UUID) (*models.Table, error) {
	var table models.Table
	err := configuration.DB.Where("id = ?", id).First(&table).Error
	return &table, err
}

func (r *TableRepo) BatchAssign(assignments []dtos.SeatAssignment) error {
	for _, a := range assignments {
		guestID, err := uuid.FromString(a.GuestID)
		if err != nil {
			continue
		}
		update := configuration.DB.Model(&models.Guest{}).Where("id = ?", guestID)
		if a.TableID == nil {
			update = update.Update("table_id", nil)
		} else {
			tableID, err := uuid.FromString(*a.TableID)
			if err != nil {
				continue
			}
			update = update.Update("table_id", tableID)
		}
		if err := update.Error; err != nil {
			return err
		}
	}
	return nil
}
```

### Step 4: Build check

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
```

Expected: zero errors.

### Step 5: Commit

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add repositories/tablerepository/TableRepository.go services/ports/ports.go dtos/seating.go
git commit -m "feat(tables): TableRepository + port interface + SeatAssignment DTO"
```

---

## Task 3: TableService

**Files:**
- Create: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\tables\TableService.go`
- Test: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\tables\table_service_test.go`

### Step 1: Write the failing test

Create `services/tables/table_service_test.go`:

```go
package tables_test

import (
	"testing"

	"events-stocks/dtos"
	"events-stocks/models"
	"events-stocks/services/tables"
	"github.com/gofrs/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type mockTableRepo struct{ mock.Mock }

func (m *mockTableRepo) ListByEventID(id uuid.UUID) ([]models.Table, error) {
	args := m.Called(id)
	return args.Get(0).([]models.Table), args.Error(1)
}
func (m *mockTableRepo) Create(t *models.Table) error  { return m.Called(t).Error(0) }
func (m *mockTableRepo) Update(t *models.Table) error  { return m.Called(t).Error(0) }
func (m *mockTableRepo) Delete(id uuid.UUID) error     { return m.Called(id).Error(0) }
func (m *mockTableRepo) GetByID(id uuid.UUID) (*models.Table, error) {
	args := m.Called(id)
	return args.Get(0).(*models.Table), args.Error(1)
}
func (m *mockTableRepo) BatchAssign(a []dtos.SeatAssignment) error { return m.Called(a).Error(0) }

func TestListByEventID_ReturnsTablesFromRepo(t *testing.T) {
	repo := &mockTableRepo{}
	svc := tables.NewTableService(repo)

	eventID, _ := uuid.NewV4()
	expected := []models.Table{{Name: "Mesa 1", Capacity: 10}}
	repo.On("ListByEventID", eventID).Return(expected, nil)

	result, err := svc.ListByEventID(eventID)

	assert.NoError(t, err)
	assert.Equal(t, expected, result)
	repo.AssertExpectations(t)
}

func TestCreate_SetsEventIDAndCallsRepo(t *testing.T) {
	repo := &mockTableRepo{}
	svc := tables.NewTableService(repo)

	eventID, _ := uuid.NewV4()
	table := &models.Table{Name: "VIP", Capacity: 8}
	repo.On("Create", mock.MatchedBy(func(t *models.Table) bool {
		return t.EventID == eventID && t.Name == "VIP"
	})).Return(nil)

	err := svc.Create(eventID, table)

	assert.NoError(t, err)
	assert.Equal(t, eventID, table.EventID)
	repo.AssertExpectations(t)
}

func TestBatchAssign_DelegatestoRepo(t *testing.T) {
	repo := &mockTableRepo{}
	svc := tables.NewTableService(repo)

	tid := "some-table-id"
	assignments := []dtos.SeatAssignment{
		{GuestID: "guest-1", TableID: &tid},
		{GuestID: "guest-2", TableID: nil},
	}
	repo.On("BatchAssign", assignments).Return(nil)

	err := svc.BatchAssign(assignments)
	assert.NoError(t, err)
	repo.AssertExpectations(t)
}
```

### Step 2: Run test to verify it fails

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./services/tables/... -v 2>&1 | tail -20
```

Expected: FAIL — package does not exist yet.

### Step 3: Create TableService

Create `services/tables/TableService.go`:

```go
package tables

import (
	"events-stocks/dtos"
	"events-stocks/models"
	"events-stocks/services/ports"
	"github.com/gofrs/uuid"
)

type TableService struct {
	repo ports.TableRepository
}

func NewTableService(repo ports.TableRepository) *TableService {
	return &TableService{repo: repo}
}

func (s *TableService) ListByEventID(eventID uuid.UUID) ([]models.Table, error) {
	return s.repo.ListByEventID(eventID)
}

func (s *TableService) Create(eventID uuid.UUID, table *models.Table) error {
	table.EventID = eventID
	return s.repo.Create(table)
}

func (s *TableService) Update(table *models.Table) error {
	return s.repo.Update(table)
}

func (s *TableService) Delete(id uuid.UUID) error {
	return s.repo.Delete(id)
}

func (s *TableService) GetByID(id uuid.UUID) (*models.Table, error) {
	return s.repo.GetByID(id)
}

func (s *TableService) BatchAssign(assignments []dtos.SeatAssignment) error {
	return s.repo.BatchAssign(assignments)
}
```

### Step 4: Run test to verify it passes

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./services/tables/... -v 2>&1 | tail -20
```

Expected: all 3 tests PASS.

### Step 5: Commit

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add services/tables/TableService.go services/tables/table_service_test.go
git commit -m "feat(tables): TableService + unit tests"
```

---

## Task 4: Tables controller (5 handlers)

**Files:**
- Create: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\controllers\tables\tables.go`

### Step 1: Create tables controller

Create `controllers/tables/tables.go`:

```go
package tables

import (
	"events-stocks/dtos"
	"events-stocks/models"
	tablesService "events-stocks/services/tables"
	"events-stocks/utils"
	"github.com/gofrs/uuid"
	"github.com/labstack/echo/v4"
	"net/http"
)

var tableSvc *tablesService.TableService

func InitTablesController(svc *tablesService.TableService) { tableSvc = svc }

// GET /events/:id/tables
func ListTables(c echo.Context) error {
	eventID, err := uuid.FromString(c.Param("id"))
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid event ID", err.Error())
	}
	tables, err := tableSvc.ListByEventID(eventID)
	if err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error listing tables", err.Error())
	}
	return utils.Success(c, http.StatusOK, "Tables loaded", tables)
}

// POST /events/:id/tables
func CreateTable(c echo.Context) error {
	eventID, err := uuid.FromString(c.Param("id"))
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid event ID", err.Error())
	}
	var table models.Table
	if err := c.Bind(&table); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if table.Name == "" {
		return utils.Error(c, http.StatusBadRequest, "Table name is required", "")
	}
	if table.Capacity <= 0 {
		table.Capacity = 10
	}
	if err := tableSvc.Create(eventID, &table); err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error creating table", err.Error())
	}
	return utils.Success(c, http.StatusCreated, "Table created", table)
}

// PUT /tables/:id
func UpdateTable(c echo.Context) error {
	tableID, err := uuid.FromString(c.Param("id"))
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid table ID", err.Error())
	}
	var table models.Table
	if err := c.Bind(&table); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	table.ID = tableID
	if err := tableSvc.Update(&table); err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error updating table", err.Error())
	}
	return utils.Success(c, http.StatusOK, "Table updated", table)
}

// DELETE /tables/:id
func DeleteTable(c echo.Context) error {
	tableID, err := uuid.FromString(c.Param("id"))
	if err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid table ID", err.Error())
	}
	if err := tableSvc.Delete(tableID); err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error deleting table", err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

// PUT /events/:id/tables/assign
func BatchAssign(c echo.Context) error {
	var req dtos.BatchAssignRequest
	if err := c.Bind(&req); err != nil {
		return utils.Error(c, http.StatusBadRequest, "Invalid request body", err.Error())
	}
	if len(req.Assignments) == 0 {
		return utils.Success(c, http.StatusOK, "No assignments to process", nil)
	}
	if err := tableSvc.BatchAssign(req.Assignments); err != nil {
		return utils.Error(c, http.StatusInternalServerError, "Error assigning guests", err.Error())
	}
	return utils.Success(c, http.StatusOK, "Guests assigned", nil)
}
```

### Step 2: Build check

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
```

Expected: zero errors.

### Step 3: Commit

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add controllers/tables/tables.go
git commit -m "feat(tables): tables controller — 5 handlers (list, create, update, delete, batch-assign)"
```

---

## Task 5: Wire DI in server.go + register routes

**Files:**
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\server.go`
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\routes\routes.go`

### Step 1: Wire in server.go

In `server.go`, add imports for the new table packages alongside the existing imports. Find the import block that has `guestrepository "events-stocks/repositories/guestrepository"` and add:

```go
tablerepository "events-stocks/repositories/tablerepository"
tablesController "events-stocks/controllers/tables"
tablesService "events-stocks/services/tables"
```

Find where `guestRepo` and `guestSvc` are instantiated and add after them:

```go
tableRepo := tablerepository.NewTableRepo()
tableSvc  := tablesService.NewTableService(tableRepo)
```

Find where `guestsController.InitGuestsController(guestSvc)` is called and add after it:

```go
tablesController.InitTablesController(tableSvc)
```

### Step 2: Register routes in routes.go

In `routes/routes.go`, find the guests routes block and add the table routes after it. Find:
```go
protected.GET("/guests/:key", guests.GetGuests)
```

After the guests block, add:

```go
// ── Tables ────────────────────────────────────
protected.GET("/events/:id/tables", tables.ListTables)
protected.POST("/events/:id/tables", tables.CreateTable)
protected.PUT("/events/:id/tables/assign", tables.BatchAssign) // must be before /tables/:id
protected.PUT("/tables/:id", tables.UpdateTable)
protected.DELETE("/tables/:id", tables.DeleteTable)
```

Add the import at the top of routes.go:
```go
tables "events-stocks/controllers/tables"
```

### Step 3: Build check

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./...
```

Expected: zero errors.

### Step 4: Full test run

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./... 2>&1 | tail -20
```

Expected: all tests pass including the new tables service tests.

### Step 5: Commit

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add server.go routes/routes.go
git commit -m "feat(tables): wire DI + register 5 table routes"
```

---

## Task 6: Backend push + smoke test

### Step 1: Push backend to main

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git push origin main
```

### Step 2: Verify AutoMigrate ran

After the backend restarts, check that the `tables` table exists and `guests.table_id` column was added:

```bash
# From WSL
psql $DATABASE_URL -c "\d tables" 2>/dev/null || echo "Check via backend logs"
```

If you can't access psql directly, check backend startup logs for AutoMigrate output. No errors = migration succeeded.

---

## Task 7: SeatingMiniMap component

**Files:**
- Create: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\seating\seating-mini-map.tsx`
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\seating\index.ts`

### Step 1: Create SeatingMiniMap

Create `src/components/events/seating/seating-mini-map.tsx`:

```tsx
'use client'

import { useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import type { Table } from '@/models/Table'

interface Props {
  tables: Table[]
  occupancy: Map<string, number>   // table_id → seated count (including +1s)
  isOpen: boolean
  onToggle: () => void
  onTableClick: (tableId: string) => void
}

function fillColor(filled: number, capacity: number): string {
  if (capacity === 0 || filled === 0) return 'bg-zinc-700 border-zinc-600'
  const pct = filled / capacity
  if (pct >= 0.9) return 'bg-red-500/80 border-red-400'
  if (pct >= 0.7) return 'bg-amber-400/80 border-amber-300'
  return 'bg-emerald-500/80 border-emerald-400'
}

function fillTextColor(filled: number, capacity: number): string {
  if (capacity === 0 || filled === 0) return 'text-zinc-500'
  const pct = filled / capacity
  if (pct >= 0.9) return 'text-red-300'
  if (pct >= 0.7) return 'text-amber-300'
  return 'text-emerald-300'
}

export function SeatingMiniMap({ tables, occupancy, isOpen, onToggle, onTableClick }: Props) {
  if (tables.length === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span className="font-medium tracking-wide uppercase text-[10px]">
          Vista general — {tables.length} mesa{tables.length !== 1 ? 's' : ''}
        </span>
        <ChevronDownIcon
          className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Map body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 overflow-x-auto">
              <div className="flex gap-3 min-w-0 flex-wrap">
                {tables.map((table) => {
                  const seated = occupancy.get(table.id) ?? 0
                  const pct = table.capacity > 0 ? Math.round((seated / table.capacity) * 100) : 0
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => onTableClick(table.id)}
                      className="flex flex-col items-center gap-1 group"
                      title={`${table.name}: ${seated}/${table.capacity}`}
                    >
                      {/* Circle */}
                      <div
                        className={`
                          size-9 rounded-full border-2 flex items-center justify-center
                          text-[10px] font-bold text-white transition-all duration-150
                          group-hover:scale-110 group-hover:shadow-lg
                          ${fillColor(seated, table.capacity)}
                        `}
                      >
                        {pct}%
                      </div>
                      {/* Label */}
                      <span
                        className={`text-[10px] max-w-[52px] truncate leading-tight ${fillTextColor(seated, table.capacity)}`}
                      >
                        {table.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

### Step 2: Export from index.ts

In `src/components/events/seating/index.ts`, add:

```ts
export { SeatingMiniMap } from './seating-mini-map'
```

### Step 3: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit 2>&1
```

Expected: zero errors.

### Step 4: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/seating/seating-mini-map.tsx src/components/events/seating/index.ts
git commit -m "feat(seating): SeatingMiniMap — collapsible overview strip with fill-% color circles"
```

---

## Task 8: Wire SeatingMiniMap + stats bar + auto-assign into SeatingPlanV2

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\seating\seating-plan-v2.tsx`
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\seating\seating-toolbar.tsx`

### Step 1: Update SeatingToolbar props + auto-assign button + print button

Replace the full content of `seating-toolbar.tsx` with:

```tsx
'use client'

import { motion, AnimatePresence } from 'motion/react'
import { PlusIcon, ArrowUturnLeftIcon, SparklesIcon, PrinterIcon } from '@heroicons/react/20/solid'
import { Button } from '@/components/button'

interface SeatingToolbarProps {
  pendingCount: number
  canUndo: boolean
  saving: boolean
  canAutoAssign: boolean
  onCreateTable: () => void
  onSave: () => void
  onDiscard: () => void
  onUndo: () => void
  onAutoAssign: () => void
  onPrint: () => void
  // Stats
  totalSeated: number
  totalCapacity: number
  unassignedCount: number
  tableCount: number
}

export function SeatingToolbar({
  pendingCount,
  canUndo,
  saving,
  canAutoAssign,
  onCreateTable,
  onSave,
  onDiscard,
  onUndo,
  onAutoAssign,
  onPrint,
  totalSeated,
  totalCapacity,
  unassignedCount,
  tableCount,
}: SeatingToolbarProps) {
  return (
    <>
      <div className="space-y-3 print:hidden">
        {/* Action row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button onClick={onCreateTable}>
              <PlusIcon className="size-4" />
              Nueva Mesa
            </Button>
            {canUndo && (
              <Button plain onClick={onUndo}>
                <ArrowUturnLeftIcon className="size-4" />
                <span className="hidden sm:inline">Deshacer</span>
              </Button>
            )}
            {canAutoAssign && (
              <Button plain onClick={onAutoAssign} title="Asignar invitados sin mesa automáticamente">
                <SparklesIcon className="size-4" />
                <span className="hidden sm:inline">Auto-asignar</span>
              </Button>
            )}
            <Button plain onClick={onPrint} title="Imprimir plan de mesas">
              <PrinterIcon className="size-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
          </div>

          {pendingCount > 0 && (
            <div className="hidden md:flex items-center gap-2">
              <Button plain onClick={onDiscard}>Descartar</Button>
              <Button onClick={onSave} disabled={saving}>
                {saving ? 'Guardando…' : `Guardar cambios (${pendingCount})`}
              </Button>
            </div>
          )}
        </div>

        {/* Stats row */}
        {tableCount > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-1.5">
              <span className="text-zinc-500">Mesas </span>
              <span className="font-bold text-zinc-200">{tableCount}</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-1.5">
              <span className="text-zinc-500">Capacidad </span>
              <span className="font-bold text-zinc-200">{totalCapacity}</span>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
              <span className="text-emerald-400">Sentados </span>
              <span className="font-bold text-emerald-300">{totalSeated}</span>
            </div>
            {unassignedCount > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
                <span className="text-amber-400">Sin mesa </span>
                <span className="font-bold text-amber-300">{unassignedCount}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile sticky save bar */}
      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-white/10 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between md:hidden print:hidden"
          >
            <span className="text-xs text-zinc-400">
              {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
            </span>
            <div className="flex items-center gap-2">
              <Button plain onClick={onDiscard} className="text-xs">Descartar</Button>
              <Button onClick={onSave} disabled={saving} className="text-xs">
                {saving ? '…' : 'Guardar'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
```

### Step 2: Update seating-plan-v2.tsx

In `seating-plan-v2.tsx`, make the following changes:

**A. Add imports at the top** (after existing imports):

```tsx
import { SeatingMiniMap } from './seating-mini-map'
import { useRef } from 'react'
```

(Replace the existing `import { useState, useMemo, useCallback } from 'react'` with `import { useState, useMemo, useCallback, useRef } from 'react'`)

**B. Add mini-map state** (after `const [unassignedOpen, setUnassignedOpen] = useState(false)`):

```tsx
const [miniMapOpen, setMiniMapOpen] = useState(true)
const tableRefs = useRef<Map<string, HTMLDivElement>>(new Map())
```

**C. Add auto-assign handler** (after `handleSave`):

```tsx
const handleAutoAssign = useCallback(() => {
  const unassigned = [...unassignedGuests].sort(
    (a, b) => (b.guests_count ?? 1) - (a.guests_count ?? 1),
  )
  for (const guest of unassigned) {
    // Find table with most remaining capacity that fits this guest's party
    const partySize = guest.guests_count ?? 1
    let bestTable: { id: string; remaining: number } | null = null
    for (const table of seating.tables) {
      const seated = tableOccupancy.get(table.id) ?? 0
      const remaining = table.capacity - seated
      if (remaining >= partySize) {
        if (!bestTable || remaining > bestTable.remaining) {
          bestTable = { id: table.id, remaining }
        }
      }
    }
    if (bestTable) {
      seating.assignGuest(guest.id, bestTable.id)
    }
  }
}, [unassignedGuests, seating, tableOccupancy])
```

**D. Add handleTableFocus** (after `handleAutoAssign`):

```tsx
const handleMiniMapTableClick = useCallback((tableId: string) => {
  const el = tableRefs.current.get(tableId)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-violet-400', 'ring-offset-2', 'ring-offset-zinc-950')
    setTimeout(() => {
      el.classList.remove('ring-2', 'ring-violet-400', 'ring-offset-2', 'ring-offset-zinc-950')
    }, 1500)
  }
}, [])
```

**E. Compute stats** (add inside the existing `useMemo` that returns `tableGuests, unassignedGuests, tableOccupancy`, expanding the return):

After the existing useMemo, add a new derived value block:

```tsx
const totalSeated = useMemo(
  () => Array.from(tableOccupancy.values()).reduce((sum, n) => sum + n, 0),
  [tableOccupancy],
)
const totalCapacity = useMemo(
  () => seating.tables.reduce((sum, t) => sum + t.capacity, 0),
  [seating.tables],
)
```

**F. Add print handler** (after `handleMiniMapTableClick`):

```tsx
const handlePrint = useCallback(() => window.print(), [])
```

**G. Update SeatingToolbar JSX** — replace the existing `<SeatingToolbar ...>` call with:

```tsx
<SeatingToolbar
  pendingCount={seating.pendingChangeCount}
  canUndo={seating.canUndo}
  saving={saving}
  canAutoAssign={unassignedGuests.length > 0 && seating.tables.length > 0}
  onCreateTable={() => setTableModal({ open: true, table: null })}
  onSave={handleSave}
  onDiscard={seating.reset}
  onUndo={seating.undo}
  onAutoAssign={handleAutoAssign}
  onPrint={handlePrint}
  totalSeated={totalSeated}
  totalCapacity={totalCapacity}
  unassignedCount={unassignedGuests.length}
  tableCount={seating.tables.length}
/>
```

**H. Add SeatingMiniMap** — after `<SeatingToolbar>`, before the stats block:

```tsx
<SeatingMiniMap
  tables={seating.tables}
  occupancy={tableOccupancy}
  isOpen={miniMapOpen}
  onToggle={() => setMiniMapOpen((v) => !v)}
  onTableClick={handleMiniMapTableClick}
/>
```

**I. Remove the old stats block** — delete the existing `<div className="flex flex-wrap gap-3 text-xs">` block (3 items: Mesas, Con mesa, Sin mesa) since it's now in the toolbar.

**J. Add ref to TableCard** — in the grid render, change each `<TableCard>` wrapper:

Replace:
```tsx
{seating.tables.map((table, i) => (
  <TableCard
    key={table.id}
    ...
  />
))}
```

With:
```tsx
{seating.tables.map((table, i) => (
  <div
    key={table.id}
    ref={(el) => {
      if (el) tableRefs.current.set(table.id, el)
      else tableRefs.current.delete(table.id)
    }}
    className="transition-all duration-300"
  >
    <TableCard
      table={table}
      guests={tableGuests.get(table.id) ?? []}
      onEdit={(t) => setTableModal({ open: true, table: t })}
      onDelete={(id) => seating.deleteTable(id)}
      onMobileAssign={(guest) => setBottomSheet({ open: true, guest })}
      index={i}
    />
  </div>
))}
```

### Step 3: Add print styles to global CSS

In `src/app/globals.css` (or wherever global styles live), add at the end:

```css
@media print {
  .print\:hidden { display: none !important; }
  body { background: white !important; color: black !important; }
}
```

> **Note:** Tailwind's `print:hidden` utility should already handle this if Tailwind is configured with print variant. If `npx tsc --noEmit` passes and the build works, the print CSS is handled by Tailwind automatically.

### Step 4: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit 2>&1
```

Expected: zero errors.

### Step 5: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/seating/seating-plan-v2.tsx src/components/events/seating/seating-toolbar.tsx
git commit -m "feat(seating): wire SeatingMiniMap + stats bar + auto-assign + print into SeatingPlanV2"
```

---

## Task 9: Guest model — expose table_id in dashboard + final checks

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\models\Guest.ts`

### Step 1: Verify table_id is in Guest interface

Read `src/models/Guest.ts`. Check if `table_id` field exists. If not, add it after `guests_count`:

```ts
table_id?: string | null   // FK to Table (null = unassigned)
```

The `useSeatingState` hook already reads `guest.table_id` from server data — this field must exist in the TS interface to avoid type errors.

### Step 2: Full TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit 2>&1
```

Expected: zero errors.

### Step 3: Build check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npm run build 2>&1 | tail -20
```

Expected: successful build.

### Step 4: Commit + push

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/models/Guest.ts
git commit -m "feat(seating): add table_id to Guest model — completes seating plan v2 end-to-end"
git push origin main
```

---

## Summary

| Task | Project | What |
|------|---------|------|
| 1 | Backend | Table model + Guest.TableID + AutoMigrate |
| 2 | Backend | TableRepository + port interface + DTO |
| 3 | Backend | TableService + unit tests |
| 4 | Backend | Tables controller (5 handlers) |
| 5 | Backend | Wire DI in server.go + register routes |
| 6 | Backend | Push + verify migration |
| 7 | Dashboard | SeatingMiniMap component |
| 8 | Dashboard | Wire MiniMap + stats + auto-assign + print |
| 9 | Dashboard | Verify Guest.table_id type + build + push |
