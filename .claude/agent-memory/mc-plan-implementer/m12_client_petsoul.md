---
name: m12-client-petsoul
description: M12 client slice C5 facts - Menh Hon window wiring, no icons, generated static table, smoke fixture and browser traps
metadata:
  type: project
---

- Wiring: `PetController` owns `PetSoulController` (RPCs + 14 push handlers, mutates `player.soulBagData/tempSoulData/crystalSid`, `pet.soulInfo`, `player.currencies.soul*`); views in `client/src/ui/petsoul/`, pure rules + reducers in `soulRules.ts` (test run from `server/`). Window = `createBoostFrame` (`pb-soul`), tabs rebuilt on every `refresh()`.
- Soul `icon_code`s decode to missing `EQUIP_WING` art: gems are text cells (`gemFace`), never `iconCell` (its onerror removes the img silently).
- Static table: `server/tools/gen-pet-soul.ts` -> `shared/petSoulData.ts`; dissolve / level-up pushes carry balances without `onUPP`, so the controller writes them into `player.currencies` itself.
- Smoke: `m12f_fix.js` (pets 970001 lv100 / 970002 lv80 / 970003 lv79) + Mongo `$set currencies.soulPnt/soulExp/soulChip` BEFORE login (CurrencyService reads the DB, so a mid-session $set also works), VIP doc via `m12f_vip.js` for quick / advanced paths, `m12f_clean.js` restores everything. A ws bot login for hudtest kicks the browser session.
- Browser: the pane viewport is 800x450 (800x500 after resize); coordinates change between navigations, take a screenshot first (clicks by coordinate fail otherwise). Pet panel: W key, pet row y~102, M.Hồn button (548,276). Drive the window with `javascript_tool` (`.pb-soul .pet-tab`, `.sc-grid` children, `.sc-crystal`, `.confirm-dialog button`). `btn.startsWith('Nhận')` also matches "Nhận nhanh": match exact text.
- Heredocs with apostrophes abort the whole Bash call (again): write docs with the Write tool and `cat` them.
