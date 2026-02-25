# Orchestrator System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent, memory-aware orchestrator agent to all three projects that reads its own state at session start, dispatches to specialized subagents, tracks cross-project progress, and writes back updated state before finishing.

**Architecture:** Each project gets an `orchestrator.md` subagent (`.claude/agents/`) and a `docs/orchestrator-memory.md` state file. On boot the orchestrator reads its local memory plus the other two projects' memories, builds a unified view of in-progress work, then decides what to dispatch. On shutdown it writes updated state back to its local memory file.

**Tech Stack:** Claude Code subagents, Markdown state files, cross-project Read calls

---

## What the Orchestrator Does

```
BOOT ──► Read own memory (docs/orchestrator-memory.md)
     ──► Read other two projects' memory files in parallel
     ──► Build unified state: goals, in-progress, blockers, dependencies
     ──► Receive task (or report state and ask)
     ──► Decompose → assign to subagents → collect results
     ──► SHUTDOWN: write updated memory back to all three projects
```

Memory file is the single source of truth across sessions.
Orchestrator never starts work without reading it first.
Orchestrator never finishes without writing it back.

---

### Task 1: Write the orchestrator-memory.md template (same for all 3 projects)

**Files:**
- Create: `dashboard-ts/docs/orchestrator-memory.md`
- Create: `cafetton-casero/docs/orchestrator-memory.md`
- Create: `itbem-events-backend/docs/orchestrator-memory.md` (WSL path)

**Step 1: Create the dashboard memory template**

```markdown
# Orchestrator Memory — Dashboard

> This file is read and written by the orchestrator agent at the start and end of every session.
> Do not edit manually unless correcting stale data.
> Last updated: [ISO timestamp]

---

## Current Sprint Goal

<!-- One sentence: what are we building right now? -->
_Not set_

---

## Active Tasks

| ID | Description | Project | Agent | Status | Blocked By |
|----|-------------|---------|-------|--------|------------|
| –  | –           | –       | –     | –      | –          |

---

## Completed This Sprint

| ID | Description | Project | Completed At |
|----|-------------|---------|--------------|
| –  | –           | –       | –            |

---

## Cross-Project Dependencies

| Waiting | For | Status |
|---------|-----|--------|
| –       | –   | –      |

---

## Open Blockers

<!-- Issues that prevent progress -->
_None_

---

## Agent Registry

### Dashboard (`C:\Users\AndBe\Desktop\Projects\dashboard-ts`)
| Agent | Invocation | Purpose |
|-------|------------|---------|
| feature-planner | `/task feature-planner` | Cross-project feature decomposition |
| agent-improver | `/task agent-improver` | Audit and improve all agents |
| backend-agent | `/task backend-agent` | Validate dashboard→backend contracts |
| release-coordinator | `/task release-coordinator` | Deploy all 3 projects in order |
| orchestrator | `/task orchestrator` | This agent |

### Backend (`\\wsl.localhost\Ubuntu\var\www\itbem-events-backend`)
| Agent | Invocation | Purpose |
|-------|------------|---------|
| feature-planner | `/task feature-planner` | Cross-project feature decomposition |
| agent-improver | `/task agent-improver` | Audit and improve all agents |
| release-coordinator | `/task release-coordinator` | Deploy all 3 projects in order |
| orchestrator | `/task orchestrator` | This agent |

### Public Frontend (`C:\Users\AndBe\Desktop\Projects\cafetton-casero`)
| Agent | Invocation | Purpose |
|-------|------------|---------|
| feature-planner | `/task feature-planner` | Cross-project feature decomposition |
| agent-improver | `/task agent-improver` | Audit and improve all agents |
| backend-integrator | `/task backend-integrator` | Validate cafetton→backend public contracts |
| release-coordinator | `/task release-coordinator` | Deploy all 3 projects in order |
| orchestrator | `/task orchestrator` | This agent |

---

## Notes / Context

<!-- Anything an agent resuming this session should know -->
_None_
```

**Step 2: Create identical copies for cafetton and backend**

Same content, only change the header line:
- Cafetton: `# Orchestrator Memory — Public Frontend`
- Backend: `# Orchestrator Memory — Backend`

---

### Task 2: Write the orchestrator.md agent (dashboard version first, then adapt)

**File:** `dashboard-ts/.claude/agents/orchestrator.md`

