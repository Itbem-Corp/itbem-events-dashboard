# Stable Event Slug Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent event slug from being zeroed on edit, and expose it as an editable field in the dashboard with a QR-safety warning.

**Architecture:** Two independent tasks. Task 1 fixes the backend data corruption (GORM `Select("*")` overwrites identifier with `""` when the PUT payload omits it). Task 2 adds the identifier field to the dashboard edit form so the admin can see and optionally change the slug with full awareness. No new endpoints. No DB migrations.

**Tech Stack:** Go 1.24 + GORM + Echo (backend) · Next.js 15 + React Hook Form + Zod (dashboard)

---

## Task 1: Backend — preserve identifier in UpdateEvent

**Files:**
- Modify: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\events\EventService.go` (~line 107)
- Test: `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\services\events\EventService_test.go` (check if file exists — create if not; add to existing file if it does)

### Context

`UpdateEvent` calls `s.repo.UpdateEvent(obj)` which ultimately runs:
```go
DB.Model(model).Where("id = ?", id).Select("*").Updates(model)
```
`Select("*")` forces zero values. When dashboard sends no `identifier`, GORM sets `identifier = ""`.

Current `UpdateEvent` service method (line ~107):
```go
func (s *EventService) UpdateEvent(obj *models.Event) error {
    if err := s.repo.UpdateEvent(obj); err != nil {
        return err
    }
    return s.cache.Invalidate("events", "all")
}
```

The service already has `s.GetEventByID(id)` available (returns `*models.Event`). Use it to restore the existing identifier when not provided.

### Step 1: Check for existing test file

```bash
ls /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend/services/events/
```

Note which test files already exist. If `EventService_test.go` exists, add to it. If not, create it.

### Step 2: Write the failing test

In the test file, add:

```go
package events_test

import (
    "testing"

    "events-stocks/models"
    "events-stocks/services/events"
    "github.com/gofrs/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
)

// mockEventsRepo satisfies ports.EventsRepository for unit testing.
type mockEventsRepo struct{ mock.Mock }

func (m *mockEventsRepo) CreateEvent(e *models.Event) error { return m.Called(e).Error(0) }
func (m *mockEventsRepo) UpdateEvent(e *models.Event) error { return m.Called(e).Error(0) }
func (m *mockEventsRepo) DeleteEvent(id uuid.UUID) error    { return m.Called(id).Error(0) }
func (m *mockEventsRepo) ListEvents(page, size int, name string) ([]models.Event, error) {
    args := m.Called(page, size, name)
    return args.Get(0).([]models.Event), args.Error(1)
}
func (m *mockEventsRepo) GetEventByID(id uuid.UUID) (string, error) {
    args := m.Called(id)
    return args.String(0), args.Error(1)
}
func (m *mockEventsRepo) IdentifierExists(identifier string) bool {
    return m.Called(identifier).Bool(0)
}

// mockCache satisfies ports.CacheRepository (minimal).
type mockCache struct{ mock.Mock }

func (m *mockCache) GetKey(ctx interface{}, key string) (string, error) {
    return "", nil
}
func (m *mockCache) SetKey(ctx interface{}, key string, val interface{}, ttl interface{}) error {
    return nil
}
func (m *mockCache) DeleteKeysByPattern(ctx interface{}, pattern string) error { return nil }
func (m *mockCache) Invalidate(keys ...string) error { return m.Called(keys).Error(0) }

func TestUpdateEvent_PreservesIdentifierWhenOmitted(t *testing.T) {
    repo := &mockEventsRepo{}
    cache := &mockCache{}
    svc := events.NewEventService(repo, cache)

    eventID, _ := uuid.NewV4()
    existingJSON := `[{"id":"` + eventID.String() + `","name":"Boda","identifier":"boda-andres-ivanna"}]`

    // Repo returns existing event with identifier set
    repo.On("GetEventByID", eventID).Return(existingJSON, nil)
    // Repo.UpdateEvent should be called with identifier preserved
    repo.On("UpdateEvent", mock.MatchedBy(func(e *models.Event) bool {
        return e.Identifier == "boda-andres-ivanna"
    })).Return(nil)
    cache.On(mock.Anything, mock.Anything).Return(nil)
    cache.On("Invalidate", mock.Anything).Return(nil)

    update := &models.Event{ID: eventID, Name: "Boda Editada"} // identifier omitted
    err := svc.UpdateEvent(update)

    assert.NoError(t, err)
    assert.Equal(t, "boda-andres-ivanna", update.Identifier)
    repo.AssertExpectations(t)
}

func TestUpdateEvent_AllowsExplicitIdentifierChange(t *testing.T) {
    repo := &mockEventsRepo{}
    cache := &mockCache{}
    svc := events.NewEventService(repo, cache)

    eventID, _ := uuid.NewV4()

    // When identifier is explicitly provided, it should NOT fetch existing
    repo.On("UpdateEvent", mock.MatchedBy(func(e *models.Event) bool {
        return e.Identifier == "nuevo-slug"
    })).Return(nil)
    cache.On("Invalidate", mock.Anything).Return(nil)

    update := &models.Event{ID: eventID, Name: "Boda", Identifier: "nuevo-slug"}
    err := svc.UpdateEvent(update)

    assert.NoError(t, err)
    // GetEventByID should NOT have been called since identifier was provided
    repo.AssertNotCalled(t, "GetEventByID", mock.Anything)
}
```

### Step 3: Run test to verify it fails

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./services/events/... -run "TestUpdateEvent_Preserves\|TestUpdateEvent_Allows" -v 2>&1 | tail -20
```

