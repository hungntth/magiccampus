# Hotbar (M9 phase C)

Plan: `docs/plans/2026-11-04_12_CORE_LOOP.md` §2.1 / phase C. Legacy: `hotbar-userbar.md`.

## Contract
- Storage: `Character.interfaceData` keys `st<n>` (0 / 29 item / 52 skill), `sid<n>` (skill id / item template id), n 1..30, plus
  `au` (0 shown / 1 hidden) and `ubl` (lock, saved but the bar always starts unlocked). Login merges `hotbarDefaults()`.
- `skillSetUserBar(skillId, level, "<n>") -> true`: n 1..30 (numeric string), level integer; owned exact id, or the same code_name family
  at >= that level (`SkillLearnService.ownsFamilyAtLeast`), or a skill of the active pet. Writes `st<n>=52, sid<n>=skillId`. No push.
- `uif(st<n> | sid<n> | au, value, false)`: validated by `validHotbarValue`. `us(map) -> {success:true}`: phase C whitelist = `ubl`
  (`usValue` in `settings.rpc.ts`; phase G adds the system keys).

## Files
- Shared `hotbar.ts` (+test): `HOTBAR_SLOTS`, `HotbarKind`, `HOTBAR_TEXT`, `hotbarDefaults`, `hotbarFromSettings`, `isHotbarKey`,
  `validHotbarValue`, `parseHotbarSlot`, `slotForKey`.
- Server `settings/settings.rpc.ts` (`skillSetUserBar`, `us`, hotbar keys in `uif`), `settings.service.ts` (`setCharacterKeys`,
  `setUserBarSkill`).
- Client `game/hotbarController.ts` (state, writes, key / click / use rules, `setHotbarBattle` bridge), `ui/hud/userBar.ts` (render,
  drag/drop, lock, toggle; lock = Flash AutoBattleCanva btnLock at (396,27) 20x20 under the toggle, skins
  `MainStage_ShortcutCanvas/1..3` unlocked and `1320/21038/31742` locked), `MainHud` (owner, digits 1-0 through the SystemBar key map), `BattleController.hotbarUse` + `PetStep.castById`.
  Drag sources: skill window rows (`HOTBAR_DRAG_MIME`), bag cells (`itemCell.dragging()`), other slots (move clears the source;
  dragging off the bar clears).

## Decisions / deviations
- Item accept rule: bag items of `ItemKind.ITEM` (the client has no `useType` / `skillId`); equipment refused.
- Ctrl+click → active pet not ported (map item use goes through `BagActions.use`, which already targets the pet for pet items).
- The page is not persisted (legacy). Skill slots do nothing on the map; keys on the map fire item slots only.
- `BattleController.ts` is ~325 lines after the hotbar bridge (over the cap; split candidate).

## Not verified
- Browser drag/drop, keys in battle, reload persistence (Mongo down in the session). RPCs are not quiet.
