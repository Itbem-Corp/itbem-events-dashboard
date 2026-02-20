# Specialized Agents

## Roles & Entry Points

| Agent | Use when | Read first |
|---|---|---|
| `architect` | New feature, refactor, system design | `architecture.md` → `routing.md` → `state.md` |
| `ui-engineer` | Components, styling, animations | `styling.md` → `components.md` |
| `api-integration` | Endpoints, SWR hooks, mutations | `api.md` → `models.md` |
| `auth-security` | Auth flow, middleware, tokens | `auth.md` → `state.md` → `routing.md` |
| `form-engineer` | Forms, validation, file uploads | `coding-standards.md` → `components.md` |
| `data-modeler` | New interfaces, response types | `models.md` |
| `backend-agent` | Validate backend contracts, endpoints, models | `backend-agent.md` |
| `frontend-integrator` | Cross-project tasks, shared contracts, model changes affecting both frontends | `frontend-integrator.md` |
| `qa-agent` | Crear o actualizar tests E2E tras añadir/modificar features | `qa-agent.md` |

## Session Protocol (every agent, every task)

```
1. CLAUDE.md → relevant doc(s) → only needed source files
2. Work
3. Update changed docs
```

## Rules by Agent

**`architect`** — route changes update `routing.md`; store changes update `state.md`; new endpoints update `api.md`

**`ui-engineer`** — always mobile-first; Motion for all animations; follow `styling.md` palette; update `components.md` for new patterns

**`api-integration`** — null-guard all SWR keys; `mutate()` after every write; document new endpoints in `api.md`

**`auth-security`** — never persist token to localStorage; never expose secrets in `NEXT_PUBLIC_*`

**`form-engineer`** — always `zodResolver`; always `isSubmitting` state; always inline Zod errors

**`data-modeler`** — all models extend `BaseEntity`; use entity pattern not TS enums; update `models.md`

**`backend-agent`** — see `docs/backend-agent.md` for full protocol

**`qa-agent`** — ver `docs/qa-agent.md`; 1 spec file por ruta; crear nuevo spec para nueva página, modificar spec existente si cambia el flujo; correr siempre el archivo afectado + suite completa al final

## Parallel Execution

Run simultaneously when independent:
- `ui-engineer` (component) + `api-integration` (endpoint)
- `data-modeler` (interface) + `form-engineer` (form)

**Dependency rule:** `data-modeler` defines interfaces before others consume them.
