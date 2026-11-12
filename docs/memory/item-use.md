# Item use effects (plan complete: phases A, G, B, C, D, E, F done)

Plan: `docs/plans/2026-11-07_01_ITEM_USE_EFFECTS.md`. Research: `docs/research/2026-11-07_0{1,2,3}_ITEM_USE_*_RESEARCH.md`.
Legacy (read-only, `E:\mcgame`): `internal/application/item/service.go:1215` (dispatch), `effect_award*.go`, `award_picker.go`,
`effect_quest_item.go`, `effect_desc_bag*.go`, `effect_money_chest.go`, `effect_kimphieu_scroll.go`, `effect_mystery_key.go`.

## What works now
- `useItem` dispatch (inventory `UseItemService.useConsumable`): hooks (Mat Dao, title medals) -> level gate (`ITEM_USE_TEXT.LEVEL`) ->
  blood bag / skill book / order / page book -> **`use_type 4` refused (`CANNOT_USE`)** -> consume handlers (item-use module) ->
  `use_type 2` refusal -> flat potion heal -> `CANNOT_USE`.
- Award bags (any 508/509/550 template with `data_tbl_item_award` rows, overlays included): married/class filter, `costGold` (non-bound
  `gold`), weighted pick with `payload.picks`, room check for items and pets, then spend gold -> consume one bag unit -> grant. Items and
  equipment inherit the bag bind; pets (type 12, `quality` = grow rate), exp (31), titles (33), wallet money (30), special currencies (35).
- Template handlers: money chests 2271/2272/2273/1132/2520 (unbound -> `money`, bound -> `moneyBind`), kim phieu scrolls (13 ids ->
  `goldBind`), mystery key 1361 (12 junk items, bind inherited, room first).
- Quest-item chain (id maps whose systems exist): retired 5708 (`BAG_RETIRED`), quest pet bag 178, expand pack 1201, Thu Thach bags
  6040-6044 / 6006-6027 (Tu Linh stone bag), Anh Linh items (description `Mở nhận N điểm Anh Linh` -> `pvePoint`), Than Tu items
  (2336/2992-2994 fixed, 2795/2796 per-level with 3/5 per day, 2480, 5903), point items (3815, 5343, 5215/5216, 5994/5949, 5993/5947,
  5948, 4839/4884/4857, 4162) and nature energy 4054/4838/4885.
- Description bags (`desc-bag/`): faithful port of Go `effect_desc_bag*.go` (tokenizer, name index, aliases, rules, parser). Fixed bags
  grant every entry, random bags one entry; choice bags open the gift box through `ChoiceBagsService` (phase B).
- Choose-one gift boxes (phase B): the useItem path pushes `itemMultitoSel(payload, itemId)` and keeps the box; `selMultiItemByIdx(itemId, idx)`
  picks. Paid chests 5710 (1500 gold, list of 4785) / 6665 (2120 gold, list of 4720), 14 item choice chests, pet choice bag 5266, feather bags
  4924 / 5281 (22 feathers of the level), sub Than Khi box 4873 (5 blue sub pieces), title choice bags 4961-4963 (medals by description) and the
  15 desc-bag choice bags.
- Buff foods (phase C): type 502 handler + 4 wedding candies (`FoodService`); 84 foods from the Go table. Timed foods add to the remaining
  time, 5-battle foods add to the remaining battles; a food without a buff answers `FOOD_NO_EFFECT` and is kept. `potion.ts` no longer heals
  from foods (i1 / i2 are recipe ids).
- Terminal rules of the chain (as Go): not a bag name and no handler -> `CANNOT_USE`; bag name but unreadable description ->
  `BAG_UNKNOWN`. Title medals are claimed earlier by `TitleMedalService` (unchanged).

