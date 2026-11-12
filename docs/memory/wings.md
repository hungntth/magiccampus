# Wings - Cải tạo cánh (M13 phase C, 13.3, 2026-11-09)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (phase C, section 12 addendum). Research: `docs/research/2026-11-09_01_WINGS_RESEARCH.md`
(wire contract, rules, sources, user decisions). Look side (resolver, pushes): `docs/memory/appearance.md`. Stats: `docs/memory/character-stats.md`.

## Contract (`packages/shared/src/wing.ts`, `wingProtocol.ts`)
- Wing = equipment kind 13 at position 22; colour 0..4 = `colorCode - 1` (`wingColourOf`). Instance state in `character_items.properties.wing`
  `{level, exp, look (-1 = automatic), dye[3], holes[10]}` (holes: -1 undrilled, 0 open + empty, > 0 feather template id; odd slots = character, even =
  pet). A wing without stored holes has all ten OPEN (owner rule 2026-11-09); stars stay in `character_items.star`, lines in `properties.mainProp1..`.
- Tables + pure helpers: join / senior rates, hole costs and code, star failure (`wingStarAfterFail`), feather rates, level exp / bonus / crit,
  `wingResFor` (colour variant, level looks, dye, `WING_SHEET_CODES` = the 16 sheets of the cache), `wingViewOf`, `parseWing`. Tests: `wing.test.ts` (9).
- `BagItem.wing` (`WingView`: colour, level, exp, look, dye, holes, holeNum, `feathers` by template id with name / icon / lines) is set by `toBagItem` for
  kind-13 templates (`InventoryService.mapDocs` loads the inlaid feather templates); a fusion formula carries `featherMix {inputs, product}`.
- `AvatarView.wing` (scene `av`, login `av`); pushes `onWingOn {cid, resCode}` / `onWingOff {cid}`; hide flag `interfaceData.wingHide` (like `dressHide`).
- RPCs (20, none quiet; mutating ones `forbidInBattle`): `wingJoin(mainId, {w1..w4})`, `wingSeniorJoin(mainId, ids)`, `addWingStar(count, wingId, stoneId,
  upToNum)`, `addWingHole(wingId, materialId)`, `addWingFeather(wingId, {"1".."10": {idx, flag}})`, `featherDel(wingId, index)`, `featherUpdate(featherId,
  luckId, luckCount, once, tempBagFlag)`, `featherMix(formula, {"1","2"}, luckId, luckCount, luckBinded)`, `getFeatherData(wingId)`,
  `changeWingPrefix({e, i})` / `sureChangeWingPrefix(1|-1)`, `changeWingBind(wingId, materialId)` / `sureChangeWingBind(1|-1)`, `changeWingColor(npcId)` +
  `onSureChangeWingColor(series)`, `changeWingRes(index)`, `newWingAdvanced(useCrit, mode)`, `showNewWingPro`, `buyCritItem(n)`, `setWingHide(hide)`,
  `checkLimitWingEffect` (dead, null). Replies keep the Flash shapes; `idx` of a reference is the item instance id (no temp bag). A refusal shows
  `onSystemMidMsgOrNote` and answers the failure shape. Pushes: `onShowNewWingPro`, `updateCritItemNum`, `showWingColorPanel`.
- `/grant wing <tid> <colour 0..4> [bound]` (gmGrant kind `wing`): rolls the lines for the colour.

## Server (`server/src/modules/wing/`)
- `wing-rules.ts` (pure, tested): line / bind rolls, `joinRefusal`, `planWingStars`, `inlayIssue` (budgets), `featherUpgradeIssue`, `planAdvance`,
  `dyeChoices`. Services under `withCharLock`, validate -> spend -> write -> push: `wing-join.service` (subs deleted before the roll, announcement),
  `wing-upgrade.service` (star, hole), `feather.service` (inlay, remove), `feather-craft.service` (upgrade, mix), `wing-refine.service` (prefix / bind /
  dye / look), `wing-advance.service` (state, advance, crit charms), `wing-items.service` (load, stacks, silver, writes, after-effects), RPCs in
  `wing.rpc.ts`, `feather.rpc.ts`, `wing-refine.rpc.ts`, `wing-rpc-util.ts` (`out()` = pushes then reply, refusal -> toast + fail shape).
- Previews (prefix / bind / dye) live in `RefinePending` (kinds `wingPrefix`, `wingBind`, `wingDye`), paid at the preview, cleared on disconnect. ForgeModule
  now exports `ForgeItemsService`, `ForgeMoneyService`, `RefinePending`; WingModule imports AppearanceModule (never the reverse).
