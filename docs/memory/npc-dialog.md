# NPC dialog (click NPC -> talk)

Plan: `docs/plans/2026-11-03_01_NPC_TALK.md`. Implemented 2026-11-03.

## Contract
- RPC `clickNpc(npcId)` (not quiet yet) -> returns `null`, pushes `npcFuncInit` (`NpcFuncInit` in shared) to the caller.
- Server checks: integer id, NPC exists, NPC is on `session.mapId` (H5 hardening). No distance check.
- `npcType` = row type only for function types {2,5,7,8,9,13,16} else 0; `npcQuest` = `{npcId, state, list: Record<qid, QuestView>}` from `QuestService.listForNpc` (see `quest.md`);
  `onServiceText` = `data_tbl_npc.on_service_text` (H5 extension, server-sent).
- `SceneNpc.subType` is now a raw string.

## Files
- shared: `packages/shared/src/protocol.ts` (`NpcType`, `NpcFuncInit`; `NpcQuestEntry` replaced by `QuestView`)
- server: `server/src/modules/npc/{npc.service,npc.rpc,npc.module}.ts` + `npc.service.test.ts`;
  `GameDataService.getNpc` (`npcsById`)
- client: `Entity.ts` (`npcType`, interactive NPCs, `say()` bubble 5 s / 220 px wrap), `GameScene.ts`
  (`onNpcClick`, `onNpcFuncInit`), `ui/npcDialog.ts`, `style.css` (`.npc-dialog`)

## Client behaviour
- Tap on NPC stops propagation. > 250 px: walk to a point 120 px from the NPC, re-click on arrival (ground tap cancels).
  1100 ms throttle per NPC. WALK/BATTLE/STORY_BATTLE/QUEST_BATTLE/BOSS/HULA/DOTA/TRIPLE_TOWN -> placeholder toast.
- Talk-only (quest state <= 0 and npcType <= 0) -> bubble; else DOM dialog "Đối thoại" with quest rows (sorted by state desc,
  click -> quest panel), function button (placeholder toast) and "Rời khỏi".
- NPC head markers: `SceneNpc.questState` at creation, then `onSetNpcState` (QuestController). Dialog closes on scene change/destroy and when the player is > 300 px away.

## Deferred
Function panels (shop/bank/heal/...), per-NPC scripts, combat/minigame NPCs. Quiet `clickNpc` only after user confirms.
