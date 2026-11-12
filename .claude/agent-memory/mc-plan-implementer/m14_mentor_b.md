---
name: m14-mentor-b
description: M14 phase B (mentor) wiring and smoke pitfalls - NPC 49 sits on a non-existent map, pkill misses Windows node, server dist vs shared dist
metadata:
  type: project
---

- `modules/mentor/`: per-teacher lock `withKeyLock('mentor:<id>')`; `*Locked` helpers never lock, `qualify()` locks itself (do not call it from inside the lock). One `mentor_links` row per student serves both sides.
- NPC 49 is on map 100 (no `data_tbl_map` row; Go calls map 100/200 placeholders): reachable only as a per-viewer instance NPC (`InstanceNpcService.register`, id 49 kept so `clickNpc` -> `instanceOf` resolves it because `pos_map_id` != session map).
- Smoke: `pkill` in Git Bash does not kill Windows node; stop a server I started with PowerShell `Stop-Process -Id` (a surviving old server silently keeps :4000 and the new build never runs). `lib.mjs` clients: close old L / M sockets before re-login or the kick handler dissolves the new party.
- Server tests read `@mc/shared` dist: rebuild shared before `tsc` / tests after editing `packages/shared`.
- Browser: Vite reloads to the login page after a CSS edit; the player level in the client only changes through pushes, so relogin after a Mongo level edit. Shared `.friend-list` is a fixed 190 px: use `:has(> .mentor-body)` instead of adding classes to it.
