# NPC dialog (click NPC -> talk)

Plan: `docs/plans/2026-11-03_01_NPC_TALK.md`. Implemented 2026-11-03.

## Contract
- RPC `clickNpc(npcId)` and `npcFuncClick(npcId)` (neither quiet yet) -> returns `null`, pushes `npcFuncInit` (`NpcFuncInit` in shared) to the caller.
- Server checks: integer id, NPC exists, NPC is on `session.mapId` (H5 hardening). No distance check.
- Shop NPCs (`shop_id > 0`): without quests `clickNpc` pushes `onOpenShop` directly (no `npcFuncInit`); with quests `npcFuncInit` has `npcType` = 2 and the function button calls `npcFuncClick` -> `onOpenShop` (see `shop.md`).
- `npcType` = row type (unless `shop_id > 0` -> 2) only for function types {2,5,7,8,9,13,16} else 0; `npcQuest` = `{npcId, state, list: Record<qid, QuestView>}` from `QuestService.listForNpc` (see `quest.md`);
  `onServiceText` = `data_tbl_npc.on_service_text` (H5 extension, server-sent).
- `SceneNpc.subType` is now a raw string.

## Files
- shared: `packages/shared/src/protocol.ts` (`NpcType`, `NpcFuncInit`; `NpcQuestEntry` replaced by `QuestView`)
- server: `server/src/modules/npc/{npc.service,npc.rpc,npc.module}.ts` + `npc.service.test.ts`;
  `GameDataService.getNpc` (`npcsById`)
- map NPC visibility: `GameDataService.npcsOnMap(mapId, now)` filters through `gamedata/npc-visibility.ts` (+ test),
  a port of legacy `npc_time.go` IsActiveAt (`at` column: `new|date-date` range or `h|dow|day|month0|tag` schedule,
  ICT, MushroomFruit 06h/18h window) and `unclickable_npcs.go` (hidden ids; 1799 hidden until dongxuan is ported).
  Without it map 9 showed all 116 rows (expired event envoys); now ~37. Dragon-ball visibility not ported.
- client: `Entity.ts` (`npcType`, interactive NPCs, `say()` bubble = legacy PopupText, see `chat.md`), `GameScene.ts`
  (`onNpcClick`, `onNpcFuncInit`), `ui/npcDialog.ts`, `style.css` (`.npc-dialog`)

## Client behaviour
- Tap on NPC stops propagation. > 250 px: walk to a point 120 px from the NPC, re-click on arrival (ground tap cancels).
  1100 ms throttle per NPC. WALK/BATTLE/STORY_BATTLE/QUEST_BATTLE/BOSS/HULA/DOTA/TRIPLE_TOWN -> placeholder toast.
- Talk-only (quest state <= 0 and npcType <= 0) -> bubble; else DOM dialog "Đối thoại" with quest rows (sorted by state desc,
  click -> quest panel), function button (`NpcDialog.show(..., onFunc)`: Shop -> `npcFuncClick`, other types placeholder toast) and "Rời khỏi".
- Dialog look follows the Flash window (pure CSS, no skin assets): navy panel + gold frame, banner title, top-right close button, 56 px framed
  portrait, function button (orange) under the name, scrolling text box, "Nhiệm vụ" list box with state markers
  (`!` red = can take, `?` grey = taken, `?` gold = can finish; tooltip carries the state), centered "Rời khỏi".
- NPC head markers: `SceneNpc.questState` at creation, then `onSetNpcState` (QuestController). Dialog closes on scene change/destroy and when the player is > 300 px away.

## Deferred
Function panels other than shop (bank/heal/...), per-NPC scripts, combat/minigame NPCs. Quiet `clickNpc` only after user confirms.

## Hover glow (2026-11-03)
- Hovering an NPC puts `CHAR_SELECTED_GLOW` (`client/src/game/GlowFilter.ts`, GLSL + WGSL) on its sprite, not the name: port of
  legacy `CreatureView.mouseOverHandler` / `GamePredef.FILTER_CHAR_SELECTED = GlowFilter(0xFFFFFF, 5, 10, 10, 3)`, removed on roll-out.
  Fragment uniforms shared with the vertex shader (`uInputSize`) must be declared `highp`, or the program fails to link.

## Name and title labels (2026-11-03)
- Names sit under the feet (`client/src/game/EntityLabels.ts`): legacy RoundedText Arial 12 with dark outline; players
  #ffff00 (CreatureView), NPCs #ccffcc (NPCView 13434828). Lines 15 px apart from y=10: [permanent title `t`] / name /
  [active title `actT`] (CharactorView.setTitle, fixTextsPos). `Entity.setTitles(title, actTitle)` takes already-styled
  lines (data_tbl_title `a` = "color|prefix|suffix" around `n`); nothing calls it yet (titles not ported).
- Bubbles and quest markers anchor to `Entity.headY` (sprite top), not to the name.
- NPC dialog ("Đối thoại", `.npc-header` 28 px strip) and quest panel (its `h3` title) use the same
  `makeDraggable(root, header)` + `closeOnEscape` as the shop; disposed in `close()`.