## Phases D / E / F (2026-11-07, last run)
What works now, on top of the sections above:
- **Rule potions (D)**: `tables/rule-potions.ts` (Go consumable_rules.go: percent / per-level / HP<->MP transfer / revive / SP / cleanse, rule foods 2503 / 3438) +
  `rule-potion.ts` (pure vitals math) + `RulePotionService` (template handlers by id + terminal type 501 handler: a potion without a rule is kept with `FOOD_NO_EFFECT`,
  flat HP / MP potions still fall through to `UseItemService`). Battle-only items outside battle -> `BATTLE_ONLY` (kept); a full target -> `HP_MP_FULL` (kept);
  pet-only items on a character -> `PET_NO_EFFECT`. Linh Lung flasks 4015-4018 are kept (`CANNOT_USE`): the reusable-flask handler is not ported, eating them would destroy them.
- **Pet-target items (D)**: `UseItemService.usePet` now runs the client gate (use_type 2 / 3 only, `PLAYER_USE_TEXT.NOT_FOR_PET`) then `addPetHandler` handlers
  (`PetUseService`): grow potions (`PET_GROW_ITEM_EXP`, pet level >= req_level, exp clamped to owner level + 5, no character level gate; on the character target they answer
  `NEED_PET`), life 1533 (random 500..2000) / 1534 (+10000) capped at 10000, loyalty 425-427 (loyalty is not persisted: always "đã đầy"), HP / MP potions (pet HP / MP are never
  persisted: `PET_NO_EFFECT`), buff foods (`CHAR_ONLY`). Pet logic lives in `pet/pet-item.service.ts` (+ `pet-item-rules.ts`): plans return a refusal text or an `apply` step; the
  unit is consumed between the two. `PetBattleService.grantExp` credits grow exp (no life drain, level-up pushes). Type 507 life items keep the old hook path.
- **useMultiItem (D)**: `@Rpc('useMultiItem')` (targetType, petId, slotId, n) in `multi-use.rpc.ts`; `MultiUseService` loops the single-use path (`useItem` / `usePet`, each unit takes the
  character lock), stops at the first unit that does not shrink the stack, caps n by the stack (`capUseCount`, shared), folds the per-unit slot pushes (`foldSlotPushes`). Reply
  `{ consumed, remaining }` (shared `UseMultiItemReply`). Equipment is refused. Registered **without** `quiet`.
- **Books (E)**: `BookService` -- exp books (`tables/books.ts`: 298/368/369 -> buff 281, 1140/1141 -> 762, 1142/1143 -> 764, 2274/2275 -> 1538) refused (kept) while another active buff has
  char rate >= and pet rate >= (`exp-book.ts strongerExpBuff`, text `EXP_STRONGER`); the same book adds time (`addRemaining`). Encounter books grant buffs 1203 / 1365 / 314 / 313. 326 pet slot book
  (`PetSlotService.bookPlan / applyBook`, cap `PetLimits.maxSlots` 180, not the Go default 120). Terminal type 500 handler: award rows -> award bag (the 66 paid Bí Điển open for their gold),
  `KEPT_SCROLL_NAME` scrolls (Hồi Phù, Bản Đồ Kho Báu, Sách Nhiệm Vụ, Thần Tu, Triệu Hồi, Bài Thi ...) are kept (`CANNOT_USE`), everything else is consumed with `USED` (Go).
- **Consumers (E)**: `combat/exp-rate.ts` (Go exp_rate_buffs.go, props 24 / 25: value >= 100 = book rate (highest wins), < 100 = +% that adds) is applied in `BattleSettleService` per surviving winner
  (character exp and the half-exp pet share) before the boss level-gap clamp; titles / passives / prop 69 are not ported. `EncounterService` reads buffs 313 (no encounter) / 314 (rate 100 %) /
  1365 (fills all 5 enemy slots of the board; Go 10) through `encounter.ts encounterMods`. Luyện Thú Đơn 1581 (buff 565, +4 catch points, 30 min, adds time) is read by `PetCatchService.bonusPoints`
  -> `PlayerCommand.catch.bonusPoints` -> shared `catchRate({bonusPoints})`: the base gate `catchable === 1` becomes `catchable <= 1 + bonusPoints` (the Go points-vs-difficulty model is not ported).