- Stats: `inventory/wing-stats.ts` (`wingBonusOf` = level bonus on the four lines (mains after the star) + odd-hole feathers, merged by
  `GearBonusProvider`), even holes -> `WingPetService` (a `PetStatProvider` 'wing' for every pet in panel / battle / arena / ppve contexts +
  `onRefreshPetProp` on equip / unequip through `EquipHooks` and after feather changes).
- Look: `AppearanceService` reads the worn wing (slotIndex 21): `wingResFor(template res_code, colour, level, look, dye)`, `pushWing`,
  `setWingHide`; `onEquipChanged(22)` pushes the look. Worn wing changes (join, look, dye, level) call `pushWing`.
- The generic forge calls (star, hole, socket, refine, tier, name, resolve) refuse wings (`ForgeItemsService.refuseWing`, "Cải tạo cánh"); `bindItem`
  still works (wing flows need a bound wing).
- `GameDataService.TEMPLATE_FIELDS` gained `i3, n1, n2, n3` (feather lines, formula inputs).

## Rule decisions
- Star failure: level dependent (legacy table, owner to confirm): 0 stays 0, 1..5 -> -1, 6 -> 4, 7 -> 5, 8 / 9 -> 0. Auto mode keeps rolling through failures.
- Light wing 1675 fuses with 1675 / 1676 / 1677 / 1678 (Go owner rule 2026-11-07), not only with itself as the plan text said.
- Look 1 / 2 and the dye need art that is not in the cache (only 16 wing sheets): refused with "Hình dạng này chưa có tài nguyên." / "Chưa có tài nguyên nhuộm
  cho cánh này." Add the sheets (and their codes to `WING_SHEET_CODES`) and both work.
- Go-invented constants kept: silver costs, crit odds, level exp table, VIP right 9 bonus.

## Client
- `game/WingController.ts` (created by `CharacterController`; character panel "Cánh" button; `bag.onChange` refreshes it) + `ui/wing/`: `wingWindow.ts`
  (FeatureWindow, 6 tabs), `joinTab`, `starHoleTab`, `featherTab` (hole grid, bag feather list, upgrade, mix), `refineTab` (prefix / bind previews),
  `advanceTab`, `wingDom`, `wingTip` (tooltip lines, used by `itemTip.ts`), `wingTypes`, `wing.css`. Dye options appear as a small confirm-style dialog.
- `AvatarView` wing layer (below the body for directions 0 / 1 / 7, above it otherwise; hidden on a transform body, while mounted and while lying dead);
  `AppearanceController` handles `onWingOn` / `onWingOff` and `setWingHide`; character panel "Ẩn cánh" checkbox.

## Verification (2026-11-09)
- Unit: shared `wing.test.ts` (9), server `wing-rules.test.ts` (7), `wing-stats.test.ts` (5), appearance rules (+1). Gate: shared 302, server 1412, swf 4.
- ws e2e (`wing_smoke.mjs`, two temporary accounts, one GM): grant (all 10 holes open), wingJoin 5 white -> green + duplicate refused, equip -> `onWingOn`
  to self and an observer, stars (single, auto, count 6 refused), hole refusal, inlay char + pet hole, same-category refusal, getFeatherData names and
  values, character feather +3000 HP, pet feather +3000 pet HP + `onRefreshPetProp`, featherDel (bound feather, wing bound), featherUpdate with luck,
  featherMix (formula inputs, refusal fid -1), prefix preview / sure / sure without preview, bind preview / reject, advance + crit charms +
  `buyCritItem`, `changeWingRes` refusals, dye refusal without art, hide / unhide -> `onWingOff` / `onWingOn` to the observer, generic forge gate,
  relog `av.wing`. Accounts removed afterwards.
- Browser: wing renders on the map, "Cánh" button + "Ẩn cánh" checkbox, fusion (blue -> purple), feather inlay on char + pet holes with tooltips, advance tab
  (level 3, crit charms), look / dye refusals as toasts, hide checkbox removes the wing from the map.

## Deferred / notes
- Not verified: orange look 1 / 2 and dye art (no sheets), the 3-look palette flow with real art, two-client view of a map change after a wing look change.
- NPC 1502 / 1571 hooks (`dye_wings_orange`, `showWingFunc`), the Khổng Tước / Chiến Thần skins and timed wings are not ported (plan non-goals).
- Quiet the new RPCs only after the user confirms.
