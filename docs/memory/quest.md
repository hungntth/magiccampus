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

## Start-grant columns fix (2026-11-03)
- `data_tbl_quest` seed rows have 28 values: the 26 baseline columns + `start_grant_item`, `start_grant_qty` (legacy migration
  `20260505185430_add_quest_start_grant_columns.sql`). `KNOWN_COLUMNS` listed only 26, so both were dropped on import,
  `isSupported` rejected every quest whose require row is the accept-time item (e.g. **160** "Ủy Thác Của Vệ Sĩ" -> item 335),
  and the main chain stopped after 3191 (reported on "Phương Nguyên": no active quest, nothing to take). Fixed the column
  list, `import-seeds` now logs an ERROR when rows have more values than columns; re-imported `data_tbl_quest`
  (209 quests with a grant). The server caches quests at startup: restart it after a re-import.

## Kill / collect objectives (M2 phase B, 2026-11-04)
- Supported now: collect (kind 1 / type 29 / q < 0) and kill (kind 2 / type 12).
  - Kill counts live in `character_quests.objectives[].current` and are credited at battle settle.
  - `questKill` in `onAddChaQuest` carries the **remaining** count.
- Collect objectives are bag-derived. `finishQuest` re-syncs from the bag, refuses with "Chưa hoàn thành yêu cầu nhiệm vụ" when short,
  **consumes** the items (Go `CompleteQuest`), and pushes the slot changes before `onAddMoney`.
- Grant-item objectives keep the old behaviour: met at accept, not consumed, because `start_grant_item` is not granted into the bag yet.
- Pure helpers `quest/quest-progress.ts` and shared `questProgress.ts`. Details: `combat.md`.

## Deferred
Item/equipment/pet rewards and accept-time grant items (no inventory), equipment/quality/pet objectives, quest manager window,
loop/daily/class/guild quests, choose-one rewards, real marker art, HP/MP recalculation, goldBind field, cross-map
pathing for "Tìm". Quiet the 4 quest RPCs only after the user confirms the feature works.

## Quest window redesign (2026-11-03)
- `client/src/ui/questPanel.ts` + `questPanel.css`: "NPC nhiệm vụ" window like legacy QuestPanel/QuestCanvas, plain
  HTML/CSS (no skin images): left = portrait, NPC name, speech (startText; completeText at 104), Nhận / Xong / Bỏ; right =
  "Mô tả nvụ" box ([type prefix #1E90FF][name in MSG_ITEM_COLOR], info, "Yêu cầu nhiệm vụ:", NPC nhận/trả with NPC
  #FFCC00 and map #33FF66), Tiền / Exp, 6 empty Quà slots (item rewards not ported). Drag by the title bar, Esc / × close.
- `QuestView` += `sMid`, `sMap` (start NPC map; legacy QuestCanvas `sMid`). `TYPE_PREFIX` exported from questTracker.
