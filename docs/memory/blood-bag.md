# Relive modes and blood bag (M9 phase D)

Plan: `docs/plans/2026-11-04_12_CORE_LOOP.md` §2.3 / phase D. Legacy: `blood-bag.md`, `hinh-nhan.md`, `recovery-targeting.md`.

## Contract
- `reliveSwitch() -> 0|1|2|3` (0 alive / in battle; else `reliveMode(mapId, dead, pk)`: 3 world-boss map 2006, 2 `dead == -1` or
  `pk == 2`, else 1). Null-Responder relives: `freeRelive(1|2)` (mode 2), `toSafe()` (modes 1/2; penalty on 1),
  `reliveUseItem()` (mode 1: doll 721 from the bag, else 18 `gold`), `bbGoldRelive(price)` (mode 3, price ignored: server charges
  `bbGoldPrice(30 − seconds since deathAt)`), `bbNormalRelive()` (mode 3, safe point). A refusal pushes `onUPP {currentHp, currentMp}`.
- `buyBloodBag({bt, bn})` → `onUPP {gold, ep}` or a mid note (full → ≤ 0 → clamp → `ceil(added/5000)` gold, gold only).
  `useBloodBag()` (client, after every `battlePlayEnd` when a pool > 0) → `onUPP {ep, currentHp, currentMp}`; silent otherwise.
- Refill items 2038/2037 (+1 000 000 HP/MP), 2847/2846 (+50 000): `useItem(1, …)` fills pools 1/2, `useItem(2, petId, …)` pools 3/4;
  full pool → item kept + `Túi cứu thương đã đầy.`.
- `PlayerData.ep` / `PlayerUpdate.ep` = `"|a|b|c|d"`.

## Files
- Shared `relive.ts` (+test): `ReliveMode`, `DOLL_TID`, `DOLL_GOLD`, `RELIVE_TEXT`, `BLOOD_BAG_*`, `parseEp`, `formatEp`, `bbGoldPrice`,
  `bloodBagCost`; `ReliveSwitchResult` widened in `battle.ts`.
- Server `combat/relive-mode.ts` (+test), `revive.service.ts` / `revive.rpc.ts` (rewritten), `blood-bag.ts` (+test),
  `blood-bag.service.ts`, `blood-bag.rpc.ts`, `combat.module.ts` (CharacterItem model), `battle-settle.service.ts` (`deathAt`),
  `inventory/use-item.service.ts` (refill items), `Character.bloodBag` / `deathAt`, login `ep`.
- Client `ui/reviveDialog.ts` (generic `showTimedDialog`), `game/battle/reviveFlow.ts` (modes, `deadWalk`), `ui/bloodBagPanel.ts`
  (+ `healButtonState` skins/tooltips), `hud/portrait.ts` / `hud/petCanvas.ts` (heal buttons, head → character panel, ItemBag → bag),
  `BattleController` (`useBloodBag`, `deadWalk`), `GameScene` click guard while dead.

## Decisions / deviations
- Pre-M9 characters have no `bloodBag` array: every dotted `bloodBag.N` write must call `character/blood-bag-doc.ts ensureBloodBag`
  first (fixed in the 2026-11-05 smoke test; buy used to fail with the "no gold" note).
- H5 pets always start a battle full and pet HP is not persisted, so pools 3/4 are bought/filled but never drawn (no `onUpdatePet`).
- Doll is consumed before the revive write (spend first); the mode check runs first, so a race only loses the revive, not a doll twice.
- The penalty skips dress gear (template kind 11 or position 21), like Go `IsDressTemplate`.
- Mode 3 is reachable only on map 2006 (no world boss yet).

## Not verified
- Browser flows (Mongo down). Server-side `udcp` refusal for dead characters was not re-checked (client guard only).
