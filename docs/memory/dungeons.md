# Dungeons & instances (M10)

Plan: `docs/plans/2026-11-04_13_DUNGEONS.md` (implementation notes per phase at its end). Legacy specs:
`E:\mcgame\docs\memory\dungeon-*.md`. Phase order: A → E2 → B → C → D → E → F → G → H → I.

## Status
- Phase A (foundation), E2.-1 (current Go damage formula), E2 (boss mechanics engine, combat.md) and B (framework + Quỷ Hút Máu,
  Mê Huyễn, Kho Báu, Kho Báu [Sự kiện]) C (Lục Tiên, Liệt Diễm, Lang Huyệt), D (Thám Hiểm, Thế Giới Số, quick complete), E (star-instance.md), G (maze.md, quiz.md)
  H (training.md), F (boss-towers.md) and I (world-boss.md) done 2026-11-05: M10 implemented. Open: tower / boss balance.

## Foundation (phase A)
- **Seed overlays**: the importer writes each seed file to its own collection; `gamedata/overlays.ts` lists every overlay
  per base table (explicit list, never a prefix match) and `GameDataService.rowsWithOverlays(base, filter)` unions them
  (same id replaced, new ids appended, like Go's ON CONFLICT). UPDATE-only seeds are TS constants there
  (`QUEST_REWARD_OVERRIDES`, `NPC_AT_OVERRIDES`). Parser: `server/tools/seed-parser.ts` (schema optional, `AS alias`).
- **Instance tables**: `gamedata/instance-data.ts` `InstanceDataService` (`planRows(st)`, `itemAwardRows(bagId)`).
- **Rewards**: `modules/rewards/` — `rollPlan` (TBL_PLAN t = 3), `pickItemAwards` (Go award picker), `GrantService`
  (`fromPlan`, `unpack`, `fits`, `grant`). Gift bags are unpacked at grant time (decision 11).
- **NPC scripts**: `modules/npcscript/` — `NpcHookRegistry` (click / script / hit hooks; first claimer wins), menu push
  helpers (`sendList` = onList, `npcMsg`, `midNote`, `systemSay`, `notice`), `InstanceNpcService` (per-viewer NPCs,
  `onNpcOn` / `onNpcOff`), RPC `npcScript(func)`. Func ids are Go's, verbatim. Dev: `gmNpcMenu` / `/npcmenu <npcId>`.
- **Scene**: `scene/scene-hooks.service.ts` `SceneHooks` — gate guards (sceneChange refusal = onMidNote) and map-change
  listeners (run after the onSceneEnter / reply, from every entry path).
- **Combat**: `Battle.ctx` (`BattleContext`), `combat/battle-hooks.ts` `BattleHooks` (`onEnd(source)`, `onReply(source)` =
  battlePlayEnd reply), `NpcBattleService.startNpcFight(session, nid, {group, level, ctx})`. Round cap is opt-in per battle
  (`ctx.roundCap`); PvE has no cap by default (Go since 2026-10-31).
- **Quests**: type 6 (daily) supported; done = finished today (UTC+7) for type 6 (`quest/quest-daily.ts`); history is an upsert;
  `QuestService.completedToday`; rt / rn turn-in cost charged before items are consumed (refusal "Không đủ Bạc!" etc. as Go);
  `QuestGates` (`addTakeGate`, `onFinished`, `onAbandon`).
- **Client**: `game/NpcScriptController.ts` (onList / onNpcMsg / onMidNote / onSystemSay), `game/InstanceNpcs.ts`,
  `ui/npcDialog.ts` `showMenu`.

## Framework (phase B, `modules/dungeon/`)
- **Defs** in shared `dungeonDefs.ts` (`DUNGEONS`, 9 rows, `enabled` per phase); `dungeon-rules.ts` indexes only enabled ones, so
  unported dungeons keep ungated maps. A phase enables its row and adds a `<key>/` hooks folder.
- **State** `character_dungeons` (one run per key = Go base + rules run), every write via `DungeonStateService.mutate` (rev CAS).
  `questsDone` / `questDone` = completed today (ledger) or `credited` by the run leader.
- **Hooks** (NpcHookRegistry order): per-dungeon spawns 30, chest 40, entrance 50, floor NPCs 60, pick-ups 70, generic fighter 80.
  Per-dungeon code listens to `DungeonEvents` (`onVictory` with the credited ids, `onCredit` leader turn-in, `onClosed` sweeper
  close) and tunes line-ups with `DungeonFightService.addTuner` / `fight(session, nid, tune)`; encounters with `EncounterService.addTuner`.
- **Spawns** reuse template ids (Go map-200 templates): clickNpc / hitNpc treat an id whose row is on another map as an instance NPC.
- **Chest** = instance NPC (provider + onNpcOn after the final quest / final boss); completion reward + Bí Kíp row + level × expPerLevel.
- **Sweeper** 15 s: Mongo query of entered open runs + floor-map sessions; eject = `support.teleport(..., follow false)` + notice.
- **Views**: `onDungeonRun` on map change into / out of floors and after progress; `getFbInfo` for the hub. GM: `/dg reset <key>`,
  `/dg time <key> <min>`, `/fb`.
- **Engine**: NPC line-ups use 10 slots (`LINEUP_SLOTS`); dead members of a won battle get quest kill credit.

## Phase C dungeons
- **Lang Huyệt** (`dungeon/langhuyet/`): holder = run leader; instance ids 9715000 + kind×100 + idx; in-memory `LhParty` (witches,
  wolf choices, mushroom stock; reset on restart, as Go); funcs `lh_go_<map>`, `lh_wolf_<k>`; wolf forms: second 683 moved to slot 5
  (pet-row centre) = `immuneMagic`, main-row form = `immunePhys`; kill relay via `BattleHooks.onAnyEnd` on 510-514.
- **Lục Tiên** (`dungeon/luctien/`): doors `lt_door_<npc>` / `lt_exit_<npc>`, `lt_rekey`, quiz `lt_quiz_ask_<judge>` /
  `lt_quiz_ans_<judge>_<answerId>_<A-D>` (`gamedata/answer-quiz.ts`, reusable for daily answer), `lt_fight_<npc>`; pet 625 easy catch in
  shared `petCatch.ts`.
- **Liệt Diễm** (`dungeon/lietdiem/`): instance ids 9014000 + kind×100 + slot, state in `beaten` + `DungeonRun.extra.crystals`.
- **Shared infra**: `QuestCreditService.credit(cid, itemId, n, kind = 6)` (server-side objective credit; kind-6 rows are supported
  objectives now), `BattleHooks.onAnyEnd`, `enterLabel` export.

## Phase D
- **Thám Hiểm** (`dungeon/thamhiem/`): steles `th_stele_<npc>_<stone>`, quiz `th_quiz_ask` / `th_quiz_ans_<id>_<A-D>`, spots 9225201-206;
  chest finishes the run; `DungeonChestService.addExtraRewards(key, fn)`.
- **Thế Giới Số** (`dungeon/thegioiso/`): maze portals, `SceneTransportService.followLeaderOnMap` (same-map follow).
- **Quick complete** (`modules/autotask/`, shared `autoTask.ts`, client `ui/autoTaskPanel.ts`): 6 RPCs (not quiet), needs a clear at
  the exact difficulty (`levels[key]`), refusals are `onSystemMidMsgOrNote` pushes.

## Pitfalls
- Opener quests sit at NPC 200 (map 31, 3130,1520); 5239 Mê Huyễn lv 50, cost 100.000 Bạc, award Hoa Mê Ảo 3018.
- New RPCs not quiet (phase D): the 6 auto-task RPCs.
- Bot recipe: scratchpad `p3_bot.mjs` (A hudtest / B watchbot / C lhbot; steps party, fight, sfight, enc, npcs, lastans); stock
  lv-151 Thế Giới Số creatures beat the boosted lv-120/151 test chars. hudtest was raised to level 151 and its bag emptied for D.
- Ticket expiry (1440 min) is not ported (no item expiry in H5).
- New RPCs are not quiet: `npcScript`, `gmNpcMenu`, `getFbInfo`, `gmDungeon`. Ask the user before quieting.
- Test chars (local DB): hudtest char 1 and watchbot char 5 were boosted for the B runs (level 120, strength / stamina 200000,
  agility 50000; watchbot gmLevel 1). Phase C added a third local account lhbot / char 6 "LangBot" (same boost, gmLevel 1) for
  3-member runs (`server/.env.example`). Solo lv-50 characters cannot beat the 10-unit boss line-ups.
