---
name: item-use-def
description: Item use phases D/E/F - pet handler hook, battle consumers, useMultiItem, client gate, smoke recipe and pitfalls
metadata:
  type: project
---

- Phases D-F added: `UseItemService.addPetHandler` (usePet non-507 path, use_type 2/3 gate), item-use `RulePotionService` / `PetUseService` / `BookService` / `SpecialItemsService` / `GachaBoxService` / `MultiUseService+Rpc`, pet `PetItemService` (plans = refuse text or `apply`, caller consumes in between). Details: `docs/memory/item-use.md`.
- Type handlers are TERMINAL in the dispatcher: registering `addType([501])` / `[500]` changes what every unclaimed template answers, so template handlers (by id) must exist for each special id, and flat HP/MP potions must `return null` from the 501 handler to reach UseItemService's flat heal.
- Battle consumers live in combat: exp rate in `BattleSettleService` (BuffService + GameDataService injected), encounter mods in `EncounterService`, catch bonus via `PetCatchService.bonusPoints` (PetModule now imports BuffModule; no cycle). `rollEncounter` gained a `mods` arg; `BATTLE_ENEMY_SLOTS` has only 5 slots (Go full roster = 10).
- The shared package test script lists test files explicitly (`packages/shared/package.json`): add new `*.test.ts` there; server tests are globbed.
- Smoke: scratchpad `smoke_def.mjs` (head of smoke_bc + scenarios rule/pet/fruit/exp/enc/slot/reset/special/scroll/gacha/multi/gate; 3-4 scenarios per call), `prep.mjs` (bag for browser), `clean.js` (stdin to mongosh). The dev server on :4000 is `nest start --watch`-style: dist recompiles on save, wait ~20 s after edits before smoking. Browser login: set inputs via `javascript_tool`, click char card (262,316) then "Vào game" (290,388), `b` opens the bag, items open with a `dblclick` MouseEvent on `.bag-panel [draggable="true"]`; quantity dialog is `.amount-dialog`.
- Bash tool breaks on heredocs containing an apostrophe even with quoted delimiters ("Go's", "don't"): write scripts / docs with the Write tool (fragment `.md` files read by a `.cjs` edit script worked well). `ed.cjs` CRLF-preserving edit helper pattern is in the scratchpad.
- `data_gacha_box*` ARE imported in Mongo (44 boxes with entries) although older notes said otherwise; the importer takes every seed file.
