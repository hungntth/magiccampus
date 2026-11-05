---
name: m12-client-petbattle
description: M12 client slice C6 facts - PPVE / arena windows, WatchMode replay, HUD buttons, smoke recipe and traps
metadata:
  type: project
---

- Wiring: `PetController` owns `PpveController` + `ArenaController`; HUD entries are the red column buttons "Đấu Pet" / "Điêu Khắc" in `ui/hud/miniMap.ts` (`MiniMapTray.arena / ppve`, `HudActions.onArena / onPpve`); the column height is 290 px for 10 buttons. Replay = `WatchMode` (`onBattleReplay`), see plan notes C6.
- Client tests are not in `pnpm -r test` (client has no test script, and `tsx` is not resolvable from `client/`): run `node --test --import ./server/node_modules/tsx/dist/loader.mjs client/src/ui/petbattle/<file>.test.ts` from the repo root after `pnpm --filter @mc/shared build` (tsx resolves `@mc/shared` to dist).
- Fixture recipe (scratchpad): `m12g_fix.js` + `m12g_boost.js` (PPVE pets 981001.., stash wallet) then `c6_fix.js` (arena pets 982001.. for cids 1 / 5, wipes arena collections); extra boost to win PPVE floor 1: pets level 160 + aptEx 4000/1000/4000/4000/1000. Clean = `c6_clean.js` then `m12g_clean.js`. `c6_arena_bot.mjs [secs]` = watchbot registers first and stays online (defender pushes). Fixture pets have `exp: 1`, so the client shows Lv1 (client level comes from exp).
- Browser: a TS edit reloads the page (re-login via DOM: set inputs + dispatch `input`, click "Đăng nhập", `.char-list .char-card`, "Vào game"). To start a live battle: hook `WebSocket.prototype.send` (only `/ws` urls) to capture the socket, `/go 2` through the real chat input (click + type + Return), then send `cbom` calls until `.in-battle`. `/go` changes the hudtest map in Mongo: restore `mapId 30, posX 460, posY 510` (minimap coords x10). Replays take ~30-45 s in the hidden pane. Panel buttons are found by text; `.confirm-dialog button` "Đồng ý" for confirms.
- Server pitfall seen again: a PPVE challenge push order is `changePPLoadingState` (hides the overlay) -> `onSendReplayPPVEPanel` -> `onUpdatePPVEPanel`; `savePPVEConf` has no success reply, only the echo push (arg 3).
