---
name: m13-growth-e2
description: M13 E2 medal / stone seal / monster heart wiring, smoke recipe and pitfalls (providers file, lock-free item handlers, MxOpenRegistry, ws bot helpers)
metadata:
  type: project
---

- Modules `medal`, `stoneseal`, `monsterheart`; stat providers live in `stats/growth-providers.ts` (models + pure rules only, so no cycle); pet medals = `MedalPetService` on `PetStatRegistry` (copy of `RunePetService`).
- Item handlers run INSIDE useItem's `withCharLock` and return `Push[]`: never call a locking service from them (`MonsterHeartService.grantLocked`, `MedalItemsService` write the store directly). `oneKeyOpenAllMXTemp` goes through `tempbag/mx-open.registry.ts` (TempBag cannot import MonsterHeart).
- `ProgressionModule` cannot import the feature modules: `/grant medal|medalexp|heart` is `progression/grant-growth.ts` over pure state functions + `FeatureStoreService`.
- Kim Cuong = item template 16 with `character_items.colorCode` (instance column, not the template colour); a wallet gold spend is `CharacterService.spendMoney(cid, 'gold', n)`.
- Smoke: start with `DEV_COMMANDS=1 pnpm dev:server` (no GM account needed for gmGrant), kill the `nest.js start --watch` node process afterwards (killing the app pid is not enough, the watcher respawns it); register + `newChar` over ws, scratchpad `lib.mjs` (client + mongosh helper). Edits of CRLF files: scratchpad `ed.cjs` (LF strings, exactly-once, CRLF-aware) driven by a `.cjs` written with the Write tool; bash heredocs with apostrophes fail.
- Browser: after a client `.ts` edit Vite reloads to the login screen; screenshots lag one action behind, read the DOM instead; the shared test script lists files explicitly (`packages/shared/package.json`), new shared tests must be added there; client tests run from `server/`.
