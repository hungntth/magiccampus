# Character stats, equipment, item use, buffs (M1 character core)

Plan: `docs/plans/2026-11-04_02_CHARACTER_CORE.md` (see its Implementation notes). Implemented 2026-11-04.
Research: `docs/research/2026-11-04_01_CHARACTER_CORE_CLIENT_RESEARCH.md`, `..._02_CHARACTER_CORE_SERVER_RESEARCH.md`.
Bag operations are in `inventory.md`.

## Contract (shared `character.ts`, `inventory.ts`)
- `CharProperty` (final* keys, `lastPoint`, distributed `apt*`) is carried as `PlayerData.property` and in every stat-refresh `onUPP`
  `{level, exp, attrPoints, currentHp, currentMp, maxHp, maxMp, att*, property}`. `exp` stays cumulative (no `expSkill`).
- `LEVEL_EXP` (161 cumulative entries from Go `player_level_exp.go`), `AUTO_LEVEL_CAP 20`, `MAX_LEVEL 160`, `ATTR_POINTS_PER_LEVEL 5`.
- RPCs (none quiet yet):
  - `getCharAttributes` returns the stat payload and pushes it.
  - `getCharDetailData` returns the 26 legacy rate keys.
  - `changeProperty({addX: string})`.
  - `lvUp(level, pass)` returns a boolean. Allowed only when level ≥ 20; the password is ignored.
  - `equipOn(itemId)`, `equipOff(itemId, toSid|-1)`.
  - `useItem(1, -1, itemId)`; equipment goes through the equip path.
  - `fullHpRecoverByItem` / `fullMpRecoverByItem(1, -1, [{sid: itemId, priority}])`.
  - `delBuffClient(rowId)`, `gmAddBuff(buffId, seconds)` (dev, chat `/buff`).
- Pushes:
  - `onSystemMidMsgOrNote(msg)`: all gate and failure messages; the client shows a toast.
  - `onMoveItem(fromSid, toSid, id)` for equip moves.
  - `initLongBuff({rowId: LongBuff})` from `sceneLogin`, `upLongBuff`, `delBuff(rowId)`.

## Rules
- Formula: `modules/character/character-stats.ts`. Constants are from Go `profile.go`; `docs/memory/unified-stat-formula.md` in the legacy repo is stale.
  - Attribute = base `strength..energy` (class `att_*` + 1 per level) + distributed `apt*`.
  - Class `apt_*` per-mille comes from `data_tbl_class`.
  - Assembly: gear and buff attributes go through the formula, then other flats, then percents. Equipment prop 21 = Stamina; only 24/25 are percent.
    `bind_prop_num` is always added (legacy).
- `maxHp/maxMp` on the character doc are only a cache. `CharacterStatsService` (`modules/stats/`) recomputes them from the doc, the class,
  equipped templates and active buffs. Current HP/MP is clamped to the effective max on login and after gear or buff changes.
- Level-up: +5 points, +1 to each base attribute; HP/MP are not restored. Below 20 it is automatic (quest exp); from 20 on it needs `lvUp`.
- Equip: `slotType 1`, `slotIndex = position-1`, `sid = position` (1..22); positions above 22 (pet gear) are refused.
  - H5 enforces `req_level` and `req_class` on the server.
  - An occupant goes to the first free bag slot. Durability ≤ 0 blocks equipping.
- Potions are type 501 with hardcoded heal amounts per template id (`inventory/potion.ts`); `i1/i2` are not amounts. Food (502) heals `i1/i2`.
  - Spend first, then credit.
  - When already full, H5 shows "HP đã đầy!" and consumes nothing (legacy consumed it).
- Buffs live in `character_buffs` (unique per character + buffId). Expiry is lazy. `BuffService.grant(cid, buffId, seconds, { addRemaining, battles })`
  stacks time / battles (foods, item-use phase C; math in `buff/buff-stack.ts`); battle-count rows (`buffType` 1) lose a charge per finished
  battle in `BattleEndService` (`consumeBattleCharges`) and are deleted at 0.
  - The client's 10 s timer sends `delBuffClient` for expired buffs.
  - Template `buff == 0` cannot be removed.
- Equip, use and bag ops are serialised per character by `inventory/char-lock.ts` (in process only).
- Existing characters were fixed by `pnpm --filter @mc/server fix:char-attributes` (idempotent).

## Client
- `game/CharacterController.ts` owns `player.property`; `ui/characterPanel.ts` + `.css` opens with C or the HUD button.
  Layout follows the CharactorPanel descriptor (315x460, tabs Tr.bị / Th.khí / D.hiệu / T.luyện / Thú cưỡi at x 14+47n, equipment box
  285x385, property canvas at (5, 204), magic weapon pentagon). Only the centre figure is SWF art (`ui/charFigure.ts`, assets from
  `swfelement` in `client/public/ui/CharactorPanel`); tabs, boxes and buttons are CSS.
