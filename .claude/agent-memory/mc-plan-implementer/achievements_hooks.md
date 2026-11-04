---
name: achievements-hooks
description: M7 phase B pitfalls - AchievementEvents hook wiring, seed text quirks, Mongoose dotted state, browser/e2e tips
metadata:
  type: project
---

- Hook = `AchievementEvents.record(cid, kind, input)` (modules/achievement/achievement-events.service.ts). Import `AchievementEventsModule` (no feature deps) from any module; `AchievementModule` (claim/login) imports Title/Inventory/Character, so feature modules must NOT import it (cycle).
- Add a kind: `AchieveKind` + `KIND_MODE` + a `classifyRequirement` case in achievement-parse.ts, then call `record` where the event happens. Only single-requirement enabled achievements are tracked (42/566).
- Seed quirks: `data_tbl_achievement.desc` can end with a literal backslash-r; requirement `name` is NULL for most rows; item names live in `data_tbl_item_template.name`, titles in `data_tbl_title.n`.
- State doc `character_achievements` (_id = characterId) with Mixed maps: write with dotted `$set`/`$inc` + upsert; read `.lean()`.
- Server tests import `@mc/shared` dist: rebuild shared before `pnpm -r test` / lint. Pure rule tests never import schema files.
- Browser: `javascript_tool` without `tabId` runs on the ACTIVE tab (another session's): always pass `tabId`. Register + create char in-page with random values, seed Mongo (level, `character_achievements`) by name, then pick char + `.panel > button`; `R` key opens the panel; chat `/grant title N 0` needs a real click on the chat input.
- Bash heredocs containing apostrophes abort the whole command: write notes/scripts with the Write tool, then `cat >>`.
