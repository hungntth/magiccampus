---
name: m13-prs
description: M13 phase G PRS (Chân Hồn Thần Thú) wiring, pet look hook, generated client table, smoke recipe and pitfalls
metadata:
  type: project
---

- Module `prs` (state `prs`, pure rules/collect files, PrsPetService = PetStatProvider + look hook); entry = strip icon 58 via `ActivityController` -> `game/PrsController.ts`; window `ui/pet/prsPanel.ts` + `ui/pet/prs/*`.
- Pet look extension point: `PetFollowService.setLookHook/lookOf` (scene `prsUseId`, follow-pet resCode when it is the battle pet, `PetBattleService.fighterOf` resCode). Reuse it for other pet-art overrides instead of importing feature modules into PetModule.
- Static client tables: `server/tools/gen-prs.ts` -> `packages/shared/src/prsData.ts` (imports the server `gamedata/prs-data.ts` mappers; tsx handles it). Item names of item templates live in `data_tbl_item_template` (5303.. are type 550).
- Smoke: scratchpad `prs_smoke.mjs` (+ `lib.mjs`), `p_setup.mjs [clean]` for the browser account; battle pet = copy of `pets._id 1` with state 1 + following. Git-bash mangles `/regex/` in mongosh `--eval`: prefix `MSYS_NO_PATHCONV=1`.
- movePRSChip onto an occupied bag slot SWAPS stacks (Flash drag semantics); the client sends the bag end position to move back.
- Stop the server: kill the pnpm x2, `nest.js start --watch` and `dist/main` node pids (PowerShell `Get-CimInstance Win32_Process`).