- Element figure: `charElementOf` (`@mc/shared` charElement.ts) computes ee/en from the worn pieces client-side (Go
  `ApplyCharacterElementState`); frame ee picks the ColorMatrix set, en (0..12) raises the fill. ef is always false (soul
  activation not ported); ee 0 shows a dim neutral silhouette instead of the legacy empty frame.
  - 22-slot grid; double-click unequips, drag to the bag unequips into that slot.
  - + / − buttons with an x10 step, OK sends `changeProperty`.
- `ui/hud/portrait.ts`: clicking the HP/MP bar sends recover with potions from the bag; it shows a level-up button from level 20.
- `ui/hud/buffBar.ts`: 16 px icons at 2,115, with tooltips; click to remove.
- Shared helpers: `ui/itemCell.ts` (slot render, tooltip, drag payload), `ui/confirmDialog.ts`, `net/throttle.ts` (legacy `RPC_DELAY`).
- Client gates check only the level and the equip position (`BagItem` has no `req_class`/`use_type`); the server enforces the rest.

- Character panel header (2026-11-07): Trang bị / Thần khí / Tinh cung / Thuộc tính / Thú cưỡi, a “Sau” cycle button, and Trang bị shortcuts Tủ đồ and Hồn khí. The old in-panel Chi tiết button was removed; the right-edge tab toggles an attached 345 px secondary-rate detail pane, which moves and closes with the character panel. Its CSS triangle points right while closed and left while open, including after the detail pane's X button is used.

## Deferred
- Wing, fairy and deco looks; costume + flyer + flying are done in `docs/memory/appearance.md` (M13 phase A), the weapon below.
- Stars, gems, soul, suits, random properties, element `ef` (MAX glow) and ee/en on the server property.
- `getFinalPraDef` / `finalPraMagDef`, `useMultiItem`.
- Pet targets and other item types.
- NPC healer.
- Secondary password.

Not verified in the browser:
- The `lvUp` flow, since the test character is Lv1.
- `initLongBuff` after relog with an active buff.
- The x10 step.

Quiet the new RPCs only after the user confirms.

## Stat providers (M7)
Bonuses now come from the `STAT_BONUS_PROVIDERS` registry (gear, buffs, guild skills, titles, stat features); BUFF_PROP 59/60 = finalPraDef/finalPraMagDef. See `progression.md`. M13 E2 adds `MedalBonusProvider` (worn character medals + engrave line), `StoneSealBonusProvider` (stones of the worn gear's seal holes + add lines) and `MonsterHeartBonusProvider` (placed hearts + combines), all in `stats/growth-providers.ts` (`medal.md`, `stone-seal.md`, `monster-heart.md`). M13 phase B adds `DressBonusProvider` (feature key `dress`, flat prop1..4 of every activated Tủ Đồ dress through `EQUIP_PROP`; see `dress.md`).

## M9 phase B
- New stat provider `training-skill` (`stats/training-bonus.provider.ts`): flat maxHp / defense / magicDefense / speed from the Luyện
  chains (`trainingBonus`, base × level × tier × 10). `Character.cl` (class rank) added; see `skills.md`.

## Detail panel (M9 phase F)
- `getFinalPraDef(key, value, cid)` / `finalPraMagDef` (character-stats.rpc): the caller's aggregated rate; reply `{key, value}` when
  args[0] is a non-empty string, else the number (`character/final-rate.ts`). Client `ui/detailPropPanel.ts` ("Chi tiết" in the
  character panel header): 26 labels in Flash order, 19 plain `x.xx` + 7 percent `x.xx%`.

## Wing stats (M13 phase C, 2026-11-09)
- `GearBonusProvider` merges `inventory/wing-stats.ts` `wingBonusOf` for the worn wing: `(WING_LEVEL_ADD[level-1] - 1)` x each of the four lines (mains after the star
  multiplier, flat) plus the feathers of the odd holes (`properties.wing.holes`, never gem `t*` keys). Even-hole feathers go to every pet through the
  `WingPetService` `PetStatProvider` ('wing'). Feather templates need `i3 / n1..n3` (added to `TEMPLATE_FIELDS`). See `docs/memory/wings.md`.

## Weapon in hand (M13 phase A slice, 2026-11-07)
Superseded in part by `docs/memory/appearance.md` (2026-11-07): `scene.wp` / `onEquipOn` / `onEquipOff` are now built by `AppearanceService`
(`WeaponLookService` keeps `weaponRes` / `cached` for battles), the equip hook is `EquipHooks`, and the client layer lives in `AvatarView`
(`Entity.setWeapon` / `swapRes` no longer exist; `AppearanceController` handles the pushes).
- Shared `appearance.ts`: `WEAPON_POSITION` 3, `EquipOnPush` / `EquipOffPush` `{cid, resCode, dressFlag: false}`; `SceneCharacter.wp`
  (weapon res string, '0' none).
- Server `inventory/weapon-look.service.ts`: art = equipt_template `res_code_male` / `res_code_female` (gender 1) of the item at equip
  slotIndex 2 (`TEMPLATE_FIELDS` now projects both columns). `decorate()` adds `wp` to every scene payload (sceneLogin/enterScene/
  enterCopy/createChars); `EquipmentService.equipOn/equipOff` broadcast `onEquipOn` / `onEquipOff` to the map (self included) after the
  lock when the weapon slot changed (also covers useItem on a weapon).
- Client `Entity.setWeapon(res)`: weapon `SheetAnim` from `sheets/equip/EQUIP_MC*/FC*` right above the body, same `(-midX, -footY)`
  anchor, same label, ticked in lockstep (restarted together when it loads); hidden while `swapRes` shows another body (mount),
  as Flash hides it on a costume/transform/mount. Pushes handled in `CharacterController`.
- Battle: `BattleParticipant.wp` (characters) from `WeaponLookService.cached(cid)` (filled by every scene entry / weapon change;
  battle starts are synchronous) via `playerFighter(..., wp)` in `CombatService.startGroup` and `PvpService.start`. `BattleUnit`
  draws the weapon sheet above the body and restarts it on the body's label in `play()` (weapon and class-body sheets share all
  64 labels and frame timings, checked on EQUIP_MC1_000001 vs PC_MALE_000001).
