# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 admin dashboard for event management, written in TypeScript. Administrators use it to manage events, review and approve guest-uploaded moments (photos and videos), view analytics, manage guest lists, and generate QR codes for the public-facing event upload pages. Data is fetched from a Go backend using SWR with automatic polling for live data. Authentication is handled by AWS Cognito. Core dependencies include SWR for data fetching, Tailwind CSS for styling, HeroIcons, Framer Motion for transitions, Recharts for analytics charts, and JSZip for bulk image downloads.

## Development Commands

```bash
# Install dependencies
npm install

# Start local dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run Vitest unit tests
npm run test

# Run Vitest in watch mode
npm run test:watch
```

## Architecture

### Data Fetching

All data fetching uses **SWR** (`swr`) with an Axios-based fetcher defined in `src/lib/fetcher.ts`. The Axios client in `src/lib/api.ts` attaches the Cognito `Authorization: Bearer` header to every request automatically.

Pattern used across components:
```typescript
const { data, error, isLoading } = useSWR<ApiResponse>(
  '/endpoint',
  fetcher,
  { refreshInterval: 15000 } // 15-second polling for live data
);
```

Use `refreshInterval` on any component where real-time updates matter (e.g., MomentsWall, guest check-in status).

### Authentication

All pages under `src/app/(app)/` are protected by Cognito auth middleware configured in Next.js middleware (`middleware.ts`). Unauthenticated requests are redirected to the login page. The Axios client in `src/lib/api.ts` reads the session token and includes it in the `Authorization` header.

Do not add unauthenticated pages inside the `(app)` route group.

### Component Patterns

- **Page components** live in `src/app/(app)/` and are Next.js App Router pages. They are responsible for layout and passing route params to child components.
- **Feature components** live in `src/components/events/` and contain the business logic (data fetching, filtering, user interactions) for event-specific features.
- **Shared UI components** live in `src/components/ui/` and are generic, reusable, and stateless where possible (e.g., `EmptyState`).
- **TypeScript models** live in `src/models/` and define the shape of all backend data structures.

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Axios client instance with `Authorization` header; base URL from `NEXT_PUBLIC_BACKEND_URL` |
| `src/lib/fetcher.ts` | SWR fetcher function that calls `api.ts` |
| `src/models/Moment.ts` | Moment (photo/video upload) interface |
| `src/models/Guest.ts` | Guest interface |
| `src/models/Event.ts` | Event interface |
| `src/app/(app)/` | Protected App Router pages (events list, event detail with tabs) |
| `src/components/events/MomentsWall.tsx` | Moments management: filter tabs, lightbox viewer, QR modal, ZIP download, 15s auto-refresh |
| `src/components/ui/EmptyState.tsx` | Generic empty state UI component |
| `vitest.config.ts` | Vitest test configuration |
| `tests/unit/components/` | Vitest + React Testing Library unit tests |
| `.env.example` | Example environment variable file |

### Moment Model

The `Moment` interface in `src/models/Moment.ts` includes:
```typescript
interface Moment {
  // ... id, event_id, guest_id, etc.
  content_url: string;              // URL to the uploaded file (image or video)
  description: string;              // Optional guest-provided caption
  is_approved: boolean;             // Manual approval status
  processing_status: '' | 'pending' | 'processing' | 'done' | 'failed';
}
```

`processing_status` drives the status badge display in the MomentsWall. Videos go through backend processing; `'done'` means the video is ready to play.

### MomentsWall Component

`src/components/events/MomentsWall.tsx` is the most complex component in the dashboard. Key features:

- **Filter tabs**: Todos / Pendientes / Aprobados / Errores — filters by `is_approved` and `processing_status`.
- **Lightbox viewer**: Full-screen view with zoom, keyboard navigation (arrow keys, Escape), and video playback support.
- **QR modal**: Uses `qrcode.react` to render a QR code pointing to the Astro upload page URL (`NEXT_PUBLIC_ASTRO_URL/events/{identifier}/upload`).
- **ZIP download**: Bulk downloads approved images using JSZip. Videos are excluded from ZIP downloads.
- **Auto-refresh**: SWR `refreshInterval: 15000` keeps the wall updated as guests upload.

## Testing Approach

Unit tests use **Vitest** and **React Testing Library**. Test files live in `tests/unit/components/` and mirror the component structure under `src/components/`.

```typescript
// Example test pattern
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import YourComponent from '@/components/YourComponent';

describe('YourComponent', () => {
  it('renders correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected text')).toBeInTheDocument();
  });
});
```

When adding a new component, create a corresponding test file at `tests/unit/components/YourComponent.test.tsx`.

There are currently no E2E tests in active use (`playwright.config.ts` exists but the test suite is not maintained). Focus testing effort on Vitest unit tests.

## Important Notes

### Environment Variables

```bash
# .env.local (local development)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080   # Go backend API
NEXT_PUBLIC_ASTRO_URL=http://localhost:4321     # Astro public frontend (for QR code URLs)
```

Both variables are required. `NEXT_PUBLIC_ASTRO_URL` is used by MomentsWall to construct the QR code URL:
```
{NEXT_PUBLIC_ASTRO_URL}/events/{identifier}/upload
```

See `.env.example` for an up-to-date list of all required variables.

### Adding a New Model

Create a TypeScript interface in `src/models/YourModel.ts` matching the backend JSON response shape. Export it and import it into any component or SWR hook that needs the type.

### Adding a New Page

1. Create the page file under `src/app/(app)/your-page/page.tsx`.
2. The page is automatically protected by the Cognito middleware — no extra configuration needed.
3. Add navigation links in the sidebar/nav component if the page should be discoverable from the UI.

### Adding a New Feature Component

1. Create `src/components/events/YourFeature.tsx` (or `src/components/ui/` for generic UI).
2. Use SWR for data fetching — do not use `useEffect` + `fetch` directly.
3. Add a unit test at `tests/unit/components/YourFeature.test.tsx`.
