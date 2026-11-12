# Dress system - Tủ Đồ (M13 phase B, 2026-11-09)

Plan: `docs/plans/2026-11-07_02_DRESS_AND_FLYING.md` (phase B) under `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md`. Research:
`docs/research/2026-11-07_04_DRESS_FLYER_CLIENT_RESEARCH.md`, `..._05_DRESS_FLYER_SERVER_RESEARCH.md`. Look side (resolver, pushes, flying):
`docs/memory/appearance.md`. Hồn Khí / deco and runes were built later in M13 E1 (`docs/memory/rune-deco.md`). Out of scope and not built: wings (see wings.md), fairy, rebirth look, double fly, flying encounters, award type 37.

## Contract (`packages/shared/src/dress.ts`)
- `DressInfo {book {id:1}, recipe {id:count}, bag {crystal, jewel}, extract, score, fakeDressId, fakeFlyDressId}` travels as an object in every
  reply; the stored document also has the server-only `day` (UTC+7 `dayKey`), never sent. Constants: costs 30 / 288 gold, 300 / 2880 Điểm Thời
  Thượng (`DRESS_*_COST`), crystal 1 / jewel 5 gold, `DRESS_FREE_EXTRACT 1`, ten = 10 chips + 1 set, transform needs 3 sets (cap 500 rounds per
  `transformAllRecipe`), `RECIPE_NOT_BUYABLE 999999999`. `DRESS_PANEL` (verbatim Flash strings, tags stripped) and `DRESS_SERVER_TEXT` (H5 refusals).
- New currency key `shishangdian` (id 61) in `CURRENCY_IDS`; `/grant currency shishangdian N` fills it (players have no income yet, as in Go).
- RPCs, all registered **without** `quiet` (remind the user to quiet them after confirmation); mutating ones are `forbidInBattle`; a refusal
  pushes `onSystemMidMsgOrNote` and rejects the call (no silent null):
  `getDressCatalog` -> `{dresses, recipes}` (H5), `checkSameDay` -> DressInfo, `activeDress(dressId, autoBuy)` / `ensureBuyActive(dressId)` ->
  DressInfo, `recieveGoods(dressId)` -> DressInfo, `exchangeRecipe(recipeId)` -> DressInfo, `freeExtractRecipe` / `goldExtractRecipe` /
  `ssdExtractRecipe` -> `{dressInfo, recipeId, recipeNum}`, `tenExtractRecipe` / `largessdExtractRecipe` -> `{dressInfo, planArr[11] {recipeId, num}}`
  (one entry per roll, the set last), `makeAllChips` -> DressInfo (+ `onMidNote` "Ghép thành công"), `transformRecipe(ids)` ->
  `{dressInfo, recipeId, recipeNum}`, `transformAllRecipe(ids, picked?)` -> `{dressInfo, produceArr {recipeId, recipeNum}}`,
  `setFakeDress` / `unsetFakeDress(dressId, resCode)`, `setFakeFlyerDress` / `unsetFakeFlyerDress(dressId, resCode, wavCode)` -> DressInfo. The
  `resCode` / `wavCode` arguments are accepted and ignored (the server resolves the art from the dress row).

## Server (`server/src/modules/dress/`)
- `dress-state.ts` (parser, `publicInfo`, `rollover`, `addRecipe`), `dress-draw.ts` (pools, weights, `rollPool`; weights are OWNER-CONFIDENTIAL, code
  only, never in text), `dress-rules.ts` (pure: `planActivate`, `planExchange`, `planDraw` + `DRAWS`, `mergeChips`, `planTransform`, `groupDrops`,
  `dressBonuses`), `dress-state.service.ts` (load with the daily reset / save), `dress.service.ts` (catalog, check, activate, receive, exchange,
  fake), `dress-draw.service.ts` (draws, merge, transform, rare announcement), `dress.rpc.ts` + `dress-recipe.rpc.ts`, `dress.module.ts`.
- Feature store key `dress`. Static data cached in `GameDataService` (`gamedata/dress-data.ts`): `dressRow`, `dressRows`, `dressOfRecipe`,
  `recipeRow`, `recipeRows`. Order of every paid action: validate (pure plan) -> conditional spend (`spendMoney('gold')` or
  `CurrencyService.spend('shishangdian')`) -> save -> refund on a failed write -> pushes -> announcement. Everything under `withCharLock`.
