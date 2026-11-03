# CLAUDE.md

Guidance for AI coding assistants in this repository. This file is the single source of truth:
`AGENTS.md` (Codex and other agents) points here. Subagents live in `.claude/agents/`, skills in
`.claude/skills/`.

**Project**: H5 port of the `mcgame` Flash MMO. TypeScript end to end, pnpm workspace:

| Package | Path | Stack |
|---|---|---|
| `@mc/server` | `server/` | NestJS 11, Mongoose/MongoDB 7, raw `ws` JSON RPC gateway |
| `@mc/client` | `client/` | Vite 6 + PixiJS 8, DOM overlays for screens/UI |
| `@mc/shared` | `packages/shared/` | Wire protocol types, resource-code → asset-path decoder, md5 |
| `@mc/swf-tools` | `tools/swf/` | SWF → PNG atlas/JSON converters, hit-mask extractor (see `docs/assets-pipeline.md`) |

The legacy project at `D:\mcgame` (Go server + decompiled Flash client + Postgres seeds + asset
cache) is the **reference implementation**. This repo re-implements it; it never modifies it.

## Hard Rules

- **Language**: TypeScript only, managed with pnpm (`pnpm@9`, Node ≥ 22). No Go, Python, shell
  scripts or other languages for code, tools or scripts; one-off scripts are `.ts` run with `tsx`.
  No new frameworks without asking (no React/Vue in the client, no ORM besides Mongoose, no extra
  RPC layer besides the gateway).
- **Legacy repo is read-only**: never edit, create or delete anything under `D:\mcgame` — that
  includes `.as` files (decompiled client), Go sources, seeds and the asset cache.
- **Git**: never `git commit` / `git push`, never create worktrees, unless the user asks.
- **Shared contract first**: every RPC argument/result shape and every server push payload is a type
  in `packages/shared/src/protocol.ts` (or a sibling file re-exported from `index.ts`), imported by
  both server and client. No duplicated ad-hoc interfaces on either side.
- **Names from the Flash client**: RPC and callback names keep the original Flash names, typos
  included (`chooseCharactor`, `acountLv`, `udcp`, `onCR`), so features can be traced back to the
  legacy code. Payloads are ours to shape (JSON, not AMF0), but keep the original field names when a
  field exists in the legacy contract.
- **Typecheck is the build gate**: `pnpm -r lint` (= `tsc --noEmit` per package) must pass. Never
  silence errors with `any`, `@ts-ignore` or `as unknown as` to get green; `unknown` + narrowing is
  the norm for RPC args.
- **Secrets / env**: config comes from `server/.env` via `loadConfig()` only; never hard-code or print
  values from `.env`.
- Read the reference files below before starting non-trivial work.

## Code Style

- 2-space indent, single quotes, semicolons, trailing commas, ~120-col lines (match surrounding code).
- Every file starts with a short header comment (1–3 lines): what the file is for, and for RPC
  files the RPC names and pushes it owns. Inline comments only for non-obvious *why*.
- Files stay under ~300 lines; split by responsibility (service vs rpc vs mapping helpers) beyond that.
- `strict` mode everywhere. Prefer `interface` for data shapes, `as const` objects over `enum`,
  `type` imports for types (`import type { ... }`).
- Server and tools use Node built-ins via `node:` specifiers. Relative imports: `.js` extension in
  `packages/shared` and `tools/swf` (NodeNext ESM); no extension in `client` (Vite, `Bundler`
  resolution) and `server` (CommonJS Nest).
- Vietnamese is fine for player-visible strings; identifiers, comments and docs are English.

## Code Layout

- `server/src/gateway/` — transport: `game.gateway.ts` (ws server, framing, logging), `rpc.registry.ts`
  (discovers `@Rpc` methods), `rpc.decorator.ts`, `errors.ts` (`RpcException`), `session.ts`
  (per-connection state + `callback()` pushes), `scene.manager.ts` (rooms/broadcast, per-account and
  per-character lookup). Feature code does not reach into sockets directly.
