---
name: m14-brotherhood-c
description: M14 phase C (Kết bái) wiring - core module split to dodge the Scene->Combat cycle, broT via TitleController, TitleService.revoke, smoke + browser traps
metadata:
  type: project
---

- `modules/brotherhood/`: `BrotherhoodCoreModule` (models + `BrotherhoodStore`) is imported by `SceneModule` for `store.decorate` (`broT` on scene payloads); the feature `BrotherhoodModule` imports Social/Party/Title/NpcScript/Quest and cannot be imported by Scene (Scene -> Brotherhood -> Social -> Combat -> Scene). Locks are `withBrotherLocks(ids)` (`brother:<id>`, ascending, not reentrant); `TitleService.revoke` takes the char lock itself so never call it under one.
- NPC 1637 is a normal static NPC on map 10: a click hook on `npc.nid` is enough (no instance-NPC provider). `npcScript` has no distance check, so `brother_disband` works from the IM tab.
- Swear fee covers every newcomer including the leader (3-man new group = 6 000 000). Team throttle ticks add +6 intimacy to party members in long smokes: assert intimacy ranges, not exact values.
- Smoke: compile with `npx tsc -p tsconfig.json --outDir .m14c-dist` in `server/`, run `node .m14c-dist/src/main.js` (DEV_COMMANDS=1), stop it with PowerShell `Stop-Process` on the :4000 owner and delete the dir. A second login of the same account kicks the first socket (reassign the bot variable, do not `Object.assign`). Friend <-> enemy / black rows exclude each other: a hostile pair needs A friend -> B black (B's friend row swaps).
- Browser: a JS edit while logged in reloads to the login page (relogin: click `.char-card` area then "Vào game"). Synthetic `key Return` on the title input also answered the confirm opened in the same event: the confirm is now opened 150 ms later. NPC bubbles (`onNpcMsg` after the dialog closed) cut long text: send long guides as `onSystemSay` lines.
- Edits through `node -e` in double-quoted bash lose `\n` escapes inside replacement strings (a literal newline lands in the source): use Edit or Write for multi-line replacements.
