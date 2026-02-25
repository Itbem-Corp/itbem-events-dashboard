# Specialized Agents

## Roles & Entry Points

### Subagentes reales (`/task <nombre>`)
Estos están en `.claude/agents/` y se invocan con `/task`:

| Agent | Use when |
|---|---|
| `/task feature-planner` | Antes de empezar cualquier feature — genera plan cross-project para los 3 proyectos |
| `/task agent-improver` | Audita todos los agentes de los 3 proyectos, detecta paths rotos y endpoints stale |
| `/task backend-agent` | Valida contratos backend: endpoints, response shapes, modelos |
| `/task release-coordinator` | Antes de hacer deploy de un feature que toca más de un proyecto |
| `/task orchestrator` | Al inicio de cualquier sesión multi-proyecto — lee memoria, retoma o inicia sprint |

### Agentes de contexto (Claude los activa al leer docs/)
Estos están documentados en `docs/` y guían el comportamiento inline:

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
