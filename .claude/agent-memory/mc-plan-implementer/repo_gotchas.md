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
