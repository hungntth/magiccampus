# Mật Bảo + Lò luyện thần bí (M13 phase F, 2026-11-12)

Plan: `docs/plans/2026-11-04_16_APPEARANCE_GEAR.md` (§2.6a, phase F). Research: `docs/research/2026-11-12_01_MYSTERY_ASTROLOGY_RESEARCH.md`. Sister notes: `astrology.md`, `rune-deco.md` (runes / chips from the dissolve).

## Contract (`packages/shared/src/mystery.ts`)
- `MYS` consts (kinds 1..11, 50 crafts a day, +2 skill points, bag keys 1..200, VIP right 28, resolve 10 % rune / 30 % chip), `MYS_TRE_NEED_SKIPT`, `MYS_ADD_TIMES_GOLD` (6 tiers, 40 purchases a day), pure `addSkillPoints`, `pickCraftStar` (70 / 25 / 5),
  `mysAddTimesCost`, `mysBookRecipe` (book 5042 + offset -> recipe offset + 1, level offset / 11 + 1), `resolveRuneQuality` / `resolveChipQuality`, `mysRecipeLabel` (seed recipe names are cut at 20 chars: panels build "<family> Cấp N" from `MYS_TEXT.RECIPE_FAMILIES`).
- Wire types: `MysBag {slot>=1: {mid,num}}`, `MysBook {kind:{id:id}}`, `MysMakeData {learnedRec, skiLvl, skiPt}`, `MysLimit {n, t}` (t = UTC+7 day key), `MysBuffByKind`, `MysBuffSimple`, H5 `MysCatalog {recipes (66, mats with name / icon), items (720)}`, `MakeMysTreReply`, `FurnaceInfo / FurnaceReply`, `FURNACE_SCORES` (types 2..17), `MYS_TEXT`, `FURNACE_TEXT`.
- `CURRENCY_IDS` unchanged (`mysteryCrystal` 215 and every score key already existed). Strip ids: `ActivityId.MYSTERY_FURNACE = 51` (also `ASTROLOGIC = 28`), both in `ACTIVITY_PORTED_IDS`.

## RPCs (all registered WITHOUT `quiet`; mutating ones `forbidInBattle`; a refusal = `onSystemMidMsgOrNote` + rejected call)
Reads: `onGetMysBookData`, `onGetMysMakeData`, `onGetMysBagData`, `onGetChipBagData` (the rune chip bag), `getMysTreBuffByKind(kind 1..11)`, `getMysTreBuffSimpleData`, `onGetMysAddTimes` -> `{n purchases, t}`, `onGetMakeLimitTimes` -> `{n crafts left, t}`, H5 `getMysCatalog`, `getFurnaceInfo`.
Writes: `addLimitMakeTimes` -> `{n, t}` (gold tier price, `onUPP {gold}` + `onAddMoney` + `updateMysTreMakeTimes`), `makeMysTre(recipeId, {slot:{idx}}, {slot:stack})` -> `MakeMysTreReply` (Flash had a null responder), `mysTreObjResolve({slot:{mid,num}})` -> null,
`MysteryExchangeItem({instanceId:true}, md5pass)` -> `{num, mysteryCrystal}`, `MysteryExchangeScore({type:count}, md5pass)` -> `{num}` (`md5pass` accepted and ignored: H5 has no secondary password).
Pushes: craft = slot pushes (`onAddCharactorSlot` / `onDelCharactorSlot`), `updateMysTreMakeTimes(n)`, `updateMysTreBag`, `updateMysTreMakeData` (Go-only name from the client bytecode), and for a NEW piece `updateMysTreBook`, `onActiveMysBookInfo {t:123,id}`, `onUPP` (stats), then `onBlueMsg`;
resolve = `updateRuneChipBag`, `onAddMoney decoSilver`, `updateMysTreBag`, `onRuneBagUpdate` (rune landed), note, `onUPP {currencies}`; furnace = `onDelCharactorSlot` / `onAddCharactorSlot`, `onUPP {currencies}` (+ `onUPP {medalExp}` for type 5), `onRedMsg` for a refused item.
Dev sources: `/grant item <id> <n> [colour]` now takes the instance colour (recipe materials need colour 2), `/grant currency <key> <n>`, `/grant medalexp <n>`; level-2+ books are items 5053..5107 (`/grant item`).

