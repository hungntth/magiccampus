# Auto battle (M9 phase A)

Plan: `docs/plans/2026-11-04_10_AUTO_BATTLE.md` (phase A of `2026-11-04_12_CORE_LOOP.md`). Research: `docs/research/2026-11-04_17/18_AUTO_*`.

## What was built
- Auto is client-side (Flash `Battle.battleAuto/battlePetAuto`): the client picks ordinary commands and sends `battleUpdateCmd`.
  Unlimited rounds (legacy patch), the flag stays on between battles, lost on reload.
- Settings are the flat legacy keys `bs1..bs10`, `bt1..bt6`, `p2..p9` (odd slots + bs9 + p2..p5 character; even slots + bs10 + p6..p9 pet).

## Files
- Shared: `packages/shared/src/autoBattle.ts` (+test): `AutoSlotKind`, `AUTO_DEFAULTS`, `isAutoSettingKey`, `isPetAutoKey`,
  `validAutoValue`, `autoKeysOf`, `validSkillSlot`, `InterfaceData`. `PlayerData.interfaceData`, `PetView.pi`.
- Server `modules/settings/`: `settings.rpc.ts` (`uif` moved here from `pk.rpc.ts`, `skillSetBattle`), `settings.service.ts`
  (writes `Character.interfaceData.<k>` / active pet `Pet.battleSetting.<k>`, login merge defaults ∪ char ∪ active pet),
  `settings.module.ts` (login extra). `PkModule` exports `PkService` (apvp).
- Combat: `round.ts` round cap PvP only (PvE unlimited); `battle-command.service.ts` accepts AUTO -110 (random living enemy,
  `randomEnemy`) and ITEM for pets (owner's bag, heals the pet) (+`battle-command.test.ts`).
- Client: `game/battle/autoBattle.ts` (+test, run from `server/`: `node --test --import tsx ../client/src/game/battle/autoBattle.test.ts`),
  `autoState.ts` (flag, listeners, localStorage `mc.autoDefend`, settings view = player.interfaceData char keys + battle pet `pi`),
  `autoRound.ts` (stage units → batch), `encounterWalk.ts` + `skillPick.ts` (split out of `BattleController.ts` to stay near 300 lines).
  `ui/battleMenu.ts` Auto button + `showAutoBanner/hideAutoBanner`; `ui/hud/userBar.ts` Auto box; `ui/autoBattlePanel.ts` + css
  (opened by the minimap red "Auto" button, owned by `MainHud`).

## Decisions
- `uif` validates: auto keys must pass `validAutoValue`, `isPet` must match the key side, non-zero `bs` via uif must be an item template;
  pet keys need an active pet (`Chưa có pet xuất chiến`). Unknown keys are ignored (reply null).
- `skillSetBattle(0, …)` clears the slot (H5 extension); passive skills refused.
- Items are only used on the commanding fighter itself (server ITEM heals the submitter): team/pet heal *items* are skipped by the brain.
- Front row = `Battle.BATTLE_POS` y 1/2 = slots 5..9 and 15..19; a back enemy is covered when slot+5 is alive.
- A refused auto batch pauses auto for that round (manual menu), "Kết thúc auto" before the 4 s gate cancels the pending batch.

## Deferred / not verified
- Browser smoke not run (Docker/Mongo was down in the M9 session). New RPCs are not quiet.
