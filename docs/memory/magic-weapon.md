# Magic weapon / Thần Khí (M7 phase E)

Plan: `docs/plans/2026-11-04_08_PROGRESSION.md` (phase E notes). Shared `magicWeapon.ts`; server `modules/magicweapon/`, `gamedata/artifact-data.ts`;
client `game/MagicWeaponController.ts`, `ui/mw/*`. Opened from the character panel "Thần khí" tab (Lv 50) → "Chức năng" (seven operation tabs).

- **Slots and stats**: kind-8 equipment at positions 15 (main) and 16–20 (subs), in the M1 equip slots. Stats come from the instance `mainPropNum1/2` via the gear provider.
  - No star multiplier for kind 8. `t1..t10` on a magic weapon are skill ids, not gems.
  - Sub-weapon lines are display only (Go), because they would need a rate scale.
- **`data_tbl_artifact`** (6 tids × 50 levels), derived from the client stage panel; each row = reaching that level:
  - `prop_num1/2` = the main lines at that level;
  - `spirit_num` = spirituality per attempt;
  - `rate` = success %;
  - `item_num` = Pha Lê Thần Giới (4758) per attempt.
  - Both costs are paid on every attempt; a failure keeps the level.
  - Upgrades never lower a stat. A fresh main weapon starts at 0.9× its template lines (ladder row 1).
- **RPCs** (Flash names, none quiet):
  - Upgrade and repair: `mWeaponUpgrade`, `getSpiritRequire`, `magicWeaponRepair`, `magicWeaponAutoRepair`, `magicWeaponAllRepair`.
  - Resolve and transfer: `magicWeaponResolve`, `MWTrans` (no spirituality charged; the amount is unknown).
  - Property reset: `queryMWResetPropMax`, `magicWeaponResetProp` (single phase; it can roll lower).
  - Skills and sub lines: `getMWSkills`, `magicWeaponResetSkill`, `showMWInfo`, `activateMWPro`.
  - H5 read: `getMWPanel`.
- **Testing**: `/grant equip <templateId> [n] [1]`.
- **Not done**: battle skills from the magic weapon (`onMWeaponSkillUpdate`), `magicWeaponStage`, `succinctMW` / `onSureSuccinctMW`.