Expected: FAIL — `TestUpdateEvent_PreservesIdentifierWhenOmitted` fails because identifier is not being preserved.

### Step 4: Implement the fix

In `services/events/EventService.go`, replace `UpdateEvent` (line ~107):

```go
func (s *EventService) UpdateEvent(obj *models.Event) error {
    // If identifier was not provided in the update payload (empty string),
    // restore the existing identifier from DB to prevent GORM Select("*")
    // from zeroing it out and breaking distributed QR codes and links.
    if obj.Identifier == "" {
        existing, err := s.GetEventByID(obj.ID)
        if err == nil && existing != nil && existing.Identifier != "" {
            obj.Identifier = existing.Identifier
        }
    }
    if err := s.repo.UpdateEvent(obj); err != nil {
        return err
    }
    return s.cache.Invalidate("events", "all")
}
```

### Step 5: Run test to verify it passes

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go test ./services/events/... -run "TestUpdateEvent_Preserves\|TestUpdateEvent_Allows" -v 2>&1 | tail -20
```

Expected: both PASS.

### Step 6: Build check

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
go build ./... 2>&1
```

Expected: zero errors.

### Step 7: Commit

```bash
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git add services/events/EventService.go services/events/EventService_test.go
git commit -m "fix(events): preserve identifier in UpdateEvent when omitted — prevents QR code breakage"
```

---

## Task 2: Dashboard — editable slug field in EventFormModal

**Files:**
- Modify: `C:\Users\AndBe\Desktop\Projects\dashboard-ts\src\components\events\forms\event-form-modal.tsx`

### Context

The form currently has no `identifier` field. When `PUT /events/:id` fires, identifier is absent from the payload, triggering the GORM zero-value bug fixed in Task 1. Adding the field also gives admins visibility and control over the slug.

`identifier` is shown only in edit mode (`isEdit === true`). In create mode, the backend already auto-generates it from the name.

The Zod schema, defaultValues, useEffect reset, and UI all need updating.

### Step 1: Read the file

Read `src/components/events/forms/event-form-modal.tsx` completely. Understand:
- Where the `schema` object is defined (~line 48)
- Where `defaultValues` are set (~line 125)
- Where the `useEffect` reset populates edit values (~line 147)
- Where the `name` field is rendered in JSX (~line 231)

### Step 2: Add `identifier` to Zod schema

Find:
```ts
const schema = z.object({
    name:              z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
```

After `name`, add:
```ts
    identifier:        z.string()
                         .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones')
                         .min(3, 'Mínimo 3 caracteres')
                         .optional(),
```

### Step 3: Add to FormValues defaultValues

In `defaultValues` inside `useForm`:
```ts
defaultValues: {
    name:            '',
    // add:
    identifier:      '',
    ...
}
```

### Step 4: Add identifier to edit reset

In the `useEffect` that resets for edit mode (`if (isEdit && event)`), add:
```ts
reset({
    name:            event.name,
    // add:
    identifier:      event.identifier ?? '',
    ...
})
```

### Step 5: Add UI field (edit mode only)

After the `name` Field block in JSX, add:

```tsx
{/* Slug / URL del evento — solo en modo edición */}
{isEdit && (
    <Field>
        <Label>URL del evento (slug)</Label>
        <Description className="text-amber-600 text-xs font-medium">
            ⚠️ Cambiar esto romperá los QR codes y links ya distribuidos.
        </Description>
        <div className="mt-1 flex items-center gap-2">
            <span className="text-zinc-400 text-sm shrink-0 select-none">
                eventiapp.com.mx/e/
            </span>
            <Input
                {...register('identifier')}
                placeholder="mi-evento"
                className="font-mono text-sm"
            />
        </div>
        {errors.identifier && (
            <ErrorMessage>{errors.identifier.message}</ErrorMessage>
        )}
    </Field>
)}
```

### Step 6: TypeScript check

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
npx tsc --noEmit 2>&1
```

Expected: zero errors. The `identifier` field in the Zod schema is `optional()` so the existing `FormValues` type accepts it cleanly.

### Step 7: Commit

```bash
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git add src/components/events/forms/event-form-modal.tsx
git commit -m "feat(dashboard): editable slug field in EventFormModal — preserves QR codes with amber warning"
```

---

## Final: Push both projects

```bash
# Backend
cd /mnt/wsl.localhost/Ubuntu/var/www/itbem-events-backend
git push origin main

# Dashboard
cd /c/Users/AndBe/Desktop/Projects/dashboard-ts
git push origin main
```

---

## Summary

| Task | Project | Change |
|------|---------|--------|
| 1 | Backend | `UpdateEvent` restores identifier from DB when payload omits it |
| 2 | Dashboard | `EventFormModal` shows editable slug field in edit mode with amber QR warning |

**After this:** Changing event name → slug unchanged, QR codes safe. Admin can still change slug deliberately with full warning.
