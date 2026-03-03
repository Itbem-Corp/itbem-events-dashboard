# Design Doc — Stable Event Slug

**Date:** 2026-03-03
**Status:** Approved
**Projects affected:** itbem-events-backend (Go), dashboard-ts (Next.js)

---

## Problem

`gormrepository.Update` uses `Select("*").Updates(model)` — this overwrites ALL fields including zero values. The `EventFormModal` never sends `identifier` in the PUT payload, so GORM sets `identifier = ""` on every event save. Old QR codes and invitation links break silently.

**Root cause chain:**
1. Form submits `PUT /events/:id` without `identifier` field
2. GORM binds body → `event.Identifier = ""`
3. `Select("*")` forces `UPDATE events SET identifier = '' WHERE id = ?`
4. Old URL `/e/bodaAndresIvanna` → 404

---

## Solution

**Pattern: WordPress/Shopify slug stability**

| Moment | Slug behavior |
|--------|--------------|
| New event | Auto-generated from name (existing behavior ✓) |
| Edit name | Slug does NOT change — stays fixed |
| Edit slug manually | Allowed, with explicit warning in UI |

---

## Backend changes (`itbem-events-backend`)

**File:** `services/events/EventService.go` — `UpdateEvent`

If `obj.Identifier == ""`, fetch the existing event's identifier from DB and restore it before calling `repo.UpdateEvent`. This prevents GORM from zeroing the field when the dashboard doesn't send it.

```go
func (s *EventService) UpdateEvent(obj *models.Event) error {
    if obj.Identifier == "" {
        existing, err := s.repo.GetEventByID(obj.ID)
        if err == nil && existing != nil {
            obj.Identifier = existing.Identifier
        }
    }
    if err := s.repo.UpdateEvent(obj); err != nil {
        return err
    }
    return s.cache.Invalidate("events", "all")
}
```

**No new endpoint needed. No schema migration needed.**

---

## Dashboard changes (`dashboard-ts`)

**File:** `src/components/events/forms/event-form-modal.tsx`

### Zod schema — add identifier field

```ts
identifier: z.string()
  .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones')
  .min(3, 'Mínimo 3 caracteres')
  .optional(),
```

### Form default values (edit mode)

Pre-fill with `event.identifier`:
```ts
identifier: event.identifier ?? '',
```

### New UI field (edit mode only)

Show after the `name` field, only when `isEdit`:

```tsx
{isEdit && (
  <Field>
    <Label>URL del evento (slug)</Label>
    <Description className="text-amber-600 text-xs">
      ⚠️ Cambiar esto romperá los QR codes y links ya distribuidos.
    </Description>
    <div className="flex items-center gap-2">
      <span className="text-zinc-400 text-sm shrink-0">eventiapp.com.mx/e/</span>
      <Input {...register('identifier')} placeholder="mi-evento" />
    </div>
    {errors.identifier && <ErrorMessage>{errors.identifier.message}</ErrorMessage>}
  </Field>
)}
```

### PUT payload

`identifier` is now included in `payload` (comes from form data naturally).

---

## Definition of Done

- [ ] Changing event name does NOT change identifier in DB
- [ ] PUT /events/:id with no identifier in body → identifier preserved (not zeroed)
- [ ] PUT /events/:id with explicit identifier → identifier updated to that value
- [ ] Edit form shows current slug, editable, with amber warning
- [ ] `npx tsc --noEmit` zero errors in dashboard-ts
- [ ] `go build ./...` zero errors in backend
- [ ] `go test ./services/events/...` passes
