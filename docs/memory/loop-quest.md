# Loop quests (M8 phase C)

Plan: `docs/plans/2026-11-04_09_ACTIVITIES.md` (phase C notes). Shared `loop.ts`; server `modules/loop/` (`LoopCoreModule` = state and data, so that `QuestModule`
can import it without a cycle); client `game/LoopController.ts`.

- **Playable loops**: `TBL_QUEST_LOOP` live lids 2, 4, 5, 6, 7, 9, 16; `min_level` 200 rows are disabled.
  - Playable round counts (H5 objective types only): lid 9 (200 vòng) 815/924, lid 5 (pet training) 123/123, lid 2 (guild) 238/275, lid 7 12/17.
  - **Tu Luyện (6) has no playable round** (unspawned creatures), so its "[Vòng]" entry is hidden and `takeLoop` refuses it. Trị An (4) and Trừ Ma (16) play only their loop-boss rounds (M9, below).
- **RPCs** (un-quieted):
  - `takeLoop(lid, npcId)`: gates are level, the NPC = the loop's nid, not already running, and the cooldown (take time + `refresh`, as in Go).
  - `cancelLoop(lid)` → `onCancelLoopQuest {flag, id}`.
  - `loopRepaire(lid)`: re-issues a missing round quest.
  - `cancelQuest` on a loop round is refused; use `cancelLoop` instead.
- **Rounds**: each round is a normal active quest (tracker and NPC markers work), picked uniformly among playable rounds.
  - Reward: the Go class-quest formula (`loopRoundReward`, `BASIC_GET_EXP/MONEY`). The state advances before the credit. No `quest_history` row.
  - Push order: `onFinishLoopQuest {id, ft}`, then the next round's `onAddChaQuest` (H5 extensions `num`, `name`).
  - `DiaryEvents` per round, plus the 200-vòng milestones 13–16.
- **Login**: `loopInfo.d[lid]` with `canTake`. The NPC dialog shows "[Vòng]" entries and "- Khôi phục" when a round quest is missing.
- **Not done**: a cooldown display, the Flash quest-manager loop tab, team gating (Go ignores it too), the Trị An hiding spot (any field map works).
- The seed importer regex now has the `i` flag, so `data_tbl_schedule_boss` (150 rows) is imported. The re-import is idempotent.

## Loop bosses (M9 phase E)
- Plan `docs/plans/2026-11-04_12_CORE_LOOP.md` (phase E notes). Rules `modules/loop/loop-boss.ts` (pairing table: 4671 / 7667 item,
  7668 / 7669 / 7670 map), state `loop-boss.service.ts` (in-memory summons, LoopCoreModule). Client `game/BossLayer.ts` over `game/NpcLayer.ts`.
- RPCs (un-quieted): `createBoss()` -> `onCreateBoss(map by nid)` (loop.rpc), `setNpcState(id)` -> `onSetNpcState` (quest.rpc).
  Pushes `onBossOn(row)` (map round taken on a listed map / order item used), `onBossOff(nid)` (kill done at battle end, round finished or cancelled).
- Trị An: the order item (2263 / 4843) is granted on take, kept on use (re-summons), removed on finish / cancel; summons stand
  80 px right of the player on a field map. Boss level = character level, HP ÷10 / ÷100. Trừ Ma: NPC spot on maps 10/38/31 or 27.
- clickNpc accepts a boss NPC off its seed map while the character sees it; the quest-battle bridge falls back to the paired round.
- Air bosses (7669 / 7670, layer 3) are drawn on the ground.