- **Special items (E / F)**: `SpecialItemsService` -- 995 / 1475 attribute reset (`CharacterStatsService.allocatedPoints / resetAllocated` atomic pipeline, 1475 only level <= 39), 1581, 3984 Tinh Hồn Chi
  Thực (+1 to the lowest aptitude below round(template * 1.2) of the battle / following pet, `aptRefined`), Christmas candy 6562 (+1 `xmCandy24`), mount dress bags (`MountService.dressBagPlan`, 30
  days, +30 when held, permanent kept, level < `MOUNT_MIN_LEVEL` answers `MOUNT_REBORN`; only 6636 / 4803-4805 / 6492 have templates in the imported data, 7254-7260 are overlay rows).
- **Gacha boxes (F)**: `GachaBoxService` loads `data_gacha_box_entry` (the tables ARE imported: 230 entries over 44 boxes), registers in the quest-item chain, weighted roll (`gacha-box.ts`), room check ->
  consume -> grant. Supported prizes: item 29, equipment 19 (display colour), basic currency 30 (money / gold / goldBind), game currency 35 (known keys), special soulPnt; entries with pets, carveKP,
  merit, unknown currencies or missing templates are dropped at load (odds re-normalised).
- **Client (D)**: `game/bagActions.ts use()` follows Flash Player.useItem: pet-only (use_type 2) items go to the selected / battle pet, shared `useGate` (use_type 1/3 char, 2/3 pet, level, class, pet
  level), 995 confirm, quantity dialog (`askAmount` gained `initial`) for ids 5375-5697 / `BATCH_ITEM_LIST` (default = stack), wallets / point items (default 1) and pet grow potions (max =
  `petGrowMaxUnits`), then `useMultiItem`. `BagItem` gained `useType` / `reqClass` (items only). Shared: `item-use-batch.ts`, `item-use-gate.ts`.

### Skipped in D / E / F (no target system, or intentionally kept)
- 516 recipe books (144): they teach life-skill / Mat Bao recipes (cooking, potion crafting, Bí Kíp Chế Tạo); this port has no life-skill system and no learned-recipe store (`data_tbl_recipe` is the static
  equipment-craft list, `data_tbl_mystre_recipe` is unused). They get no handler: use_type 1, no rule -> the type default answers `CANNOT_USE` and the book is kept.
- Vigor potion 2797 (needs `CurrentSP` / vigor cap, not in the character schema) and actpoint potions 2021 / 2074 / 2077 (magic estate not ported): no handler (kept).
- Encounter book 1203 (meet on still): the buff is granted but nothing consumes it (the client standing-still timer + `checkBattleStill` RPC are not ported). 314's shorter 3 s cooldown is not ported.
- Pet skill items (17 ids), Linh Lung flasks and refills, transform cards, fishing tools / catches, event openers: other systems. In-battle potion / food use (`consumeForBattle`) still only knows flat potions.
- Pet-equipment auto target, the pet "item" button / Ctrl-to-pet tool mode, task-sweep gate, key / 3012 `enoughBag` guard: client branches left out.

## Files (phases B / C)
- Shared: `PackItemChoice` gained optional `nm` / `ic` (name + icon code, the Flash client resolved them from its own tables), `SelMultiItemArgs`,
  `MULTI_ITEM_PANEL_TEXT`. RPC `selMultiItemByIdx` (registered **without** `quiet`: keep it un-quieted until the user confirms the feature).
- Server `modules/item-use/`: `gift-box.service.ts` (pending map, open / pick), `gift-box-plan.ts` (pure state / payload), `gift-box.rpc.ts`,
  `choice-bags.service.ts` (quest-item chain handlers + `ChoiceBagPort`), `title-choice.ts`, `food.service.ts`, `tables/choice-chests.ts`,
  `tables/food-buffs.ts`. `buff/buff-stack.ts` (stacking math + battle charge plan), `BuffService.grant(cid, buffId, seconds, { addRemaining, battles })`
  and `consumeBattleCharges(cid)`; `combat/battle-end.service.ts` calls it at battlePlayEnd (upLongBuff / delBuff before the stat refresh).
