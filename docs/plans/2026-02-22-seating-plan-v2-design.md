# Seating Plan v2 — Grid Interactivo con Drag & Drop

**Fecha:** 2026-02-22
**Estado:** Aprobado

## Resumen

Rediseño completo del apartado de mesas del dashboard. Reemplaza el SeatingPlan actual (edición inline de `table_number` como string) por un sistema interactivo con drag-and-drop, modelo Table en backend, batch save, y UX adaptada a mobile/tablet/desktop.

## Decisiones de diseño

| Decisión | Elección |
|----------|----------|
| Visualización | Grid de mesas con drag-and-drop |
| Backend | Nuevo modelo Table con endpoints CRUD |
| Drag & Drop | dnd-kit (@dnd-kit/core + sortable) |
| Mobile UX | Bottom sheet + tap (sin drag en mobile) |
| Estética | Cards con progress ring de capacidad |
| Persistencia | Batch save — cambios locales hasta confirmar |

## Modelo de datos

### Table (nuevo)

```
Table {
  id: string
  event_id: string
  name: string        // "Mesa 1", "VIP", "Familia Novia"
  capacity: number    // max guests (ej: 8, 10, 12)
  sort_order: number  // orden visual
}
```

### Guest (cambio)

- `table_number: string` se reemplaza por `table_id: string | null` (referencia a Table)

### Endpoints nuevos

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/events/:id/tables` | Lista mesas del evento |
| POST | `/events/:id/tables` | Crear mesa |
| PUT | `/tables/:id` | Editar mesa (nombre, capacidad) |
| DELETE | `/tables/:id` | Eliminar mesa |
| PUT | `/events/:id/tables/assign` | Batch assign: `{ assignments: [{guest_id, table_id}] }` |

## Layout Desktop/Tablet (>=768px)

```
┌──────────────────────────────────────────────────────────┐
│ Mesas  [+ Nueva Mesa]  [Guardar cambios (3)]  [Deshacer]│
├────────────┬─────────────────────────────────────────────┤
│ Sin mesa   │  ┌─Mesa 1─────────┐  ┌─Mesa 2─────────┐   │
│ ──────────│  │ Familia Novio  │  │ Familia Novia  │   │
│ 🔍 Buscar │  │ ╭──╮           │  │ ╭──╮           │   │
│            │  │ │6/8│ ████░░ 75%│  │ │3/8│ ███░░░ 38%│   │
│ ┌────────┐ │  │ ╰──╯           │  │ ╰──╯           │   │
│ │ Ana  ✓ │ │  │ ● Carlos  ✓ +1│  │ ● Pedro   ~    │   │
│ │ Luis ~ │ │  │ ● Maria   ✓   │  │ ● Sofia   ✓    │   │
│ │ Diego ✗│ │  │ ● Juan    ~   │  │ ● Elena   ✓    │   │
│ └────────┘ │  │ ○ (vacío)     │  │ ○ ○ ○ ○ ○      │   │
│            │  │ ○ (vacío)     │  │                 │   │
│            │  │ [⚙ Editar]    │  │ [⚙ Editar]     │   │
│            │  └────────────────┘  └────────────────┘   │
│            │                                            │
│            │  ┌─Mesa 3─────────┐  ┌─Mesa 4─────────┐   │
│            │  │ Amigos         │  │ Trabajo         │   │
│            │  │ ...            │  │ ...             │   │
├────────────┴─────────────────────────────────────────────┤
│ 3 cambios sin guardar           [Guardar] [Descartar]   │
└──────────────────────────────────────────────────────────┘
```

- Panel izquierdo fijo: invitados sin mesa, con buscador
- Grid derecho scrollable: mesas en grid responsive (2-3 cols)
- Drag: arrastrar invitado del panel a mesa, o entre mesas
- Drop zone: mesas con highlight indigo al arrastrar encima
- Barra inferior sticky: cambios pendientes + Guardar/Descartar

## Layout Mobile (<768px)

```
┌─────────────────────┐
│ Mesas  [+ Nueva]    │
│ [Guardar (3)]       │
├─────────────────────┤
│ ▼ Sin mesa (5)      │
│ ┌─────────────────┐ │
│ │ Ana ✓   [Asignar]│ │
│ │ Luis ~  [Asignar]│ │
│ └─────────────────┘ │
├─────────────────────┤
│ Mesa 1 · Familia    │
│ ╭──╮ ████████░░ 6/8 │
│ ● Carlos ✓ +1      │
│ ● Maria  ✓   [↔]   │
│ ● Juan   ~   [↔]   │
├─────────────────────┤
│ Mesa 2 · Amigos     │
│ ...                 │
└─────────────────────┘

[Toca "Asignar"]
        ↓
┌─────────────────────┐
│ ═══ (handle)        │
│ Asignar Ana a:      │
│ ○ Mesa 1 (6/8)      │
│ ○ Mesa 2 (3/8)      │
│ ○ Mesa 3 (0/8)      │
│ [+ Crear nueva mesa]│
│ [Cancelar]          │
└─────────────────────┘
```

- Cards apiladas verticalmente
- Botón "Asignar" / "Mover" [↔] por invitado
- Bottom sheet animado (Framer Motion) con lista de mesas
- Sin drag-and-drop en mobile

## Interacciones

| Acción | Desktop/Tablet | Mobile |
|--------|---------------|--------|
| Asignar invitado a mesa | Drag & drop | Tap → bottom sheet |
| Mover entre mesas | Drag & drop | Tap mover → bottom sheet |
| Quitar de mesa | Drag al panel "sin mesa" | Tap mover → "Quitar de mesa" |
| Crear mesa | Modal (nombre + capacidad) | Mismo modal |
| Editar mesa | Inline edit en card header | Tap → edita |
| Eliminar mesa | Menu contextual en card | Menu contextual |
| Guardar todo | Click "Guardar" (barra inferior) | Botón sticky top |
| Deshacer | Ctrl+Z o botón | Botón |

## Estado local y Batch Save

Cero requests hasta confirmar.

```typescript
// Estado local en React
{
  pendingAssignments: Map<string, string | null>  // guest_id → table_id
  pendingTableChanges: {
    created: Table[]
    updated: Table[]
    deleted: string[]
  }
}
```

Flujo de guardado:
1. Crear mesas nuevas (`POST /events/:id/tables` por cada una)
2. Actualizar mesas editadas (`PUT /tables/:id` por cada una)
3. Batch assign (`PUT /events/:id/tables/assign`)
4. Eliminar mesas (`DELETE /tables/:id` por cada una)
5. Mutate SWR cache

"Descartar" resetea al estado original del SWR cache.

## Componentes

```
src/components/events/seating/
├── seating-plan-v2.tsx        // Orquestador principal (DndContext)
├── table-card.tsx             // Card de mesa con progress ring
├── guest-chip.tsx             // Invitado draggable (nombre + status)
├── unassigned-panel.tsx       // Panel lateral "sin mesa"
├── table-form-modal.tsx       // Modal crear/editar mesa
├── assign-bottom-sheet.tsx    // Bottom sheet mobile
├── capacity-ring.tsx          // SVG progress ring
└── seating-toolbar.tsx        // Barra acciones + cambios pendientes
```

## Dependencias nuevas

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`

(Framer Motion ya está instalado para animaciones y bottom sheet)

## Migración

- El componente actual `seating-plan.tsx` se reemplaza por `seating-plan-v2.tsx`
- El campo `guest.table_number` migra a `guest.table_id`
- La pestaña "Mesas" en el event detail page apunta al nuevo componente
- CSV import/export se actualiza para usar nombres de mesa en lugar de table_number
