# Loop quests (M8 phase C)

Plan: `docs/plans/2026-11-04_09_ACTIVITIES.md` (phase C notes). Shared `loop.ts`; server `modules/loop/` (`LoopCoreModule` = state and data, so that `QuestModule`
can import it without a cycle); client `game/LoopController.ts`.

- **Playable loops**: `TBL_QUEST_LOOP` live lids 2, 4, 5, 6, 7, 9, 16; `min_level` 200 rows are disabled.
  - Playable round counts (H5 objective types only): lid 9 (200 vòng) 815/924, lid 5 (pet training) 123/123, lid 2 (guild) 238/275, lid 7 12/17.
  - **Trị An (4), Trừ Ma (16) and Tu Luyện (6) have no playable round** (all boss summons or unspawned creatures), so their "[Vòng]" entry is hidden and `takeLoop` refuses them.
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
- **Not done**: a cooldown display, the Flash quest-manager loop tab, team gating (Go ignores it too), boss-summon rounds.
- The seed importer regex now has the `i` flag, so `data_tbl_schedule_boss` (150 rows) is imported. The re-import is idempotent.