- `server/src/modules/<feature>/` — one Nest module per feature:
  - `<feature>.module.ts` — wiring, registered in `app.module.ts`
  - `<feature>.rpc.ts` — `@Injectable()` class whose `@Rpc('name', opts)` methods are the RPC surface;
    thin: validate args, call the service, map to shared types
  - `<feature>.service.ts` — game logic and persistence
  - `<name>.schema.ts` — Mongoose `@Schema` classes for player/runtime state
- `server/src/modules/gamedata/` — read-only static tables imported from the legacy Postgres `data`
  schema. Collections keep their legacy names (`data_tbl_*`) and snake_case columns; hot tables are
  cached in memory at startup. Gameplay code reads templates through `GameDataService`, never
  straight from Mongo.
- `server/tools/` — data pipelines run with `tsx` (`import:seeds`, `resmap`).
- `client/src/net/` — `GameClient` (`call(method, ...args)`, `on(callback, handler)`).
- `client/src/game/` — Pixi scene, entities, sheet animation, map layers, hit mask.
- `client/src/ui/` — DOM screens/overlays (login, char select, chat, toasts).
- `packages/shared/src/` — protocol types and pure helpers usable in both Node and the browser
  (no Node-only APIs here).
- `client/public/sheets/` — generated by `tools/swf`; never hand-edit, regenerate.

## Wire Protocol

- Client → server `{"t":"call","id","m","a":[...]}`; server → client `{"t":"res","id","ok","r"|"e"}`
  for the reply and `{"t":"cb","m","a":[...]}` for pushes (`session.callback(...)`,
  `scenes.broadcast(mapId, ...)`, `scenes.broadcastAll(...)`).
- A handler returns its result (or `null`) or throws `RpcException.*`; the gateway always replies, so
  never swallow errors into a silent return when the client is awaiting something meaningful.
- RPC args arrive as `unknown[]`: coerce numbers with `Number(...)` and validate (`Number.isInteger`,
  `typeof === 'string'`) before use; throw `RpcException.invalidArgs('<field>')` on bad input.
- Gate with decorator options (`requireAuth`, `requireCharacter`) instead of re-checking in handlers.
- **`quiet` logging**: new RPCs are registered **without** `quiet: true` so the gateway logs every call
  while a feature is being built. Add `quiet: true` only after the user confirms the feature works,
  and ask first. (Legacy equivalent: `quietMethods` in the Go dispatcher.)
- Resource codes (`iconCode`, `resCode`, `imgCode`, `portraitCode`, `colorCode`, …) were `int64` in
  the legacy server: carry them as **strings** in shared types (as `PlayerData.iconCode` does) and
  decode with `@mc/shared` (`decodeResCode`, `resPath`, `iconPath`, …), never with ad-hoc math.

## Data

- MongoDB 7 from `docker/docker-compose.yml` (`mongodb://127.0.0.1:27018/mcgame`). Static data is
  loaded with `pnpm import:seeds` from the legacy seed dumps (`SEED_DIR`, default
  `D:/mcgame/supabase/seeds`); re-run it instead of patching `data_tbl_*` collections by hand.
- Player/runtime state lives in Mongoose schemas under the owning module. Numeric ids the client
  shows (character ids, …) come from the `counters` collection, not ObjectIds.
- Schema changes are code (Mongoose schema + defaults); there are no migration files. When a change
  needs existing documents rewritten, write an idempotent `server/tools/<name>.ts` script and say so.
- Inspect data with `docker exec mcgame-mongo mongosh mcgame --quiet --eval '<query>'`; writes to
  player data only when the user asks.

## Legacy Reference (`D:\mcgame`, read-only)

- `docs/client/` — decompiled Flash client (ActionScript). Entry points: `config/Language.as`
  (UI strings), `system/CallBack.as` / `system/CallBackGlobal.as` (server pushes), RPC call sites.
  Trace with the `flash-client-researcher` agent.