## Server (`modules/mystery/`)
- `mystery-state.ts` (feature key `mystery_treasure`: `bag, learnedRec, skiLvl, skiPt, mysBook, activeObj, make {day, made, addTimes}`; tolerant decode, key-0 pieces moved to a visible slot, Go `makeLimitTimes` / `addTimes` stamps decode as a fresh day),
  `mystery-rules.ts` (pure: `rollDay`, `craftsLeft`, `addToBag`, `collectedRows` (codex + bag), `collectionTotals`, `resolveInputs`, `checkMats`, `pickCraftOutput`, `applyCraft`, `planBook`, `parseResolveArg`, `planResolve`, `buildDropPools`, `rollResolveDrops`),
  `mystery.service.ts` (reads, `make`, `buy`), `mystery-resolve.service.ts`, `mystery-books.service.ts` (type 516 ids 5042..5107 through `ItemUseRegistry.addTemplate`, lock-free store write inside useItem's lock), `furnace.service.ts`, `mystery.rpc.ts`, `furnace.rpc.ts`, `mystery.module.ts` (imports Character, Forge, GameData, ItemUse, Progression, Rune, Stats, VipCore).
- Static data: `gamedata/mystery-data.ts` (`mystre`, `mystreGroup(kind, level)`, `mystreRecipe`, `recyclingItem(tid, colour)`, `recyclingScore(type)`; first row of a key wins over the four recycling collections; `silverShopSet()` = templates an NPC shop sells for silver only, computed once from the shop slots + template prices).
- Order of every mutation (under `withCharLock`): validate -> spend (materials through `ForgeItemsService.consume`, gold through `CharacterService.spendMoney('gold')`, balances through `CurrencyService.spend`) -> write -> credit -> pushes. Gold is refunded when the state write fails; a failed crystal credit after the items were spent is the same forward-loss window as Go (single Mongo write).
- Allowance: `cap = 50 + purchases today + VIP right 28`, `left = cap - made` (UTC+7 day key from shared `dayKey`). Deviation: Go refilled the remaining count on a purchase (a purchase after 50 crafts gave 51 more); H5 derives it so a purchase is exactly +1.
- Collection stats: `MysteryBonusProvider` in `stats/growth-providers.ts` (flat `prop_num` by `prop_type` through `EQUIP_PROP`, every piece ever owned or present in the bag counts once; decomposing never un-collects). ws check: attack +553 for 11 attack pieces.
- Resolve: Bí Ngân = `mys_sil x num`; per unit 10 % one level-1 rune (colour by Mật Bảo level 1-2 green, 3-4 blue, 5 purple, 6 orange) and 30 % one chip (purple, orange at level 6), never rare families; `RuneService.grantLocked` (new, lock-free) writes the bags. A stale selection pushes the current bag + a note and consumes nothing.
- Furnace: items = general-bag ITEM stacks only, whole stack, `recycling(type 1, tid, colour).value x stack`; refused: no row, silver-shop item (`onRedMsg` + note), stale stack. Scores: types 2..17, key "0" count 0 skipped, counts re-checked against the real balance, conditional spends with refund on failure, medal exp lives in the `medal` feature state. A crystal balance above `MAX_CURRENCY` is refused.

## Client (`game/MysteryController.ts`, `ui/mystery/*`, `game/FurnaceController.ts`, `ui/furnace/*`)
- Mật Bảo = 4th tab of the Hồn Khí window (`decoWindow.ts`, `DecoUiHost.mystery`, `loadMystery`); `MysteryController` is created by `DecoController` (host `items()` = bag + worn items). Sub pages: `collectPage` (11 kinds with progress, pieces grey / green, kind buffs), `craftPage` (level tabs red above the skill level, learned filter, six material slots, "Tự động đặt nguyên liệu", craft button auto-places when needed, "Mua lượt" confirm), `resolvePage` (30 per page, click = whole stack, "Chọn tất cả", Bí Ngân preview). Pure `mysteryRules.ts` (+ test, run from `server/`).
- Furnace = strip icon 51 (`FurnaceController` owned by `ActivityController`): item grid + score rows, confirm dialogs, `getFurnaceInfo` refresh after a smelt.

## Verification (2026-11-12)
- Unit: server `mystery-rules.test.ts` (11), `gamedata/mystery-data.test.ts` (3), shared `mystery.test.ts` (8, shared with astrology), client `mysteryRules.test.ts` (5) + furnace rules. Gate: shared 338, server 1491, swf 4, lint clean.
- ws smoke (two temporary accounts, removed): catalog 66 / 720, 11 free recipes, refusals (no materials, 51st craft, 41st purchase, level-2 recipe at skill 1), craft push order + reply + codex + skill +2, collection buffs, tier prices (20 then 30), books (level-1 kept, level-2 learned early), resolve (Bí Ngân = sil x num, stale, 300 units -> 84 chips / 27 runes, no rare chips), furnace items (140 crystals for 7 x 20, stale refusal, silver-shop potion refused) and scores (500 x 200 + medal exp 100 x 200, over-balance / type 18 / negative refused), relog.
- Browser: strip icons 28 / 51 appear, Mật Bảo tab (collect progress, craft with auto-place -> 49 left / skill 2/100 / toasts, buy confirm -> 50 left, resolve -> Bí Ngân 210 + rune drops note), furnace item smelt (7 x 20 = 140) and score smelt (3 x 200).

## Deferred / values for the owner
- Go-invented and kept: star weights 70 / 25 / 5, +2 skill points per craft, 10 % / 30 % resolve odds (Go reads them from `game_tuning`; H5 constants in `MYS`), the 50 / day base. Owner to confirm.
- No income source for the Bí Kíp books or the materials beyond `/grant` (boss / dungeon drops are other milestones); the dissolve is the first source of runes and chips in H5.
- The Flash drag-and-drop of materials is replaced by the auto-place button; the Flash "Chỉ hiển thị đã học" filter and the tab colours are kept. Seed piece names with broken encoding (e.g. "B¨²a Minotaure") are shown as stored.
- Quiet the new RPCs only after the user confirms.
