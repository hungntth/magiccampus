---
name: m13-wings
description: M13 phase C wings wiring, test recipe (ws smoke with temp GM accounts + a mongo-inserted pet), pitfalls (TEMPLATE_FIELDS projection, money type, tsx schema imports)
metadata:
  type: project
---

- Wing module = `server/src/modules/wing/` (rules pure + services under `withCharLock`, RPCs split in 3 files, `out()` helper in `wing-rpc-util.ts`). State in `properties.wing`
  (holes[] -1/0/tid, odd = char, even = pet; absent = all 10 open). ForgeModule exports `ForgeItemsService/ForgeMoneyService/RefinePending` for it.
- `GameDataService.templatesByIds` projects `TEMPLATE_FIELDS` only: a missing column (`n1`, `i3`) reads as 0 silently. Check it first when a template value looks wrong.
- Test accounts: money is charged by the selected type (`selectedMoneyType` default moneyBind): set both `money` and `moneyBind` in Mongo or every silver cost says "Không đủ bạc!".
- Server tests cannot import a service that pulls a Mongoose schema class under tsx (`CannotDetermineTypeError`): keep logic in pure files and test those.
- ws smoke script idea: register -> set `accounts.gmLevel` -> login -> `newChar` -> mongo `level/money` -> `chooseCharactor` -> `sceneLogin` -> `gmGrant wing|item`; item ids come
  from `onAddCharactorSlot` pushes. A pet for pet-bonus checks: copy `db.pets.findOne({_id:1})` with a new `_id` / `characterId`, read `initViewPetMngP` -> `data.property.finalHp`.
- Browser: login through the form, then `.char-list .char-card` click and the "Vào game" button; `C` key opens the character panel (checkbox/button DOM clicks work in the hidden pane).
- Heredocs with apostrophes in bash abort the whole command silently: write multi-file batches with the Write tool.
