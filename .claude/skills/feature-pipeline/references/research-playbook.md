# Research Playbook

Phase 1 techniques for porting a legacy feature. The legacy repo `D:\mcgame` is read-only.

## 1. Start from existing knowledge

- `D:\mcgame\docs\memory\*.md` — ~60 per-feature notes from the Go project (item-inventory,
  npc-quest-system, battle-combat, exp-leveling, pet-system, guild-system, …). They often contain the
  full RPC contract and the gotchas. They describe the Go port, which itself was reverse-engineered —
  verify load-bearing facts against the client or seeds.
- `D:\mcgame\docs\research\`, `D:\mcgame\docs\plans\` — prior Go-side research and plans.
- This repo's `docs/memory/` and `docs/research/` for what the H5 port already decided.

## 2. Client contract (decompiled Flash, `D:\mcgame\docs\client`)

Entry points, most useful first:

1. `system/CallBack.as` / `system/CallBackGlobal.as` — every server push. The handler body shows which
   keys are read and the order UI updates fire; it is the most reliable payload source.
2. RPC call sites — grep for the method-name string to find argument count/order/types and whether
   the client waits for a reply or expects a push.
3. `config/Language.as` — grep the on-screen Vietnamese text, then follow the constant to its panel.
4. Panels / managers — client-side gating and formulas; note where gating is *absent*.

Rules that always hold:

- RPC/callback names are kept exactly, typos included (`chooseCharactor`, `acountLv`).
- Values fed to `Date` are epoch milliseconds.
- Dynamic entities pushed to the client need explicit coordinates (`posX`/`posY`).
- Push ordering is part of the contract when the client chains UI on it.

In the H5 port the client is ours too, so the payload can be cleaned up (JSON objects instead of
positional AMF arrays) — but keep the legacy field names, and keep the semantics.

## 3. Server rules (legacy Go)

- Handlers: `D:\mcgame\internal\presentation\rtmp\handlers\<feature>\` — arg parsing, pushes, error
  replies. Registration is last-write-wins in the dispatcher; confirm which handler is live (a later
  registration can shadow an apparently relevant one).
- Services: `D:\mcgame\internal\application\<feature>\` — formulas, limits, cooldowns, randomness,
  consume-then-credit ordering.
- Domain: `D:\mcgame\internal\domain\` — enums/constants and their scales.
- Persistence: `D:\mcgame\internal\infrastructure\` + `D:\mcgame\supabase\migrations\` — what is stored
  per player and what lives only in memory.

## 4. Seed / static data

The legacy `data` schema is imported here as Mongo collections `data_tbl_*` with snake_case columns
(`pnpm import:seeds`). Prefer querying Mongo over grepping SQL dumps:

```powershell
docker exec mcgame-mongo mongosh mcgame --quiet --eval "db.getCollectionNames().filter(n => n.startsWith('data_tbl_quest'))"
docker exec mcgame-mongo mongosh mcgame --quiet --eval "printjson(db.data_tbl_item.findOne({ _id: 719 }))"
docker exec mcgame-mongo mongosh mcgame --quiet --eval "db.data_tbl_npc.countDocuments({ pos_map_id: 1 })"
```

- Seed rows use the `id` column as `_id` when present.
- If you must grep `D:\mcgame\supabase\seeds\*.sql`, anchor on column position; a bare number matches
  the wrong column or table.
- Mine low-signal columns: tag columns, placeholder values (e.g. a `pos_map_id` that means "never
  placed"), and description text that narrates the intended mechanic.
- Build id pairing tables (quest ↔ item ↔ npc ↔ creature ↔ map) in the research doc; they become the
  plan's single source of truth.

## 5. Current port survey

- `packages/shared/src/protocol.ts` — which types exist.
- `server/src/modules/*/*.rpc.ts` — grep `@Rpc('` for implemented methods.
- `server/src/modules/gamedata/gamedata.service.ts` — which tables are cached/accessible.
- `client/src/game/GameScene.ts` (`bindCallbacks`), `client/src/ui/` — which pushes the client handles.

## Known pitfalls

- **Id collisions across domains**: the same number means different things in different tables.
  Confirm the domain before pairing ids.
- **Scale mismatches**: item `color` (0–4) vs equipment `ColorCode` (0–5) and similar.
- **Date-scoped vs all-time state**: deriving "done today" from an all-time history table breaks
  daily resets. Make the data source match the scope, and make test fakes mirror the real source.
- **Large outputs**: write long grep/query results to a scratch file and summarize.
- **Stale diagnostics**: `pnpm -r lint` is the arbiter, not IDE squiggles.
