---
name: m14-track2
description: M14 Track 2 (rooms F, chat G, 3v3 arena H) wiring facts, smoke recipe (compiled server on a spare port), pitfalls
metadata:
  type: project
---

- Rooms = `Party.room` ad on the party (party-rules.ts); `PartyService.onLeave(hook)` is the single place leave / kick / disconnect results can be observed. `roomChat` lives in the chat module (chat imports party, not the reverse).
- Chat: ban gate + `/huycam` sit in `ChatService.say` before the Loa spend; `HeadlineService` replays through `SceneHooks.onMapChanged(fromMap 0)`. ChatModule imports SceneModule (no cycle).
- 3v3: `ThreePvpState` lives in `ThreePvpCoreModule` (ActivityService reads the strip entry); `BattleSettleService.settlePvp` runs `hooks.runEnd`; tagged PvP battles (ctx) take the group disconnect path; `BattleContext.alive` is captured before `restoreFull`.
- shared `package.json` test script lists test files explicitly: append new `*.test.ts` there (another agent edits it too: do a one-shot node replace).
- Smoke recipe without the nest watcher (other agents restart it): `cd server && npx tsc -p tsconfig.json --noEmit false --outDir .tmp_f_out`, then `PORT=4100 DEV_COMMANDS=1 node .tmp_f_out/src/main.js` (spare port; port 4000 only when the Vite proxy is needed). ws bot lib = scratchpad `m14t2_lib.mjs` (PORT env). Kill by `netstat -ano | grep :PORT` + `taskkill //PID`. Delete `.tmp_f_out` afterwards.
- Edit traps: `node -e "..."` multi-line replaces silently miss on CRLF files (shop.service.ts is CRLF); verify with grep after every scripted edit or use the Edit tool. Heredocs with apostrophes abort the whole command: use the Write tool for any Vietnamese text.
- GM RPCs need `requireGm` (DEV_COMMANDS=1 opens them to every account); the 3v3 test window is `gmThreePvp(minutes)`, dev stop `gmThreePvpStop`.
- Browser: strip icon positions shift when icons appear: click by DOM (`.act-icon`) not by screenshot coordinates; hidden-pane battles animate slowly (use Auto, or kick the bot's session to end a battle fast).
