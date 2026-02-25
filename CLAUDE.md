# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Ecosystem

This project is part of a three-project system. **Every feature or change must be evaluated for cross-project impact.**

| Project | Stack | Local Path | Purpose |
|---------|-------|-----------|---------|
| **Backend** (Go) | Go + Echo + PostgreSQL + Redis | `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend` | API, business logic, auth (Cognito), S3 uploads, event management |
| **Dashboard** (this project) | Next.js 15 + TypeScript | `C:\Users\AndBe\Desktop\Projects\dashboard-ts` | Admin UI: manage events, approve moments, analytics, guest lists, QR codes |
| **Public Frontend** | Astro 5 + React islands | `C:\Users\AndBe\Desktop\Projects\cafetton-casero` | Guest-facing: event pages, photo/video wall, RSVP, QR upload flow |

Never implement a feature in isolation. Trace the full data flow: Backend → Dashboard and/or Public Frontend.

---

## Superpowers Plugin

This project uses the **Claude Code Superpowers plugin**. Before any action, check if a relevant skill applies — invoke it via the `Skill` tool **before doing anything else**. Even a 1% chance of relevance means you must invoke it.

| When... | Use skill |
|---------|-----------|
| Starting a new feature, component, or behavior | `superpowers:brainstorming` |
| About to write implementation code | `superpowers:test-driven-development` |
| Debugging a bug, test failure, or unexpected behavior | `superpowers:systematic-debugging` |
| Planning a multi-step task | `superpowers:writing-plans` |
| Executing a written plan | `superpowers:executing-plans` |
| 2+ independent tasks that can run in parallel | `superpowers:dispatching-parallel-agents` |
| About to claim work is done or tests pass | `superpowers:verification-before-completion` |
| Completing a feature branch | `superpowers:finishing-a-development-branch` |
| Received code review feedback | `superpowers:receiving-code-review` |
| Completed a task, want a review | `superpowers:requesting-code-review` |

**Rule:** Skills define HOW to approach tasks. Never skip them to save time — they prevent rework.

---

## Context7 MCP — Library Documentation

**Use Context7 MCP whenever you need docs for any library. Never web-search for library APIs.**

```bash
mcp__context7__resolve-library-id libraryName:"swr"
mcp__context7__get-library-docs libraryId:"/vercel/swr" topic:"mutation" tokens:5000
```

Common IDs: Next.js 15 `/vercel/next.js` · SWR `/vercel/swr` · Tailwind `/tailwindlabs/tailwindcss` · Motion `/framer/motion` · Zustand `/pmndrs/zustand` · Zod `/colinhacks/zod` · Axios `/axios/axios` · React Hook Form `/react-hook-form/react-hook-form`

Context7 ≈ 1,000 tokens. Web search ≈ 15,000+ tokens.

---

## Documentation-First Workflow

**Always read `docs/` before exploring source code.**

| Looking for… | Read first |
|--------------|-----------|
| Component or UI pattern | `docs/components.md` |
| API endpoint, SWR hook | `docs/api.md` |
| TypeScript model/interface | `docs/models.md` |
| Auth, session, middleware | `docs/auth.md` |
| Architecture, data flow | `docs/architecture.md` |
| Zustand store, state shape | `docs/state.md` |
| Routing, pages, guards | `docs/routing.md` |
| Styling, Tailwind, animations | `docs/styling.md` |
| How to add X step-by-step | `docs/COMMON_TASKS.md` |
| Interrupted session | `docs/session-state.md` |
| All 75+ files with exact paths | `docs/CODE_INDEX.md` |
| Copy-paste templates | `docs/TEMPLATES.md` |
| Cross-project contracts | `docs/frontend-integrator.md` |
| Available agents | `docs/agents.md` |
| Sprint state, active tasks | `docs/orchestrator-memory.md` |

**After any code change: update the relevant `docs/` file before finishing.**

---

## Definition of Done

A task is **not complete** until ALL of the following pass:

### Every task
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] `npm run test:unit` — all unit tests pass
- [ ] `npm run build` — production build succeeds
- [ ] Relevant `docs/` file updated

### API integration
- [ ] Backend contract validated (see `docs/backend-agent.md`)
- [ ] SWR key null-guarded: `id ? \`/endpoint/${id}\` : null`
- [ ] `mutate()` called after all writes
- [ ] Error and loading states handled

### Cross-project feature
- [ ] All affected projects updated
- [ ] Backend health-checked before any frontend push to `main`
- [ ] `/task release-coordinator` run before pushing

### Session interrupted mid-task
Write current state to `docs/session-state.md`. Check it at session start. Clear when done.

---

## Project Overview

Next.js 15 admin dashboard for event management. Manages events, approves guest-uploaded moments (photos/videos), views analytics, manages guest lists, generates QR codes. SWR + Axios for data fetching, AWS Cognito auth, Tailwind CSS, Recharts, JSZip.

## Development Commands

```bash
npm run dev           # http://localhost:3000
npm run build         # production build
npm run test:unit     # Vitest unit tests
npm run test:unit:watch
npm run test:coverage
```

## Architecture

- **Data fetching:** SWR with Axios (`src/lib/api.ts` attaches Cognito Bearer token). Use `refreshInterval: 15000` for live data. See `docs/TEMPLATES.md` for SWR patterns.
- **Auth:** All pages under `src/app/(app)/` are auto-protected by middleware. Don't add unauthenticated pages there.
- **Pages** → `src/app/(app)/` · **Feature components** → `src/components/events/` · **UI** → `src/components/ui/` · **Models** → `src/models/`
- **Testing:** Vitest + React Testing Library. Tests in `tests/unit/components/`. See `docs/COMMON_TASKS.md` for patterns.

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Axios client + Cognito `Authorization` header |
| `src/lib/fetcher.ts` | SWR fetcher |
| `src/models/Moment.ts` | Moment interface (`processing_status`, `is_approved`, `content_url`) |
| `src/components/events/MomentsWall.tsx` | Filter tabs, lightbox, QR modal, ZIP download, 15s auto-refresh |
| `src/lib/sanitize-event.ts` | In-memory event sanitizer + issue detector |
| `src/hooks/useEventHealthCheck.ts` | Auto-repair hook (calls `POST /events/:id/repair`) |
| `src/components/events/event-error-boundary.tsx` | Render crash boundary with retry |

## Important Notes

**Env vars:** `NEXT_PUBLIC_BACKEND_URL=http://localhost:8080` and `NEXT_PUBLIC_ASTRO_URL=http://localhost:4321` are both required. See `.env.example`.

**GitHub MCP:** Dashboard repo not configured. Backend: `owner: "Itbem-Corp", repo: "itbem-events-backend"`. Frontend: `repo: "itbem-events-frontend"`.

**Deployment:** Vercel via GitHub Actions CI (`npx tsc --noEmit` → `npm run test:unit` → `npm run build` → deploy on pass). No GitHub remote yet — `git push` will fail until remote is added.