- `internal/application/<feature>/` + `internal/presentation/rtmp/handlers/<feature>/` — Go server
  behavior (formulas, gating, push order). Trace with the `legacy-server-researcher` agent.
- `docs/memory/*.md` (index `docs/PROJECT_KNOWLEDGE_BASE.md`) — per-feature knowledge from the Go
  project; read the matching file before researching from scratch.
- `supabase/seeds/` — game data dumps (same rows as the `data_tbl_*` collections here).
- `frontend/s/res/` — md5-named asset cache served on `/res/<md5>` and converted by `tools/swf`.

## Docs Workflow

- Docs are English Markdown (`.md`); `.html` only when a diagram or interactive table clearly helps.
- Research: `docs/research/<YYYY-MM-DD>_<INDEX>_<FEATURE>_RESEARCH.md`
- Plans: `docs/plans/<YYYY-MM-DD>_<INDEX>_<PLAN_NAME>.md` (`INDEX` restarts daily: `01`, `02`, …)
- Per-feature memory: `docs/memory/<feature>.md` — update after every implementation; create one when
  none fits and add a one-line link to `docs/PROJECT_KNOWLEDGE_BASE.md`.
- `docs/PROJECT_KNOWLEDGE_BASE.md` is an index only — links, never content.
- Reply to the user in the user's language (usually Vietnamese); docs stay English.

## Commands

```powershell
pnpm install
docker compose -f docker/docker-compose.yml up -d      # MongoDB on 127.0.0.1:27018
pnpm --filter @mc/shared build                         # server consumes shared's dist
pnpm import:seeds                                      # legacy seeds -> data_tbl_* collections
pnpm dev:server                                        # http://localhost:4000, ws /ws
pnpm dev:client                                        # http://localhost:5173 (proxies /ws, /res)

pnpm -r lint                                           # typecheck every package (build gate)
pnpm -r test                                           # node:test via tsx (*.test.ts)
pnpm --filter @mc/server test                          # one package
node --test --import tsx path/to/file.test.ts          # one file (run inside the package)
```

- Tests use `node:test` + `node:assert/strict`, colocated as `*.test.ts`, run through `tsx`. Pure
  logic (formulas, mappers, decoders) gets unit tests; avoid needing Mongo in unit tests.
- After changing `packages/shared`, rebuild it (`pnpm --filter @mc/shared build`) before running the
  server; the client reads its sources directly through the Vite alias.
- Asset regeneration: see `README.md` § Assets and `docs/assets-pipeline.md`.

## Subagents & Skills

| Name | Kind | Use for |
|---|---|---|
| `feature-pipeline` | skill | port a legacy feature end to end: research → plan → implement → verify → memory |
| `nest-game-server` | skill | any server change: RPC handlers, services, schemas, gamedata, pushes |
| `pixi-client` | skill | client work: Pixi scene/entities, DOM UI, net calls/callbacks, sheets |
| `swf-asset-pipeline` | skill | converting/inspecting legacy SWF/asset files, sheet & hit-mask formats |
| `flash-client-researcher` | agent | read-only tracing of the decompiled Flash client (RPCs, callbacks, UI strings) |
| `legacy-server-researcher` | agent | read-only tracing of the legacy Go server + seeds (rules, formulas, push order) |
| `mc-plan-implementer` | agent | executes an approved `docs/plans/*.md` in this repo |

Spawn subagents to isolate context, parallelize independent work or offload bulk mechanical work;
don't spawn when the parent needs the reasoning or the task is a few tool calls. Cheapest capable
model: Haiku for mechanical bulk work, Sonnet for scoped research/implementation, Opus for planning
and tradeoffs. The parent owns synthesis and verifies subagent claims before relaying them. User
instructions override this file.

## References

- `README.md` — overview, quick start, protocol summary.
- `docs/PROJECT_KNOWLEDGE_BASE.md` — index of `docs/memory/*.md` and other docs.
- `docs/assets-pipeline.md` — SWF conversion tools and sheet/hit-mask formats.
- `docs/research/`, `docs/plans/` — prior research and plans.