- Not yet: reborn art `res_code_*2`, `ee` / `ef` / `star` glow fields, wing/dress/flyer layers.
- Verified: ws e2e (two local test accounts on map 1: `wp` in sceneLogin/createChars, peer receives onEquipOff/onEquipOn) and
  browser (self entity loads `EQUIP_MC1_000001`, mallet drawn at the hand).

## Equipment depth stats (M13 phase D, 2026-11-09)
`GearBonusProvider` now adds, per worn piece, the lines of its current Thăng hoa level (`properties.sublime.lv` -> `data_tbl_sublimation` row, attack positions props 1/2, others 3/4; flat like gems, not star-multiplied,
`EquipEntry.sublime` in `inventory/equip-stats.ts`) and the Kỳ Linh lines of every worn piece above level 150 (`forge/qiling-rules.ts qilingBonusOf`: props through `BUFF_PROP`, flat values rounded, rates as points, all lines
scaled by the set bonus of the full lines over all worn pieces: 2/4/6/8/10/12 -> +2/5/8/12/16/20 %). Debuff hit / resist lines (props 32 / 58) have no H5 stat. `equipt_suit` is a pet-gear / wing table with no character
consumer (see `equip-depth.md`). The sublime element hurt up / down is not applied in combat yet.

## Hồn Khí and rune stats (M13 phase E1, 2026-11-09)
`DecoBonusProvider` adds every position hole row + live activated show + full-suit (+20 % HP / Công VL / Công MP of the pieces) + linked-suit (+10 %) lines as flat bonuses (`EQUIP_PROP` 1 / 4 / 5 / 11). `RuneBonusProvider` adds the socketed runes of the character page (odd holes of open slots, one value per prop type per Hồn Khí, panel units: types 8/9/13/14/31/32/58/61 /10000, 34/59/60/62/63/71 /100; flat props rounded after summing, rate props fractional). The pet page (even holes) feeds every pet through `RunePetService`. See `rune-deco.md`.

## Mật Bảo collection stats (M13 phase F, 2026-11-12)
`MysteryBonusProvider` (`stats/growth-providers.ts`, feature `mystery_treasure`) adds the Thu Thập collection: every `data_tbl_mystre` piece ever owned (codex) or present in the Túi Mật Bảo counts once; flat `prop_num` summed by `prop_type` through `EQUIP_PROP` (1 HP, 4 attack, 5 magic attack, 11 speed in the data). Decomposing never un-collects. A new piece pushes `onUPP` stats. See `mystery-treasure.md`.

## Chân Hồn Thần Thú (M13 phase G, 2026-11-12)
No character stats: since the Go fix of 2026-10-30 the PRS tree and forms feed the **battle pet** only (`prs/prs-pets.service.ts`, PetStatProvider `prs`). Panel units = stat units: props 1/4/5/6/7/11 raw, every other prop / 100 (`prsPanelValue`). See `docs/memory/prs.md`.

## Tiểu Tinh Linh guard bonus (M13 phase G, 2026-11-12)
`FairyBonusProvider` (`stats/growth-providers.ts`, feature `fairy`): only the guarding fairy (state 1). Nhẫn / Lực / Xảo / Trí / Thần =
`round(eff x (base + (lv - 1) x (growth + 0.2 g)))` (shared `fairyGuardStats`, eff = colour band x satiety factor) added as flat attribute points
(`attr.sta/str/agi/int/eng`, through the formula), plus the TBL_BUFF rows of its passive (type 11) skills, one per `code_name` family at its highest
level, through `buffBonuses` (percent_flag 1: +5/7/10 % attack, magic attack, speed, mdef, def, max HP). FairyModule pushes the `onUPP` refresh after
every change of the guarding fairy (grow / feed / raise / learn / upgrade) and on every guard change / release. Details: `docs/memory/fairy.md`.
