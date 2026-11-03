# Plan Document Template

File: `docs/plans/<YYYY-MM-DD>_<INDEX>_<PLAN_NAME>.md`, English. A good plan is **self-contained**:
`mc-plan-implementer` starts with fresh context and must be able to execute from the plan plus the
files it cites.

## Skeleton

```markdown
# <Feature Name> — Implementation Plan

**Date**: <YYYY-MM-DD> · **Status**: Draft | Approved
**Goal**: one paragraph — what the player can do end to end when this lands, and what is missing today.

Research base:
- <research doc / legacy docs/memory file / Go file:line — one line each on what it proves>

## 1. Confirmed mechanics

<Facts that bind the implementation — no design, no "should".>

- RPCs: name, args (order, type), result; pushes: name, payload, who receives it (self / map / all).
- Push ordering where it matters.
- Rules and formulas with constants (cite legacy `file:line`).
- Id pairing tables as markdown tables.
- Negative facts ("item is NOT consumed", "no level gate").

## 2. Shared contract

<Exact TypeScript to add to `packages/shared/src/protocol.ts`.>

## 3. Design

### 3.1 State
<Mongoose schema changes (new schema or fields + defaults) vs in-memory state; restart story;
what happens to existing documents.>

### 3.2 Static data
<Which `data_tbl_*` collections/columns; accessors to add to `GameDataService` (cached or queried).>

### 3.3 Server
<Module/service/rpc layout, gating options, error cases → `RpcException` codes, broadcasts.>

### 3.4 Client
<Calls, `client.on(...)` handlers, UI (DOM in `client/src/ui`) and scene (`client/src/game`) changes,
assets needed (sheet names / icons).>

### 3.5 Touch points

| File | Change |
|---|---|
| `packages/shared/src/protocol.ts` | add `XxxInfo`, `XxxResponse` |
| `server/src/modules/xxx/xxx.service.ts` | new: … |
| `server/src/app.module.ts` | import `XxxModule` |
| `client/src/game/GameScene.ts` `bindCallbacks` | handle `onXxx` |

## 4. Non-goals

<Each deferred item with why it is safe to defer.>

## 5. Verification

1. Unit tests: <cases worth a `node:test` test — formulas, gates, mappers>.
2. `pnpm --filter @mc/shared build`, `pnpm -r lint`, `pnpm -r test` (baseline: all green).
3. Manual smoke test: <numbered player steps in the H5 client and expected server log lines>.
4. Docs: `docs/memory/<feature>.md` (+ index line if new).
```

## Guidance

- **Status** starts `Draft`; implementation never starts on a Draft.
- **§1** is the contract firewall: verify (two-source rule) or move to Non-goals — never let a guess in.
- **§2** is the single source of truth for payloads; server and client both import it.
- **§3** always states where state lives and the restart story, new files with their module placement
  (respecting the ~300-line cap), and how new capabilities are injected (Nest DI, narrow services).
- Assets: if the feature needs art not yet converted, say which `tools/swf` command produces it
  (`swfbatch -only <family>`) or list it as a non-goal.
- **§5** must be executable by someone who didn't write the plan.

## Hygiene

- When implementation finds reality diverged, fix the code to reality and amend the plan in the same pass.
- Follow-up scope goes into a numbered addendum section, not a near-duplicate plan.
- After shipping, distill the load-bearing outcomes into `docs/memory/<feature>.md`; the plan is history.
