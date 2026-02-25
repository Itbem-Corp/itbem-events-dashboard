# Plan Status Index

Track the implementation status of all plans in this directory.

**Status values:** `IMPLEMENTED` | `IN PROGRESS` | `PENDING` | `ABANDONED` | `SUPERSEDED`

---

## Plans

| File | Date | Topic | Status | Notes |
|------|------|-------|--------|-------|
| `2026-02-21-fullstack-features-design.md` | Feb 21 | Full-stack features — design doc | PENDING REVIEW | Design doc, may be superseded by later plans |
| `2026-02-21-fullstack-features-plan.md` | Feb 21 | Full-stack features — implementation plan | PENDING REVIEW | Check if features were implemented |
| `2026-02-21-full-stack-feature-sprint.md` | Feb 21 | Full-stack feature sprint | PENDING REVIEW | Sprint planning doc |
| `2026-02-21-full-stack-sprint-plan.md` | Feb 21 | Full-stack sprint plan | PENDING REVIEW | May overlap with above |
| `2026-02-21-invitations-momentwall.md` | Feb 21 | Invitations + MomentWall | PENDING REVIEW | MomentWall is implemented — verify invitations part |
| `2026-02-22-event-detail-banner-fixes.md` | Feb 22 | Event detail banner fixes | LIKELY IMPLEMENTED | UI fixes, probably shipped |
| `2026-02-22-event-self-healing-design.md` | Feb 22 | Self-healing system — design | IMPLEMENTED | Self-healing system is live (see CLAUDE.md) |
| `2026-02-22-event-self-healing-plan.md` | Feb 22 | Self-healing system — plan | IMPLEMENTED | Self-healing system is live (see CLAUDE.md) |
| `2026-02-22-moments-wall-public-design.md` | Feb 22 | Moments wall public — design | PENDING REVIEW | Check if public moment wall was implemented |
| `2026-02-22-moments-wall-implementation.md` | Feb 22 | Moments wall — implementation | LIKELY IMPLEMENTED | MomentsWall component is live |
| `2026-02-22-seating-plan-v2-design.md` | Feb 22 | Seating plan v2 — design | PENDING REVIEW | Not mentioned in CLAUDE.md — may be unimplemented |
| `2026-02-22-seating-plan-v2.md` | Feb 22 | Seating plan v2 — plan | PENDING REVIEW | Not mentioned in CLAUDE.md — may be unimplemented |
| `2026-02-23-orchestrator-system.md` | Feb 23 | Orchestrator + memory system | IMPLEMENTED | orchestrator.md + orchestrator-memory.md in all 3 projects |
| `2026-02-23-optimizations.md` | Feb 23 | Fix broken refs, dedup, simplify, fallbacks | IMPLEMENTED | COMMON_TASKS, session-state, manifest simplification, fallbacks |

---

## How to Use

When starting a new session:
1. Check this file before reading individual plan files
2. Only read plans with status `IN PROGRESS` or `PENDING REVIEW`
3. Skip `IMPLEMENTED` and `ABANDONED` plans — they're historical reference only

When completing a plan:
1. Update the status here to `IMPLEMENTED`
2. Add a note with the date completed

When a plan is no longer relevant:
1. Mark as `ABANDONED` or `SUPERSEDED` with a note explaining why
