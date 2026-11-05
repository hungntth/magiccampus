---
name: m12-client-petboost
description: M12 client slice C3 facts - Ho Ve / Thien Phu / Bao Thach windows wiring, generated static tables, fixture collisions, smoke recipe
metadata:
  type: project
---

- Wiring: `PetController` owns `PetBoostController` (guard + talent) and `PetStoneController`; views in `ui/petboost/` use `createBoostFrame` (class `pf-win` so `petfunc/seats.ts` `openPicker` finds its root). Controllers merge replies into `player.petGuardData` / `player.petTalentInfo`; stone bag is a sparse nullable array kept in the controller.
- Client static tables: `server/tools/gen-pet-boost.ts` -> `packages/shared/src/petBoostData.ts` (tuples, ~200 KB), lookups in `petBoostStatic.ts`. `BagItem` has no `tplKind` for equipment: pet gear is `isPetEquipPosition(item.position)`; worn gear comes from `pet.equN` ids through `bag.find` (not in `bag.list()` / `listTabs()`).
- Talent bag slots are 1-based, stone-bag slots 0-based. Talent descriptions in the data carry a literal backslash-n: replace `/\\n/g` before showing.
- Fixture collision: `m12c_fix.js` deletes item ids 961101..961299 and puts the talisman at bag slot 120; `m12d_fix.js` gear at slots 120 / 121 then fails on the unique `(characterId, slotType, slotIndex)` index (insertMany aborts, the stone bag is still written). Use scratchpad `c3_gear.js` (slot 140) + `c3_fix.js` (pet 962001 wearing 962103) + `c3_clean.js`, then `m12c_clean.js` and `m12d_clean.js`.
- Browser smoke: same login recipe as C2 (form_input refs + Return, card click (295,322), Vao game (290,388)); window openers via `.pet-funcs button` text, drive pickers with `.pf-picker-row`, confirms with `.confirm-dialog button` "Đồng ý". A CSS/TS edit during a session reloads the page and logs out. `ws://localhost:5173` console errors are Vite HMR noise.
- Heredocs with apostrophes abort the whole Bash call; write docs/code with the Write tool and append with `cat`.
