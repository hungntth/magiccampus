# Quests (newbie / main chain)

Plan: `docs/plans/2026-11-03_02_QUEST_CORE.md`. Implemented 2026-11-03. Builds on `npc-dialog.md`.

## Contract (`packages/shared/src/protocol.ts`)
- RPCs (all `requireCharacter`, **not quiet yet**): `takeQuest(questId, npcId)` -> `null`;
  `finishQuest({i, s, n} | id)` -> `FinishQuestReply {flag, qid, qn}`; `cancelQuest(questId)` -> `CancelQuestResult`
  (also pushed as `onCancelQuest`); `initQuestManager()` -> `{q: Record<qid, ChaQuest>}`.
- Pushes: `onAddChaQuest(ChaQuest)`, `onSetNpcState(npcId, state)`, `onAddMoney(charId, key, amount, total)`,
  `onUPP(PlayerUpdate)`, `onPlayerLevelUp({id, level, exp, lp})`, `onCancelQuest`.
- Push order on finish: `onAddMoney` -> `onUPP` -> `onPlayerLevelUp` (if leveled) -> `onSetNpcState` for every NPC on the map.
- `NpcFuncInit.npcQuest.list` is `Record<qid, QuestView>` (server sends full static data; H5 has no client quest table).
- `PlayerData` += `moneyBind, attrPoints, questLog ("|id|id|", "|" empty), qn`. `SceneNpc.questState` (H5 extension,
  filled by `createNpcs`). `LEVEL_EXP` (levels 1..21 cumulative) lives in shared so the HUD can show next-level exp.
- Types: `QuestState` 101-104, `QuestType`, `MoneyType` (1 moneyBind, 2 money, 3 goldBind, 4 gold), `MAX_QUEST_NUM` 25.

## Server
- `server/src/modules/quest/`: `quest.schema.ts` (`character_quests` = active rows with objectives, unique
  (characterId, questId); `quest_history` = finished, unique), `quest.rules.ts` (+ test; pure), `quest.service.ts`,
  `quest.rpc.ts`, `quest.module.ts` (registers its own `Character` model to avoid a CharacterModule cycle).
- `gamedata/quest-data.ts`: typed `QuestTemplate` / require / pre rows + indexes; `GameDataService.getQuest`,
  `questsByStartNpc`, `questsByFinishNpc`, `questRequire`, `questPre`, `templateName(type, id)` (item 29 / equipment 19,
  on-demand query, `#id` fallback).
- Supported slice: types {1, 2, 4, 10} and every require row is the accept-time granted item (or none). Unsupported quests
  are never listed or marked. All supported quests are born 104 (objectives met at accept).
- Gating: `npcId == start_npc` / `finish_npc` and that NPC on `session.mapId`; 25 active max; `acceptBlocker` gives the
  Vietnamese reason (thrown as `FORBIDDEN`). Kind-1 pre rows (carry item) always block (no inventory).
- Finish = spend first: conditional `deleteOne` of the active row (deletedCount must be 1), insert history, then exp/money.
- Exp: `Character.exp` is **cumulative**; level-up while `level < 20` and `exp >= LEVEL_EXP[level]` (Go keeps per-level exp
  internally but sends cumulative; same thresholds). Per level: +5 `attrPoints`, +1 to each of the 5 stats. HP/MP not recalculated.
- Money: type 1 -> `moneyBind`, 2 -> `money`, 3 and 4 -> `gold` (no goldBind field yet).
- `server/tools/import-seeds.ts`: `KNOWN_COLUMNS` for column-less `INSERT` seeds (`data_tbl_quest_pre`); unknown ones log an
  ERROR and are skipped. `data_tbl_quest_pre` = 2017 rows.

## Client
- `game/QuestController.ts`: quest map, push handlers, `initQuestManager` after each scene load, take/finish/cancel
  throttled 1100 ms, chat lines ("Nhận nhiệm vụ: …", "Hoàn thành nhiệm vụ: …", "Nhận được N Exp, M Tiền", level-up), HUD refresh.
- `ui/questPanel.ts` (Nhận / Xong / Bỏ / Đóng; "Xong" only at the finish NPC, "Bỏ" disabled for type 1, "Hệ thống" from the
  tracker), `ui/questTracker.ts` (right side, "[Tân Thủ]" / "[Chính]" / "[Phụ]" prefixes, "Tìm <NPC>" when 104 → walk+talk
  on the same map, else toast with the map name), `ui/npcDialog.ts` quest rows, `Entity.setQuestState` text markers
  ("!" yellow 102, "?" grey 103, "?" yellow 104), HUD Exp + Tiền. `game/sceneCommands.ts` holds /go and /maps (moved out
  of GameScene for the line cap).

## Chain (verified by simulation over the seeds, class 1)
1 (240→231, Lv1) → 3 (231→232, Lv2) → 2 (232→238) → 4 (238→237) → 3191 (237→455) → 160 (455→239, Lv3) → 161 (239→430).
NPC 430 (Sứ Giả Viên) is on **map 3 (Vân Đài)**, so 161 is turned in and 46 taken there (`/go 3`). 47+ need items/kills.

## Deferred
Item/equipment/pet rewards and accept-time grant items (no inventory), kill/collect/pet objectives, quest manager window,
loop/daily/class/guild quests, choose-one rewards, real marker art, HP/MP recalculation, goldBind field, cross-map
pathing for "Tìm". Quiet the 4 quest RPCs only after the user confirms the feature works.
