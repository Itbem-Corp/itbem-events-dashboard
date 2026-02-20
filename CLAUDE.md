# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## START OF SESSION — MANDATORY ORDER

```
1. Read this file (done)
2. Read ONLY the docs relevant to your task (see index below)
3. Read ONLY the source files you actually need to touch
4. Make changes
5. Update the docs that changed (see Rules below)
```

**Never scan the full codebase. Docs come first — they exist to save tokens.**

---

## Doc Index (read these, not the source)

| Task type | Read first |
|---|---|
| New feature / architecture | `docs/architecture.md` |
| Auth, session, middleware | `docs/auth.md` |
| Store / state | `docs/state.md` |
| API calls, SWR, mutations | `docs/api.md` |
| TypeScript models / types | `docs/models.md` |
| Components, layout, CRUD | `docs/components.md` |
| Routes, navigation, guards | `docs/routing.md` |
| UI, styling, animations | `docs/styling.md` |
| Code patterns, standards | `docs/coding-standards.md` |
| Agent roles & parallelism | `docs/agents.md` |
| Backend validation/contract | `docs/backend-agent.md` |
| Cross-project (both frontends) | `docs/frontend-integrator.md` |
| E2E tests / QA | `docs/qa-agent.md` |

---

## Doc Update Rules

After every change, update the matching doc:

| Changed | Update doc |
|---|---|
| Route or page | `routing.md` |
| Component or UI pattern | `components.md` |
| Store shape/action | `state.md` |
| API endpoint | `api.md` |
| Model / interface | `models.md` |
| Auth flow | `auth.md` |
| Style / animation | `styling.md` |
| Code pattern | `coding-standards.md` |
| Architecture | `architecture.md` |
| Backend contract | `backend-agent.md` |
| Cross-project contract | `frontend-integrator.md` (update both projects' docs) |
| Bugs / deuda técnica | `audit.md` (actualizar cuando se resuelve un item) |
| Nueva página o feature | Crear/actualizar `tests/e2e/{feature}.spec.ts` y ejecutar |

---

## Auto-Approved Permissions

No confirmation needed for:
- Reading any file in the repo
- Writing/editing files under `src/`, `docs/`, root config files
- Running `npm run dev | build | start | lint`
- Creating files inside existing directories

Ask before: deleting files · `npm install/uninstall` · pushing · deploying

---

## Commands

```bash
npm run dev    # http://localhost:3000
npm run build
npm run lint   # ESLint

# E2E tests (Playwright) — app must be running on :3000
npm run test:e2e                                       # suite completa
npm run test:e2e:file tests/e2e/clients.spec.ts        # archivo específico
npm run test:e2e:headed                                # browser visible
npm run test:e2e:ui                                    # Playwright UI
npx playwright show-report                             # reporte HTML
```

`.env.local` requires `NEXT_PUBLIC_BACKEND_URL=http://localhost:8080` — see `docs/auth.md` for Cognito vars.
For E2E tests also add `TEST_EMAIL` and `TEST_PASSWORD` (Cognito staging test user) — see `docs/qa-agent.md`.

---

## Project Scope

This repo is the **admin dashboard only** — management of clients, users, events, orders, analytics.

| Project | Path | GitHub |
|---|---|---|
| Public event frontend | `C:\Users\AndBe\Desktop\Projects\cafetton-casero` | `https://github.com/Itbem-Corp/itbem-events-frontend.git` |
| Backend (Go) | `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend` | `git@github.com:Itbem-Corp/itbem-events-backend.git` |

Cross-project work → `docs/frontend-integrator.md` | Backend validation → `docs/backend-agent.md`

---

## Non-Negotiable Standards (detail in docs)

**Style** — dark only (`zinc-950` bg), mobile-first, Motion animations, skeleton loaders → `docs/styling.md`
**Code** — no `any`, no `useEffect` for fetching, `'use client'` on all app pages, Zod forms → `docs/coding-standards.md`
**API** — always conditional SWR key (`null` when deps missing), always `mutate()` after write → `docs/api.md`