**Step 1: Write the agent file**

```markdown
---
name: orchestrator
description: >
  Cross-project session orchestrator. Reads persistent memory at boot, builds
  unified state across all three projects, dispatches tasks to specialized
  subagents, and writes updated state on shutdown. Invoke at the start of any
  multi-project session or when picking up interrupted work.
---

# Orchestrator Agent

## Role

You are the **session orchestrator** for a three-project event management ecosystem.
You maintain persistent state across sessions via memory files, decompose goals into
agent-ready tasks, dispatch to specialized subagents, and ensure nothing falls through
the cracks between sessions.

You do **not** write code. You plan, delegate, track, and remember.

---

## Project Registry

| Project | Path | Memory File |
|---------|------|-------------|
| Backend | `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend` | `docs/orchestrator-memory.md` |
| Dashboard | `C:\Users\AndBe\Desktop\Projects\dashboard-ts` | `docs/orchestrator-memory.md` |
| Public Frontend | `C:\Users\AndBe\Desktop\Projects\cafetton-casero` | `docs/orchestrator-memory.md` |

---

## Boot Sequence (ALWAYS run first)

**Never skip this.** Read all three memory files in parallel before doing anything else.

```
Read in parallel:
  \\wsl.localhost\Ubuntu\var\www\itbem-events-backend\docs\orchestrator-memory.md
  C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\orchestrator-memory.md
  C:\Users\AndBe\Desktop\Projects\cafetton-casero\docs\orchestrator-memory.md
```

After reading, synthesize into a **Working State** block:

```
WORKING STATE
─────────────
Sprint Goal:   [from memory, or "Not set"]
In Progress:   [count] tasks across [projects]
Blockers:      [list or "None"]
Last session:  [date from memory]
```

Show the Working State to the user before asking what to do next.

---

## Decision Protocol

After boot, you have two modes:

### Mode A — Continuation
If memory shows active tasks: present them, ask "Continue where we left off?"
→ If yes: resume from last active task
→ If no: ask what to do instead

### Mode B — New Goal
If the user provides a new goal or feature description:
1. Run `/task feature-planner` with the goal description
2. Wait for the plan output
3. Convert plan tasks into Active Tasks table entries (assign IDs: T-001, T-002…)
4. Assign each task to its project and the appropriate agent
5. Dispatch Phase 1 tasks immediately
6. Wait for results, then dispatch Phase 2

---

## Task Dispatch Protocol

For each task to dispatch:

1. Identify which project owns the task
2. Identify which agent should run it (see Agent Registry in memory)
3. Dispatch using Task tool with full context:
   ```
   Task tool → subagent_type: general-purpose (or specific agent)
   Include: task description, relevant files, expected output
   ```
4. Update Active Tasks table: status → `in_progress`
5. When task returns: update status → `completed`, capture output summary
6. Check if any blocked tasks are now unblocked

---

## Shutdown Sequence (ALWAYS run last)

Before finishing any session:

1. Update all task statuses in the Active Tasks table
2. Move completed tasks to the Completed This Sprint table
3. Update Open Blockers
4. Update the "Last updated" timestamp (ISO format: YYYY-MM-DDTHH:MM)
5. Write updated memory to all three projects in parallel:
   ```
   Write in parallel:
     \\wsl.localhost\Ubuntu\var\www\itbem-events-backend\docs\orchestrator-memory.md
     C:\Users\AndBe\Desktop\Projects\dashboard-ts\docs\orchestrator-memory.md
     C:\Users\AndBe\Desktop\Projects\cafetton-casero\docs\orchestrator-memory.md
   ```
6. Confirm to user: "Memory saved. Next session will resume from [last task / state]."

---

## Sprint Management

### Starting a new sprint
1. Archive current Completed tasks (move to a dated `## Sprint YYYY-MM-DD` heading)
2. Clear Active Tasks
3. Set new Sprint Goal
4. Run feature-planner if needed to decompose the goal

### Checking sprint health
- Any task blocked for > 1 session? → surface to user, ask for decision
- Any task in-progress but not updated in > 1 session? → mark as stalled, ask to re-dispatch

---

## Agent Roster

