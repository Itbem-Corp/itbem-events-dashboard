# Templates — Dashboard

> Copy-paste starting points for every common pattern in this codebase.
> Read this before writing any new component, model, hook, or page.
> Last updated: 2026-02-23

---

## 1. TypeScript Model

```typescript
// src/models/YourModel.ts
import { BaseEntity } from "./BaseEntity";

export interface YourModel extends BaseEntity {
  // Required fields — snake_case to match Go JSON tags
  event_id: string;
  name: string;

  // Optional fields
  description?: string;
  is_active?: boolean;
  order?: number;
}
```

**Rules:**
- Always extend `BaseEntity` (provides `id`, `created_at`, `updated_at`, `deleted_at`)
- snake_case field names — the response normalizer converts PascalCase automatically
- Export the interface; import it wherever SWR or the API is used

---

## 2. SWR Data Fetching Hook (inline, inside component)

```typescript
'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { YourModel } from '@/models/YourModel'

// Inside the component:
const { data, error, isLoading } = useSWR<YourModel[]>(
  eventId ? `/your-endpoint?event_id=${eventId}` : null,  // null = skip fetch
  fetcher,
  { refreshInterval: 15000 }  // only for live data (moments wall, check-in, etc.)
)
```

**Rules:**
- Use `null` key when the required param is not yet available — SWR skips the fetch
- Only use `refreshInterval` when real-time updates matter
- `fetcher` automatically unwraps `{ success, message, data }` envelopes via `r.data?.data ?? r.data`
- Type the SWR call: `useSWR<YourModel[]>` — never use `any`

---

## 3. SWR Mutation (write + revalidate)

```typescript
import { mutate } from 'swr'
import { api } from '@/lib/api'
import { toast } from 'sonner'

async function handleSave() {
  try {
    await api.post('/your-endpoint', { field: value })
    await mutate(`/your-endpoint?event_id=${eventId}`)  // revalidate after write
    toast.success('Guardado')
  } catch {
    toast.error('Error al guardar')
  }
}
```

---

## 4. Feature Component (full template)

```typescript
// src/components/events/YourFeature.tsx
'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { motion, AnimatePresence } from 'motion/react'
import { fetcher } from '@/lib/fetcher'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import type { YourModel } from '@/models/YourModel'
import { SomeIcon } from '@heroicons/react/24/outline'

interface Props {
  eventId: string
}

export function YourFeature({ eventId }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data = [], isLoading, error } = useSWR<YourModel[]>(
    eventId ? `/your-endpoint?event_id=${eventId}` : null,
    fetcher
  )

  async function handleAction() {
    setIsSubmitting(true)
    try {
      await api.post('/your-endpoint', { event_id: eventId })
      await mutate(`/your-endpoint?event_id=${eventId}`)
      toast.success('Acción completada')
    } catch {
      toast.error('Error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-zinc-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={SomeIcon} title="Error al cargar" description="Intenta de nuevo" />
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={SomeIcon}
        title="Sin resultados"
        description="Aún no hay elementos aquí."
        action={{ label: 'Agregar', onClick: handleAction }}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Heading>Your Feature</Heading>
        <Button onClick={handleAction} disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Acción'}
        </Button>
      </div>

      <AnimatePresence mode="popLayout">
        {data.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="p-4 rounded-lg bg-zinc-900 border border-white/10"
          >
            {item.name}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
```

---

## 5. Page (protected route)

```typescript
// src/app/(app)/your-route/page.tsx
'use client'

import { PageTransition } from '@/components/ui/page-transition'
import { Heading } from '@/components/heading'
import { YourFeature } from '@/components/events/YourFeature'

export default function YourPage() {
  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Heading>Your Page</Heading>
        <YourFeature eventId="..." />
      </div>
    </PageTransition>
  )
}
```

**Rules:**
- File at `src/app/(app)/your-route/page.tsx` — auto-protected by middleware
- Add nav link in `src/components/sidebar.tsx` or `application-layout.tsx`
- Dynamic params: `const { id } = useParams()` inside the component (App Router)

---

## 6. Page with dynamic params

```typescript
// src/app/(app)/events/[id]/your-tab/page.tsx
'use client'

import { useParams } from 'next/navigation'
import { YourFeature } from '@/components/events/YourFeature'

export default function YourTabPage() {
  const { id } = useParams<{ id: string }>()

  return <YourFeature eventId={id} />
}
```

---

## 7. Modal form

```typescript
// src/components/events/forms/YourFormModal.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/components/dialog'
import { Button } from '@/components/button'
import { Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { mutate } from 'swr'

interface Props {
  eventId: string
  open: boolean
  onClose: () => void
  initialData?: { name: string }
}

export function YourFormModal({ eventId, open, onClose, initialData }: Props) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await api.post('/your-endpoint', { event_id: eventId, name })
      await mutate(`/your-endpoint?event_id=${eventId}`)
      toast.success('Guardado')
      onClose()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Agregar</DialogTitle>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
```

---

## 8. Unit Test

```typescript
// tests/unit/components/YourFeature.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { YourFeature } from '@/components/events/YourFeature'

// Mock SWR to return controlled data
vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  mutate: vi.fn(),
}))

describe('YourFeature', () => {
  it('renders empty state when no data', () => {
    render(<YourFeature eventId="test-id" />)
    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
  })

  it('renders items when data is present', async () => {
    const useSWR = await import('swr')
    vi.mocked(useSWR.default).mockReturnValue({
      data: [{ id: '1', name: 'Test Item', created_at: '', updated_at: '' }],
      isLoading: false,
      error: null,
    } as any)

    render(<YourFeature eventId="test-id" />)
    expect(screen.getByText('Test Item')).toBeInTheDocument()
  })
})
```

---

## 9. EmptyState usage

```typescript
import { EmptyState } from '@/components/ui/empty-state'
import { PhotoIcon } from '@heroicons/react/24/outline'

// Without action
<EmptyState
  icon={PhotoIcon}
  title="Sin fotos"
  description="Los invitados aún no han subido fotos."
/>

// With action button
<EmptyState
  icon={PhotoIcon}
  title="Sin fotos"
  description="Los invitados aún no han subido fotos."
  action={{ label: 'Subir foto', onClick: handleUpload }}
/>
```

---

## 10. Skeleton loading pattern

```typescript
// 3-item skeleton
if (isLoading) {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 rounded-lg bg-zinc-800 animate-pulse" />
      ))}
    </div>
  )
}
```

---

## 11. Data flow (reminder)

```
SWR hook → fetcher(url) → api.get(url) → Axios instance
  ↓ request interceptor: attach Authorization: Bearer
  ↓ response interceptor: normalizeKeys (PascalCase → snake_case)
  ↓ fetcher unwraps: r.data?.data ?? r.data
  ↓ component receives typed YourModel[]
```

---

## 12. Animation patterns (motion/react)

```typescript
// Page/list entrance
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.2 }}

// Exit / removal
exit={{ opacity: 0, scale: 0.96 }}

// Always wrap list with AnimatePresence mode="popLayout" for smooth add/remove
<AnimatePresence mode="popLayout">
  {items.map(item => <motion.div key={item.id} layout ...>)}
</AnimatePresence>

// Modal/dialog entrance
initial={{ opacity: 0, scale: 0.96 }}
animate={{ opacity: 1, scale: 1 }}
transition={{ duration: 0.15 }}
```

**Import:** `import { motion, AnimatePresence } from 'motion/react'` (not `framer-motion`)
