# Styling, UX/UI & Animation Standards

Stack: Tailwind CSS v4 (CSS entry: `src/styles/tailwind.css`) · Motion (Framer successor) · `cn()` = clsx + tailwind-merge at `@/lib/utils`

## Theme (dark only)

| Token | Role |
|---|---|
| `zinc-950` | Page background |
| `zinc-900` | Card / sidebar |
| `zinc-800` | Borders, dividers, skeleton |
| `zinc-700` | Hover, muted borders |
| `zinc-400` | Secondary text, icons |
| `white / zinc-100` | Primary text |
| `indigo-500/600` | Brand action |
| `green-400/500` | Success, active, on-sale |
| `lime-400` | Positive numeric change (KPI stat cards) |
| `pink-400/500` | Error, inactive, negative |
| `amber-400` | Warning |

## Mobile-First (non-negotiable)

```tsx
// ✅ base = mobile, override = desktop
<div className="flex flex-col sm:flex-row gap-4">

// ❌ never desktop-first
<div className="flex flex-row max-sm:flex-col">
```

Breakpoints: `sm`=640 `md`=768 `lg`=1024 `xl`=1280

## Layout Patterns

**Page wrapper:**
```tsx
<div className="px-4 py-6 sm:px-6 lg:px-8">
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <h1 className="text-2xl font-semibold tracking-tight text-white">Title</h1>
    <Button color="indigo">Action</Button>
  </div>
  {/* content */}
</div>
```

**Card:** `rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6`

**Responsive table:** `block sm:hidden` stacked cards / `hidden sm:block` table

## Animations (Motion)

```tsx
import { motion, AnimatePresence } from 'motion/react'

// Page entrance — wrap page root element
<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>

// Staggered list items — add to each item
transition={{ delay: index * 0.04, duration: 0.25 }}
initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}

// Modal (wrap with AnimatePresence outside, motion.div inside)
initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18 }}

// Card hover
whileHover={{ scale: 1.01 }} transition={{ duration: 0.15 }}
```

Use Tailwind `transition-all duration-150` for simple hover states (no Motion needed).
Avoid layout animations on lists >100 items.

## Typography

| Element | Classes |
|---|---|
| Page title | `text-2xl font-semibold tracking-tight text-white` |
| Section title | `text-lg font-semibold text-white` |
| Card title | `text-sm font-medium text-white` |
| Body / primary | `text-sm text-zinc-100` |
| Secondary / hint | `text-sm text-zinc-400` |
| Caption / timestamp | `text-xs text-zinc-500` |
| Numeric/mono | `font-mono text-sm tabular-nums text-white` |

## Spacing

- Page padding: `px-4 sm:px-6 lg:px-8`
- Section gaps: `gap-6` or `gap-8`
- Form field gaps: `space-y-4`
- Card padding: `p-4 sm:p-6`

## Status Badges (consistent pattern — 10% opacity bg)

```tsx
<span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">Active</span>
<span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-xs font-medium text-pink-400">Inactive</span>
<span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">Closed</span>
<span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400">ROOT</span>
```

Or use the `<Badge color="green">` component from `src/components/badge.tsx`.

## Skeletons

```tsx
<div className="animate-pulse space-y-3">
  {Array.from({ length: 5 }).map((_, i) => (
    <div key={i} className="h-12 rounded-lg bg-zinc-800" />
  ))}
</div>
```
Always match skeleton shape to real content layout.

## Form UX

```tsx
<Button type="submit" color="indigo" disabled={isSubmitting}>
  {isSubmitting ? <><Spinner className="h-4 w-4 animate-spin" /> Saving...</> : 'Save'}
</Button>
```
Rules: inline Zod errors · disabled while submitting · `toast.success` on done · `toast.error` on fail · close modal on success
Use `Alert` (not `Dialog`) for destructive confirmations (delete).

## Icons

- Heroicons → navigation, actions (`h-5 w-5` buttons, `h-6 w-6` standalone)
- Lucide → shadcn/ui internal components only
- Icon-only: must have `aria-label` or `<span className="sr-only">`

## Accessibility

Focus rings: `focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-950`
Semantic HTML: `<nav>` `<main>` `<section>` `<button>`
Keyboard trapping in modals: Headless UI Dialog/Alert handle this automatically.