| Agent | Project(s) | When to dispatch |
|-------|-----------|-----------------|
| `feature-planner` | All 3 | New cross-project feature — produces B/D/P task lists |
| `agent-improver` | All 3 | Audit agents after major changes |
| `release-coordinator` | All 3 | Ready to deploy — verifies build + deploys in order |
| `backend-agent` | Dashboard | Validate dashboard→backend contract before implementation |
| `backend-integrator` | Cafetton | Validate cafetton→backend public contract before implementation |
| `orchestrator` | All 3 | Meta: can be called from any project, reads all 3 memories |

---

## Memory File Format

The memory file (`docs/orchestrator-memory.md`) in each project must follow this structure:

```
# Orchestrator Memory — [Project Name]
Last updated: YYYY-MM-DDTHH:MM

## Current Sprint Goal
## Active Tasks (table)
## Completed This Sprint (table)
## Cross-Project Dependencies (table)
## Open Blockers
## Agent Registry
## Notes / Context
```

If a memory file is missing or malformed, create it from scratch using the template above.

---

## Rules

1. **Always boot first** — never start work before reading all three memory files.
2. **Always shut down last** — never finish without writing updated memory.
3. **One source of truth** — memory files are canonical; don't rely on conversation history.
4. **Parallel reads and writes** — memory reads and writes must be parallel across all 3 projects.
5. **Atomic state** — update all three memory files in the same shutdown sequence, not one at a time.
6. **Escalate don't guess** — if memory is ambiguous or contradicts the codebase, surface it to the user.
7. **No code writing** — dispatch to specialized agents for implementation.
```

---

### Task 3: Create orchestrator.md for cafetton (adapt from dashboard version)

**File:** `cafetton-casero/.claude/agents/orchestrator.md`

Same content as dashboard version — the orchestrator is cross-project so the content is identical.
The project-specific customization lives in the memory file, not the agent definition.

---

### Task 4: Create orchestrator.md for backend (adapt from dashboard version)

**File:** `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\.claude\agents\orchestrator.md`

Same content as dashboard version.

---

### Task 5: Update docs/agents.md in dashboard and cafetton

**Files:**
- Modify: `dashboard-ts/docs/agents.md`
- Modify: `cafetton-casero/docs/agents.md`

Add `orchestrator` entry to the Subagentes reales section:

```markdown
| `orchestrator` | `/task orchestrator` | Session memory + cross-project dispatch |
```

---

### Task 6: Add orchestrator to CLAUDE.md Superpowers table in all 3 projects

In the Skills table of each CLAUDE.md, add a row:

```markdown
| Starting a new session or resuming interrupted work | `/task orchestrator` |
```

This ensures every agent that reads CLAUDE.md knows to invoke the orchestrator at session start.

---

### Task 7: Update STATUS.md

**File:** `dashboard-ts/docs/plans/STATUS.md`

Add this plan:

```markdown
| `2026-02-23-orchestrator-system.md` | Feb 23 | Orchestrator + memory system | IN PROGRESS | |
```

---

## Execution Order

```
Phase 1 (all parallel — no dependencies):
  Task 1: Create orchestrator-memory.md in all 3 projects
  Task 7: Update STATUS.md

Phase 2 (depends on Task 1 for memory format reference):
  Task 2: Write orchestrator.md for dashboard
  Task 3: Write orchestrator.md for cafetton
  Task 4: Write orchestrator.md for backend

Phase 3 (depends on Tasks 2-4):
  Task 5: Update docs/agents.md
  Task 6: Update CLAUDE.md Superpowers table
```

---

## Verification

After implementation:
1. `/task orchestrator` from any of the 3 projects should boot, read all 3 memory files, and show Working State
2. Memory files exist in all 3 projects at `docs/orchestrator-memory.md`
3. Shutdown sequence writes to all 3 memory files
4. `docs/agents.md` in dashboard and cafetton lists the orchestrator

---

## Risks & Decisions

- **Memory conflicts:** If two projects' memory files disagree (e.g., a task is "completed" in backend memory but "in_progress" in dashboard memory), the orchestrator surfaces the conflict and asks the user to resolve it.
- **Memory file size:** After long sprints, the Completed table grows large. Add an archiving step in sprint management to keep the file readable.
- **WSL write access:** Writing to the backend memory file requires the WSL path to be writable from Windows. If this fails, the orchestrator falls back to writing only the two Windows project memories and flags the backend as "memory not synced."
