---
name: feature-pipeline
description: "Use when the user asks to port, analyze-and-implement, or build end to end a game feature in mc-game-new (e.g. \"port quest system\", \"implement daily sign-in from the old game\", \"research then implement\", or Vietnamese: \"phân tích và triển khai tính năng\", \"port tính năng X sang H5\", \"lên kế hoạch rồi cài đặt\"). Orchestrates: legacy research (Flash client + Go server + seeds) → approved plan doc → delegated implementation → independent verification → memory update."
argument-hint: "Feature to port, known RPC/callback names, constraints or scope limits."
user-invocable: true
---

# Feature Pipeline (Research → Plan → Implement → Verify)

Ports a feature from the legacy `D:\mcgame` (Flash client + Go server + Postgres seeds) into this
TypeScript stack (`packages/shared` → `server` NestJS → `client` PixiJS). Each phase ends with an
artifact before the next one starts. The orchestrating session owns synthesis and verification;
subagents do the legwork.

**Skip this skill** for small fixes or single-file changes with a known cause (use `nest-game-server`
or `pixi-client` directly), and for pure research with no implementation goal (spawn one researcher).

## Phase 0 — Load context

1. `CLAUDE.md` (hard rules) and `docs/PROJECT_KNOWLEDGE_BASE.md` (index).
2. Matching `docs/memory/<feature>.md` here, and in the legacy repo
   `D:\mcgame\docs\memory\<feature>.md` (index `D:\mcgame\docs\PROJECT_KNOWLEDGE_BASE.md`).
3. Prior work in `docs/research/` and `docs/plans/` — a previous plan may only need an addendum.
4. What already exists: `packages/shared/src/protocol.ts`, `server/src/modules/`, `client/src/`.

## Phase 1 — Research

Run independent tracks **in parallel** (one message, several Agent calls):

- **Client contract** → `flash-client-researcher`: RPC names, argument order, push names, payload
  keys, push ordering, client-side gating, UI strings.
- **Server rules + data** → `legacy-server-researcher`: Go handlers/services, formulas, gates,
  persisted state, push sequences incl. error paths, `data_tbl_*` tables/columns and id pairings.
- **Current port survey** → `Explore` (only if the area is non-trivial): what's stubbed or missing
  in this repo, which module/scene code the feature will touch.

Two-source rule: a fact that binds the implementation (name, payload shape, ordering, formula) needs
two independent confirmations (client code, Go code, seed data, live capture). When ordering matters
and can't be proven statically, ask the user for a capture from the original game.

Deliverable: substantial findings → `docs/research/<YYYY-MM-DD>_<INDEX>_<FEATURE>_RESEARCH.md`; small
features fold findings into the plan's §1. Techniques and pitfalls: `references/research-playbook.md`.

## Phase 2 — Plan

Write `docs/plans/<YYYY-MM-DD>_<INDEX>_<PLAN_NAME>.md` from `references/plan-template.md`. Required:
**Confirmed mechanics** (facts only), **Shared contract** (exact TypeScript types), **Design** with a
touch-point table (file → change), **Non-goals** (with why deferral is safe), **Verification**
(commands + manual smoke steps).

Summarize the plan to the user in their language (docs stay English) and wait for approval. Set
`Status: Approved` only after the user confirms; scope changes need re-approval.

## Phase 3 — Implement

Delegate to `mc-plan-implementer` with the plan path. The plan must be self-contained: the agent
starts fresh and reads only what the plan cites. Implement in the parent session only when the change
is small enough that spawn overhead dominates.

While it runs: prod a stalled agent with SendMessage rather than respawning; when it reports type
errors, re-run `pnpm -r lint` yourself before believing either side (IDE diagnostics go stale); when
it corrects a stale plan premise, judge on merit and amend the plan.

New RPCs stay un-quieted (no `quiet: true`) until the user confirms the feature works.

## Phase 4 — Verify & record

Never relay the implementer's report unverified. Run `references/verification-checklist.md`:
lint + tests against the baseline, read contract-critical code yourself, prepare the manual smoke
test for the user, then make sure `docs/memory/<feature>.md` and the index are updated.

Final report to the user (their language): outcome first, then what was verified and how, then what
remains (smoke test, quieting RPCs, deferred non-goals).

## Orchestration style

- Parallelize independent research and implementation waves.
- Parent resolves contradictions between agents against primary sources.
- Cheapest capable model per subtask (Haiku mechanical, Sonnet scoped work, Opus planning).
- Trust `tsc` and tests over diagnostics; trust client code, Go code and seed data over memory.

## Additional resources

- `references/research-playbook.md` — where to look in the legacy repo, data queries, pitfalls.
- `references/plan-template.md` — plan skeleton with per-section guidance.
- `references/verification-checklist.md` — lint/test baseline, contract spot-checks, smoke test, memory.