- Client: `ui/multiItemPanel.ts` (+ css), `game/MultiItemController.ts` (owned by `BagController`: pet / bag slot gates, `itemMultitoSel` bind).

## Files (phases A / G)
- Shared `packages/shared/src/item-use.ts`: `PackItemChoice`, `ItemMultiToSelPayload`, `SelMultiItemResult`, `ITEM_USE_TEXT`,
  `itemUseText()`. No new RPCs and no new pushes in A/G (nothing to un-quiet).
- Server `modules/item-use/`: `item-use.module.ts`, `item-use.service.ts` (dispatcher, registered with
  `UseItemService.addConsumeHandler`), `item-use.registry.ts` (**extension point**: `addTemplate(ids, fn)`, `addType(types, fn)`,
  `addQuestItem(fn)`), `award-bag.service.ts` + `award-plan.ts`, `currency-items.service.ts`, `point-items.service.ts`,
  `bag-items.service.ts`, `desc-bag.service.ts` (+ `ChoiceBagPort`), `daily-use.ts`, `push-collector.ts`, `open-helpers.ts`,
  `tables/*` (money chest + kim phieu, mystery key, retired, point items, game currency labels), `desc-bag/*`.
- Changed: `inventory/use-item.service.ts` (+ new `use-item.types.ts`: `ItemUseCtx` gained `tpl` / `bound`, `ItemConsumeCtx` adds
  `classId`), `rewards/item-award.ts` (row filters, picks), `rewards/grant.service.ts` (`money` grant kind, `fromAwardRow`, bind /
  exp, `PushSink`), `rewards/push-sink.ts`, `activity-rewards/reward-grant.service.ts` and `progression/currency.service.ts` (take a
  `PushSink`), `gamedata/overlays.ts` (+4 award overlays), `gamedata/gamedata.service.ts` (`petStoneIdsAtLevel`),
  `pet/pet.service.ts` (`hasRoom`), `pet-stone/pet-stone.service.ts` (`grantUnlocked` / `canGrantUnlocked`), `app.module.ts`.

## How later phases plug in
- Register from your module's `onModuleInit` through `ItemUseRegistry` (exported by `ItemUseModule`); import `ItemUseModule`, never the
  reverse. Handlers get `ItemConsumeCtx` (template row, bind, class, level, `consume()`); consume first, then grant (spend before
  credit); return pushes or `null` to pass. Use `PushCollector` with `GrantService` to get ordered pushes.
- Phase B (done): `ChoiceBagsService` registers the choice chests with `addQuestItem` (ahead of the award rows) and is the `ChoiceBagPort`. The box
  unit is consumed by `GiftBoxService` at the first pick through `InventoryService.consumeStack` (not `ctx.consume()`), after the room check and the
  gold charge; a failed grant refunds the gold, the box stays consumed and its remaining picks stay pending (re-opening any choice box re-sends them).

## Decisions / deviations
- Quest-item chain falls back to `CANNOT_USE` for non-bag names (Go behaviour); the plan said `BAG_UNKNOWN` for every unhandled
  template. Bag-like names with unreadable text answer `BAG_UNKNOWN`.
- `GrantService.fromAwardRow(..., { nested: false })` for hand-opened bags (an item row that is itself a bag stays an item); dungeon
  chests keep unpacking nested bags.
- Not ported in the award handler: equipment prefix attributes (`pre_name_type`, quality > 0 stat rolls) and `payload.mwVong`; award
  types 32 buff / 34 skill / 36 medal / 37 dress material do not occur in the imported tables (skipped with a log line).
