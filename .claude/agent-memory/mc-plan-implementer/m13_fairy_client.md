---
name: m13-fairy-client
description: M13 phase G fairy client - controller/window wiring, map follower layer, browser test recipe and the duplicate-agent collision lesson
metadata:
  type: project
---

- Wiring: HUD pet frame `TL` badge -> `PetController.toggleFairy()` -> `game/FairyController.ts`; window `ui/fairy/*` (FairyUiHost in `fairyTypes.ts`, pure helpers + tests in `fairyConfig.ts`); map art `game/FairyLayer.ts` (own pushes, like PetLayer) wired in GameScene, not an AvatarView layer.
- Client `*.test.ts` cannot run inside `client/` (no tsx): run them from `server/` with `node --test --import tsx ../client/src/...`.
- Controller `send()` pattern: render in `setTimeout(0)` after `finally`, else the caller's `.then` patch lands after the re-render (stale counters).
- Browser fixture: scratchpad `fc_setup.mjs [clean]` (fclient1 / fclient2, gmGrant fairy/item) + `fc_bot.mjs` observer guard/rest. A dev server started by another agent can vanish mid-test; check `netstat :4000` and start your own (kill nest watch tree by pid afterwards; TaskStop leaves dist/main orphaned).
- 2026-11-12: two implementer agents were given the same fairy client task and overwrote each other's files; on unexpected "changed on disk" notes for files you just created, stop and report instead of continuing.
