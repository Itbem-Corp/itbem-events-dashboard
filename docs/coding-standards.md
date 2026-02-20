# Coding Standards

## TypeScript

- Strict mode — no `any` (use `unknown`)
- `interface` for object shapes / model payloads; `type` for unions & utilities
- All domain models in `src/models/` — never inline complex types in components
- Generic constraints: `<T extends BaseEntity>`

## Naming

| Element | Convention |
|---|---|
| Components, interfaces | PascalCase |
| Hooks | `useFeatureName.ts` |
| Utils, handlers | camelCase |
| Constants | `UPPER_SNAKE` |
| API endpoints | kebab-case (`/event-members`) |

## File Structure

```
src/app/(app)/feature/
  page.tsx             # list page ('use client')
  [id]/page.tsx        # detail page

src/components/feature/
  FeatureForm.tsx      # create/edit (shared)
  FeatureCard.tsx      # list item
  DeleteModal.tsx      # Alert-based confirm (not Dialog)
  forms/               # complex form subcomponents if needed
```

## Component Rules

- `'use client'` on **all** `(app)` pages — no exceptions
- Props interface named `[Component]Props` at top of file
- One component per file; no server-only imports in client components
- No `React.FC` — use explicit return type or none

## React Patterns

**Data fetching** — always SWR with null guard, never `useEffect`:
```tsx
const { data, isLoading, mutate } = useSWR<Model[]>(
  dep ? `/endpoint?id=${dep.id}` : null, fetcher
)
```

**Async mutation handler** — always `isSubmitting` + `try/catch/finally`:
```tsx
const [isSubmitting, setIsSubmitting] = useState(false)
const handle = async (payload: Payload) => {
  try {
    setIsSubmitting(true)
    await api.post('/resource', payload)
    mutate()
    toast.success('Done')
    setModal({ type: null, target: null })
  } catch {
    toast.error('Failed')
  } finally {
    setIsSubmitting(false)
  }
}
```

**Modal state** — grouped into one useState:
```tsx
const [modal, setModal] = useState<{
  type: 'create' | 'edit' | 'delete' | null
  target: Model | null
}>({ type: null, target: null })
```

## Forms

```tsx
const schema = z.object({ name: z.string().min(1), email: z.email() })
type FormValues = z.infer<typeof schema>

const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: editTarget ?? { name: '', email: '' },
})
```

## File Uploads (FormData)

When a form includes a file (logo, avatar), send as `FormData` not JSON:
```tsx
const formData = new FormData()
formData.append('name', data.name)
if (file) formData.append('logo', file)
await api.post('/clients', formData)  // axios sets Content-Type automatically
```

## Dialog vs Alert

- `<Dialog>` — for create/edit forms
- `<Alert>` — for destructive actions (delete confirmations) — never use Dialog for deletes

## Code Style (Prettier enforced)

```
printWidth: 120  |  semi: false  |  singleQuote: true  |  trailingComma: 'es5'
```

Tailwind class order sorted automatically by Prettier plugin (functions: `clsx`, `tw`).

## Error Handling Hierarchy

1. HTTP 401 → Axios interceptor auto-logout (no component handling needed)
2. API errors → `toast.error()` in catch block
3. SWR errors → `{ error }` destructure → render error state in UI
4. Form errors → Zod inline display via `errors.field?.message`

## Import Order (auto-sorted by Prettier plugin)

1. React / Next.js
2. Third-party packages
3. `@/` aliases
4. Relative imports

## Do Not

- `useEffect` for data fetching — use SWR
- `useState` for remote data — use SWR + `mutate()`
- `console.log` in committed code
- Import `@/app/*` inside `@/components/*` (unidirectional)
- One-off utility files — colocate helpers with their usage
- `Dialog` for delete confirmations — use `Alert`

## Path Aliases

`@/components` `@/lib` `@/models` `@/store` `@/utils` `@/app` → all resolve from `src/`