- No marriage system: every opener counts as single (Go default without a `MarriageChecker`).
- Item-template seed overlays (`reported_bags`, `site_bags`, `gift_bag_stack`, `quiz` ...) are not imported / applied by `GameDataService`
  (`template()` reads the base collection only), so a few Go bags that rely on their rewritten descriptions stay unreadable here.

## Skipped quest-item handlers (no target system in this port, or owned by a later phase)
- Phase B leftovers: the description-driven pet gift box (`giftBoxEffectHandler`: scans the description for creature names, ~3 templates),
  teacher medals 749 / 788 / 791-794 (title grant by medal, not a gift box), wing choice boxes (no wing system). Pending picks are in memory only
  and the 6665 one-hour box expiry is not stamped.
- Pet skill items (17 ids) still skipped (aptitude fruit 3984 is done in phase E).
- No system: fairy bags, wing boxes, rune bags (5132-5210), talent stone bags (4196-4629, 6516, 6736), Ma Tam items / chests, Bi Kip chest
  mapping, soul bags (Menh Hon; the soul store has no add-to-bag API yet), medal exp items 3816 / 5114 / 5275, Van Chi carve KP 6524 /
  6525, reborn merit medals 4134 / 4155, pet bag handler
  (`pet_bags.go`).

## Decisions / deviations (B / C)
- Choices keep their original wire index after a pick (Go shifted the slice, which broke multi-pick boxes); every ported box has one pick.
- `selMultiItemByIdx` is `forbidInBattle` and requires the `itemId` of the push to match the pending box (stale panels answer -1).
- Food 382 (1 h) and 269 (5 battles) share buff 287: Go stores 382 under an alias row, here the later one overwrites the row.
- `consumeForBattle` no longer heals with foods (they were wrongly healed by i1 / i2); battle foods are not supported (no `field` enforcement).
- Battle charges decrement at `battlePlayEnd` (as Go), so a disconnect before it keeps the charge. The decrement is covered by unit tests only
  (no battle in the smoke).
- Rule foods 2503 / 3438 and Christmas candy 6562 answered `FOOD_NO_EFFECT` until phase D: they are now registered by template id (rule potions / special items).

## Coverage (Mongo `data_tbl_item_template`, 2026-11-07; classified by the dispatcher rules)
Types 508 / 509 / 550: 5 060 templates, 1 005 `use_type 4` (refused). The other 4 055 resolve as:

| outcome | templates |
|---|---|
| title medal (existing `TitleMedalService` hook) | 376 |
| award rows (`AwardBagService`) | 291 |
| description bag readable: fixed / random / choice (choice waits for phase B) | 217 / 5 / 15 |
| id maps: currency items / bag items (178, 1201, Thu Thach) | 28 / 29 |
| money chests / kim phieu scrolls / mystery key / retired | 5 / 13 / 1 / 1 |
| bag-like name, description unreadable -> `BAG_UNKNOWN` | 1 988 |
| no bag name, no handler -> `CANNOT_USE` | 1 086 |

Against the Go chest audit (`E:\mcgame\docs\research\2026-10-26_03_CHEST_AUDIT.md`, 2 986 candidates): the same filter gives 2 973
candidates here; unknown 1 986 vs Go 1 524, the difference being exactly the 462 talent stone (384) and rune (78) bags this port cannot
open. Desc-bag readable here: 236 of those candidates (the Go audit does not split that family out). Bags checked against the Go
tests on real data: 2129 / 6598 food bags, 2854, 4855, 5041, 6563, 7011, 6981, 4972 (fixed), 3837 / 3621 (choice), 3368 (random).