- Rules: free draw 1 a day (UTC+7), chips from every type-2 recipe, sets from type-1 `is_open`; rare fashion = position >= that of dress 1044, rare
  flyers = ids 2017..2022; dress 1072 (Yasuo) never rolls (pools 92 chips / 93 sets). Only a rare **set** (ten draw bonus, transform) is announced
  with `onSystemSay` "Chúc mừng <name> đã rút được [<set>]" (plain text: the H5 chat has no `[@PID|..]` parser). Gold draws add Điểm thưởng
  (30 / 288), ssd draws none. Activation: needs `recipe[recipe_id] >= 1`; 75 Pha Lê + 15 Bảo Châu from `bag`; with `autoBuy` the shortfall is
  bought in unbound gold (1 / 5) and a notice "Tiêu hao N vàng." follows; then `onUPP` stats. `recieveGoods` (repeatable) mints the bound
  equipment with colour `min(dress.color, 4) + 1` through `GrantService` after a bag-space check. Exchange: type-1, `is_open`, `0 < money < 999999999`.
  Transform: first 3 ids must be type-1 sets, duplicates summed; `transformAllRecipe` rolls `min(owned / needed)` rounds; the `picked` variant pools
  all owned copies of the picked sets. Crystals / jewels have no item source (auto-buy only).
- Stats: `DressBonusProvider` (`stats/feature-providers.ts`, registered in `stats.module.ts`) adds prop1..4 of every activated dress as flat
  bonuses through `EQUIP_PROP` (1 maxHp, 4 attack, 5 magic attack, 11 speed).
- Look: `AppearanceService.fakeArts` reads the `dress` document itself (no import of DressModule, which imports AppearanceModule) and resolves the
  fake costume / fake flyer art from the dress row's equipment template; the dress must still be in the book. A fake only replaces a worn costume /
  flyer (resolver rule). `DressService.setFake` calls `syncDress` (fashion) or `pushFlyer` (flyer) after the save, so peers see it.
- Forge gate (R17): `ForgeItemsService.equipRow(cid, id, wornOk, gate = true)` throws `DRESS_SERVER_TEXT.FORGE_GATE` for kind 10 / 11 or position
  14 / 21 (star, hole, socket, upgrade, prefix, element / bind / soul, name, resolve); `getStarNum`, `getHoleNum`, `getJewelData`, `getUpgradeInfo` pass
  `gate = false`; `bindItem` calls `refuseDressGear` first. Fashion already has no durability loss (`relive-mode.ts`).

## Client
- `game/DressController.ts` (created by `CharacterController`; the character panel "Tủ đồ" button now opens it, the bag stays on the HUD button / B
  key): lazy `getDressCatalog` + `checkSameDay` on open, one RPC at a time, replaces the cached DressInfo from every reply, shows the result popup,
  redraws on `onUPP`.
- `ui/dress/`: `dressWindow.ts` (4 tabs in the `FeatureWindow` shell, class `dress-window`), `overviewTab.ts`, `activateTab.ts` (auto-buy confirm quotes
  the gold), `drawTab.ts`, `transformTab.ts` (click a set to fill the next cell, click a cell to empty it), `exchangeWindow.ts` (lists only buyable open
  sets), `resultPopup.ts`, `dressCells.ts`, `dressRules.ts` (pure, `dressRules.test.ts`, run from `server/`), `dress.css`.
- Deviations from the Flash panel: no rotating 3D preview in Tổng Quan (the fake look shows on the character); "Số lần" shows the real counter
  (`max(0, 1 - extract)`); Đổi bộ hides unbuyable sets; click-to-fill instead of drag and drop in Chuyển Bộ; no "Chọn bộ" picker UI (the server accepts
  `picked`).

## Verification (2026-11-09)
- Unit: `dress-rules.test.ts` (11), `dress-draw.test.ts` (3); client rules test (6) run from `server/`.
- ws e2e on a local test account (GM level 1, level 50): catalog 94 / 187, checkSameDay, every refusal toast, free / gold / ten / ssd / largessd draws
  with gold and currency deltas, makeAllChips, exchange (incl. chip id and 999999999 refused), activate with and without auto-buy (150 gold, maxHp
  rose), recieveGoods, equip fashion -> onSetRes dress, setFakeDress -> `onEquipOn` then `onSetRes` of the fake art and scene `av`, fake flyer
  `onFlyerOn`, unset restores, forge star / hole refused with the R17 text, transform (single, all, picked, chip refusal, 2 cells refusal).
- Browser: Tủ Đồ opens from the character panel, 4 tabs, activate confirm with the gold quote, free draw popup, transform popup, Đổi bộ window, no
  console errors. Account removed afterwards.

## Deferred / notes
- Not browser-checked: the two-client view of a fake dress, fake flyer drawing, flyer pages of the lists (data and pushes are e2e-checked).
- `PlayerData` carries no `dressInfo` (the panel fetches it on open).
- Quiet the new RPCs only after the user confirms.
