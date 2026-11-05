---
name: m12-pet-soul
description: M12 slice 6 Menh Hon facts - module wiring, currency quirks, smoke recipe, how to trigger onPetLevelUp
metadata:
  type: project
---

- `modules/pet-soul/`: SoulStore (feature `soul` = {open,data,temp,crystalSid}; `train_soul` is the Luyen Hon key, no clash), services return `Push[]` and `PetSoulRpc.run` sends them; refusals are `SoulRefusal(text, code)` (empty text = silent). PetSoulModule imports PetModule + ProgressionModule + VipCoreModule (PmStateService.levelOf for VIP gates); PetModule computes `onPetLevelUp` itself from `petSoulOpenNum(level)` (never imports PetSoulModule).
- `CurrencyService.credit / spend` throw INVALID_ARGS for amount 0: guard zero refunds (chip 0 gems) and read `balance` instead.
- soulChip 242 is the only Go-numbered soul currency; soulExp 243 / soulPnt 244 are H5-only ids. gmGrant accepts the keys.
- Pet docs inserted by hand have no `soul` field; `$max: {'soul.openNum'}` creates `{soul:{openNum}}` only, readers normalise (`petSoulInfoWire`, `normaliseRing`).
- Smoke recipe: scratchpad `m12f_fix.js` (pets 970001 lv100 / 970002 lv80 / 970003 lv79 battle, stashes wallet + soul / vip docs), `m12f_vip.js` (edit EXP: level 1 = 0, VIP 5 = 205000), `m12f_off.js` (offline bank 7200 + pet 970003 bound one exp short of lv80), `m12f_bot.mjs <prey|vip|bag|ring|login>`, `m12f_bot3.mjs` (getPetOfflineExp 0,1 triggers `onPetLevelUp` through `PetBattleService.grantQuestExp`), `m12f_clean.js`. Re-running the fixture deletes the soul feature doc and VIP doc (stash keeps the originals). Same-kind classic gems: exchange 511 + 501 (prop 52), 31 (prop 1).
