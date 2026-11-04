---
name: repo-gotchas
description: Terse implementation pitfalls in mc-game-new (CRLF files, module cycles, nest --watch restarts, browser testing)
metadata:
  type: project
---

- Some files are CRLF (e.g. `server/src/app.module.ts`, `modules/scene/scene.rpc.ts`); scripted find/replace must normalise line endings. `grep -c $'\r'` in the Bash tool is unreliable.
- Module cycles: `CharacterModule` cannot import modules that import it. Use `GameGateway` hooks (`onDisconnect`, `onCharacterLeave`) for cleanup, and let `SceneModule`/`ChatModule` import `PartyModule` (not the reverse).
- `nest start --watch` restarts on every server edit and drops all sockets and in-memory state (parties): re-login in the browser after each server edit.
- Browser testing: `javascript_tool` times out at 45 s; use DOM clicks for HUD/menus (`.team-tile`, `.player-menu-item`, `.confirm-dialog button`) and real pointer clicks for Pixi entities.
- Phase B party: Flash has no map-wide team-flag push (`onSetTeamLeague` is the league badge); H5 uses `onGroupFlag`.
- Browser tests: the pane is hidden, so Pixi walking/animation is throttled (clicks barely move the player); drive encounters with a scripted ws bot (login md5 from shared dist, `cbom` loop) instead. `gmGoMap` puts chars at spawn (100,100), a tiny walkable pocket: set `posX/posY` in Mongo (e.g. 1436,528) after disconnecting. Other sessions use accounts like `bt_ui_*` on the same map; clicking an unknown entity can invite their character.
- Scripted edits: bash `/tmp` is not visible to node on Windows; keep helper scripts in the scratchpad dir and normalise CRLF (`app.module.ts`, `use-item.*`, `bagActions.ts`, `hud/*.ts`, shared `inventory.ts` are CRLF). A heredoc holding many test files can fail to parse: use the Write tool for files.
- Pets (phase A): `PetModule` imports `InventoryModule`; the reverse call goes through `UseItemService.setPetHook` (cycle-free). Quest finish holds `withCharLock`, so `PetService.award` never locks (the lock is not reentrant). Server tests import `@mc/shared` dist: run `pnpm --filter @mc/shared build` first.
- Browser tests: drive DOM with `javascript_tool` (dispatch `KeyboardEvent` on window for HUD keys, `dblclick` MouseEvent on `.bag-panel [draggable]`); screenshots can lag a hidden pane, re-read the DOM. A CSS edit makes vite reload the page back to the login screen. `Bot` helper idea: global `WebSocket` in Node 24, no `ws` needed.

- Several combat/client files are CRLF (fighters.ts, BattleController.ts, battleMenu.ts): scripted replace must normalise CRLF; Edit with LF text fails on them.
- Big bash heredocs with backticks/apostrophes sometimes truncate or fail to parse in this harness: write long files/scripts with the Write tool.
- Phase C pets: pet fighter = `kind: 'pet'`, slot owner+5, `ownerCid`; `resolveRound` takes pet commands from the same slot-keyed Map, missing -> `petFallbackCommand`. Combat tests build Fighters inline, so widening `Fighter` fields must stay optional.

- Scripted edits via node -e inside bash double quotes: a backtick in the replacement text runs as a command and vanishes; write it with a Write-tool script file instead. browser_batch items need their own tabId (other sessions own the active tab).
- Hidden-pane battle trigger: patch WebSocket.prototype.send in the page, click the map once to capture window.__ws, then send {t:'call',id,m:'cbom',a:[x,y]} frames in a loop until .battle-menu appears; enemies are real-clicked at their screenshot coordinates.
- Phase D pets: caught creature = Fighter.caughtBy (catcher slot), pets created in BattleSettleService.contractCaught, onAddPet in MemberResult.catchPushes (sent last). Pet objectives (quest kind 3) are synced/consumed via PetObjectiveService; objective q = require row at the same index.
- Phase E pets: pet gear = character_items slotType 6, slotIndex petId*8+(pos-50) (shared petEquipSlotIndex); PetModule cannot import CharacterModule (cycle), so gold is charged through PetGoldService on the Character model. Stats go through `PetBonusService.extrasOf(cid,row)` -> `statsOfPet/propertyOfPet/petView(..., bonuses)`; pass it from every new view/battle caller. `rep.cjs` (scratchpad) = CRLF-safe exact replace driven by a JSON spec written with the Write tool; heredocs with apostrophes inside bash still fail to parse. Test pets/gear: set `pets.level` AND `exp` in Mongo (level is stored); login in the browser needs a click on `.char-list .char-card` before `.panel > button`.