## Smoke D / E / F (ws bot, 2026-11-07, throwaway account `gbox_smoke`)
Rule food 2503, MP->HP 2076, battle-only 1037 kept, no-rule 1645 kept, full 3032 kept, Linh Lung 4016 kept, flat potion 1; pet: grow 961 (level-up pushes), life 1533 / 1534 / full, loyalty 425, use_type
gate, owner cap (clamped exp), grow on the character (NEED_PET); fruit 3984 twice + no pet; exp books 298 -> 1140 -> 298 refused -> 1140 adds time (7191 s) -> 2274 refused; encounter books 327 / 328 / 2056; pet slot
book (+1, and at 180 kept); 995 / 1475 (refund 8 / 5, level gate, nothing allocated); 1581 twice (3596 s), candy 6562 (xmCandy24 +1), mount dress bag 6636 twice (+30 days) and at low level; type 500 default 1165
consumed, Hồi Phù 286 kept, Bí Điển 6373 (-1440 gold, item); gacha keys 1460 / 3354; useMultiItem: kim phiếu x3, n capped by the stack, missing / equipment refused, n 0 / -1 invalid, battle food x3 (battleLeft 15), pet
grow x5 stops at the owner cap after 1. Browser: wallet 643 x5 opens the quantity dialog (default 1) and sends useMultiItem, pet grow 961 dialog (max 5) levels the pet, 995 asks the confirm and refunds the points.
Not smoked: battle exp multiplier, encounter buffs and catch bonus (unit tests only; no battle in the bot).

## Smoke (ws bot against the dev server, 2026-11-07)
Award bag (items, honor currency, class-gated 12-piece set, paid 500 gold with the `onAddMoney` -500 push), pet chest (`onAddPet`),
money chests (bound / unbound), kim phieu, mystery key, `use_type 4` refusal, retired bag, description bag with bind inherited,
unreadable bag, no-handler item, full bag (`NO_ROOM`, nothing consumed), no gold (`NEED_GOLD`, kept), spirituality daily cap (4th use
refused), Anh Linh / point items, quest pet bag (5 pets), Thu Thach bags, expand pack; flat potions and page books unaffected.

## M13 E2: Ma Tâm and medal exp items
`ItemUseRegistry.addQuestItem` handlers: Ma Tâm items (type 550, template 5375-5697 / 5770-5841, `propl_num` = `creatureh_heart` id) add the heart to the Ma Tâm bag (`monsterheart/monsterheart-items.service.ts`, runs inside useItem's lock via `grantLocked`),
Tâm Tinh Thạch 5884 (+1 `mhjingshi`), Ma Năng stones 5877 / 5878 / 5879 (+5000 / 3000 / 1000 `monsterHeart`), and medal exp items 3816 / 5114 / 5275 (+25 / +125 / +2000, `medal/medal-items.service.ts`). See `monster-heart.md`, `medal.md`.

Phase B / C smoke (ws bot, 2026-11-07): paid chest 5710 (note + panel, pick -> item, -1500 gold, box -1, `onUPP{gold}`), bad index -> -1, re-open
while pending, no gold -> `NEED_GOLD` without a panel, free chest 4785, pet bag 5266 (`onAddPet`), feather 4924 (22 choices), Than Khi 4873 (equipment
colour 3), title choice 4961, desc choice bags 3837 / 3621, full bag -> `PICK_NO_ROOM` with the box kept, food 374 twice (7195 s left), battle food 105
twice (battleLeft 10), food without buff 4153 kept with `FOOD_NO_EFFECT`, wedding candy 1690, potion 1 still heals. Browser: bag double-click on 5710
opens the panel (3 per page + pager), pick closes it and the item lands in the bag.

## Phase F: Bí Kíp Chế Tạo Mật Bảo (2026-11-12)
The 66 type-516 books 5042-5107 are no longer skipped: `MysteryBooksService` (`modules/mystery/mystery-books.service.ts`) registers them with `ItemUseRegistry.addTemplate`. Recipe = id - 5042 + 1 (level = offset / 11 + 1); a level-1 book or a known recipe answers "Bạn đã học công thức này." and the book is kept; any other book is consumed first, then `learnedRec` is written (a book may be read below the craft level, crafting still needs the skill level) and `updateMysTreMakeData` is pushed. The handler runs inside useItem's character lock, so it writes the feature store directly. The other 516 books (life skills) still have no handler.
