# Item use: typed and template-specific effect handlers (legacy Go) vs our port

Scope: legacy `useItem` effects for typed handlers (500/501/502/503/504/505/506/507/512/513/515/516/520, stubs) and
template-id handlers. Bag/chest/award/gift-box/quest-item (508/509/550 chain), wallet, buff, default fallbacks are covered
by another report. Legacy repo path is `E:\mcgame` (not D:). All paths below are relative to `E:\mcgame\internal` unless noted.

## 1. Summary

`UseItem` (`application/item/service.go:1098`) loads the item, equips equipment, checks `req_level`, then calls
`applyItemEffect` (`service.go:1215`) which dispatches in this order:

1. template id 719 -> consumed no-op (`service.go:1220`);
2. **`use_type == 4` -> `ErrCannotUseItem`** (`service.go:1224`) - a hard gate before any handler;
3. `petGrowHandler` (id in `petGrowItemExp`) (`service.go:1228`, `effect_pet_grow.go:55`);
4. `templateHandlers[tpl.ID]` (`service.go:1231`);
5. `typeHandlers[tpl.Type]` (`service.go:1236`) - always terminal when the type is registered;
6. `awardHandler.CanHandle`, then `fallbackHandlers` box/wallet/buff/default (`service.go:1240-1250`).

Before `applyItemEffect` the RPC handler (`handlers/item/use.go:22`) runs `tryUseItemTemplateHook` (loop boss, encounter
books refused in battle, treasure map, Mat Dao book, celebration, quest-start, dragon-ball wheel; `use_template_hooks.go:21`),
the pet-equipment route (`use.go:81`, `use_pet_equip.go:24`), and `prepareBookUse` (life-skill books, recipe books type 516,
Mat Bao recipe books; `use_books.go:30`).

Key finding for the port: the `use_type` column decides a lot. Data (Mongo `data_tbl_item_template`):

| type | n | use_type distribution | Go outcome from bag |
|---|---|---|---|
| 500 | 189 | all 1 | scroll handler |
| 501 | 106 | 1:22, 2:20, 3:61, 4:3 | described-consumable rules |
| 502 | 143 | 1:141, 3:1, 4:1 | buff food / rule / refused |
| 503 | 72 | all 4 | **refused** (`ErrCannotUseItem`) |
| 504 | 2 | all 4 | refused |
| 505 | 197 | all 1 | skill-book learner |
| 506 | 199 | all 2 | `creBook` handler, but I1 = 0 for all 199 -> refused |
| 507 | 28 | all 4 | refused (handler is dead) |
| 512/513 | 1/4 | all 4 | refused (handlers dead) |
| 515 | 15 | all 1 | fishing tool handler |
| 516 | 144 | all 1 | learned in `prepareBookUse` |
| 510,511,514,517,518,519,522-527,551,552 | 1,1,1,12,15,1,1,1,1,1,1,1,1,12 | all 4 | refused |
| 521 | 22 | all 2 | stub, refused |
| 520 | 0 templates | - | handler never fires |

"Refused" shows the player `onSystemMidMsgOrNote "Vật phẩm này hiện chưa sử dụng được."` and consumes nothing
(`handlers/item/use_notices.go:48`; `use.go:117-119`).

## 2. Entry points

| RPC | Go handler | Service |
|---|---|---|
| `useItem(targetType, targetId, slotId)` | `handlers/item/use.go:22` `UseItem` | `service.go:1098` `UseItem` -> `applyItemEffect` `service.go:1215` |
| `useMultiItem(targetType, petId, slotId, num)` | `use.go:174` | `use_multi.go:44` `UseMultiItem` (per-unit loop; batched paths for pet grow, point items, Christmas candy, kim phieu, spirituality) |
| battle item (action -60) | `handlers/combat/battle_item.go` | `battle_item_effect.go:26` `ResolveBattleItemEffect`, `battle_catch_potion.go:25` |

`useItem` args: `targetType` (1 character, 2 pet), `targetID` (pet id when type 2), `slotID` (item instance id, with SID
fallback) (`use.go:34-58`). `uctx.PetID` is set only when `targetID > 0 && targetType == 2`, or when the template is type 507
(`use.go:108-117`).

## 3. Rules per handler

Common result contract (`effect.go:36-60`): `ConsumeItem` defaults true (`NewEffectResult`); `keepItem(msg)`
(`effect_consumable.go:36`) = not consumed + `Message`. A returned `error` consumes nothing (unless items were already granted,
`service.go:1160-1173`). Level gate before everything: `char.Level < tpl.ReqLevel` (except pet grow items) -> `ErrInsufficientLevel`
-> push `onSystemMidMsgOrNote "Cấp độ không đủ!"`, nothing consumed (`service.go:1147`, `use.go:112`).

### 3.1 Type 500 scroll (189 templates) - `effect_scroll.go:22`
CanHandle: `tpl.Type == 500`. Sub-routing in `Apply` (`effect_scroll.go:26-41`):
1. **Expand books** 324 (bank +1 tab, max `MaxBankTabs`), 325 (bag +1 tab, max `MaxBagTabs`=20), 326 (+1 pet slot, max `PetCarrySlotCap`, default 120)
   - `effect_expand_book.go:23-77`. At max -> `ErrContainerAtMax` wrapped, shown as notice "Túi đồ đã mở tối đa 20 ngăn." / "Kho đã mở tối đa N ngăn." / "Túi pet đã mở tối đa N chỗ." (`use_notices.go:56-62`). Item kept at max.
   Pushes: `onUPP {bagSlotNum,bagSlotTotal | bankSlotNum | petMaxNum}` via `ExtraUPP` + stat refresh. (Memory file said these are no-ops; code says they work; our port's `bag-pages.ts` already covers 324/325.)
2. **Encounter books** (9): 2053/1857/1872/1873 -> buff 1203 (15m/1h/3h/6h), 2055/2056 -> 1365 (15m/1h), 328/329 -> 314 (15m/1h), 327 -> 313 (15m). `effect_encounter_book.go:28-38`. Reuse adds remaining time (`remainingBuffTime`, `effect_encounter_book.go:96-107`). Hook refuses all but 327 while user or a non-AFK party member on the same map is in battle: "Đang trong trận chiến, không thể sử dụng." (`handlers/item/encounter_book_battle.go:23`), item kept.
3. **Exp books** (9): 298/368/369 (1h/3h/12h) -> buff 281 (x1.5, props 24/25 = 150), 1140/1141 -> 762 (x3), 1142/1143 -> 764 (x5), 2274/2275 -> 1538 (pet x3, prop 25 only). `effect_exp_book.go:35-45`. Gate `strongerExpBuff`: refused and kept with `"Đang có hiệu ứng %s mạnh hơn, không thể dùng %s."` when another active buff already has char and pet exp rates >= the book's (rate = prop 24 / 25 value/100, only when `percent_flag == 1` and value >= 100) (`effect_exp_book.go:76-107`). Same book again extends time.
4. Scroll whose award rows are all type 33 (titles), e.g. 6474 -> award handler (`effect_scroll.go:38-40`).
5. **Everything else** (~165 templates: 132 "Bí Điển ...【Tốn Phí】", 11 "Hồi Phù" teleports, Mat Dao books 128/2137, treasure maps 41/42/313/314/3388/3389, summon books 2514/2543/2798, etc.): consumed with message `"Đã sử dụng %s."` and **no effect** (`effect_scroll.go:41-43`). Teleport/Mat Dao/treasure-map items work only through the hook or separate RPCs (`useTransport*`, `tryUseSecretPassageBook`, `tryUseTreasureMap`). The 66 Bí Điển rows that have `item_award` rows with `{"costGold":1440}` (e.g. 6373 -> award 6307) are **not** routed to the award handler by the type-500 handler - Go gap; unverified whether intended.

Buff grant request shape (all book buffs): `appbuff.AddRequest{BuffID, BuffType: Timed, Source, Duration, StackCount:1}`; message `"Đã sử dụng %s."`; result `GrantedBuffs` -> push `upLongBuff` (`reward_callbacks.go:35-41`).

### 3.2 Type 501 potion (106) and 502 food (143) - described consumables
Both route to `applyDescribedConsumable` (`effect_consumable.go:44`, `effect_potion.go:22`, `effect_food.go:22`). Never read `I1..I3` as heal amounts: they are the cooking recipe (`effect_food.go:3-8`). Order inside:

1. If template in `foodBuffs` (`food_buff_table.go:46-134`, 84 entries): pet target -> keep, "Vật phẩm này chỉ dùng cho nhân vật."; else `GrantFoodBuff` (`effect_consumable.go:192`): `AddOrRefresh` with `Source "food:<tid>"`, `StackCount 1`. Timed foods: `Duration = fb.duration + remaining time of the same buffID` (durations: 15 min `foodQuarter`, 30 min, 1 h, 2/3/6 h). Battle-count foods (`battles: 5`, ids 105, 259-269, 5000): `BuffType Battle`, `BattlesLeft = 5 + remaining battles`. Result: `GrantedBuffs`, `RefreshCharacterView`, message "Đã sử dụng %s." Pushes: `upLongBuff`, then `onUPP` stat refresh. `field` flag (dùng khi không chiến đấu) is only enforced in battle (`battle_item_effect.go:29`); battle-count decrement is `appbuff.ConsumeBattleCharges` at battle end (comment `food_buff_table.go:9`, unverified body). Wedding candies 1690->1183, 1694->1184, 1695->1185, 1696->1186, 15 min (`effect_wedding_candy.go:24-45`). Shared buff ids: 292 (378, 379, 263, 5000, ...), 1716 (2536, 2706), 2339 (3439, 5352), 287 (269 battles, 382 hour under alias `ToanGiaPhucHourBuffID`).
2. `consumableRules[tid]` (`consumable_rules.go:48-100`), plus flat table `potion.go` HP {1:300, 2:600, 4:600, 110:1000, 113:2000, 321:3000, 371:6000, 1975:9000}, MP {158:300, 125:600, 126:1000, 127:2000, 322:3000, 370:5000, 1974:7000}. `env`: `envBattle` (revive 1037, cleanse 1890/3231, SP 2427/2430/2431/2568/2569, skill-table buffs 2435-2439, 2682/2683/2686/2687) -> keep, "Vật phẩm này chỉ dùng được trong chiến đấu."; `envField` (3438) refused in battle.
   Vitals formula (`consumable_rules.go:131-160`): `hp = HP + maxHP*HPPercent/100 + HPPerLevel*charLevel`, same for MP; max is `uctx.EffectiveMaxHP/MP` (max of base and computed). HPToMP (2075) / MPToHP (2076): move `min(cur*10/100, cur-1 for hp, room)`. Both zero -> keep, "HP / MP đã đầy, không cần hồi phục." Pet target (`useItem(2, petId)`): same rule on the pet's HP/MP, pet dead (`CurrentHP <= 0`) or nothing to restore -> keep, `petPotionNoEffect`; pushes `onUpdatePet` via `UpdatedPets` (`effect_consumable.go:140-162`). Character: push `onUPP {money,currentHp,currentMp}` (`use.go:151-157`); negative moves go through `ExtraUPP`.
3. Pet-only rules: Đê/Trung/Cao Cấp Thủy Dược 425/426/427 = +5/+30/+100 loyalty up to `MaxLoyalty`, full -> keep "Độ trung thành của pet đã đầy." (`effect_pet_loyalty.go:16-36`); Thọ Mệnh Đan 1533 = random 500..2000 life (`thoMenhDanLifeMin/Max`), 1534 = +10000, capped at `MaxLife`, full -> keep "Thọ mệnh của pet đã đầy.", success message "Thọ mệnh của pet tăng %d điểm (%d/%d)." (`effect_consumable.go:165-187`). Used on a character -> keep `petPotionNoEffect`.
4. No rule and no buff -> keep, "Vật phẩm này chưa có hiệu quả sử dụng." (`effect_consumable.go:21`). Real counts: 143 type-502 = 84 `foodBuffs` + 4 wedding candies + 2 rule foods (2503, 3438) + 1 Christmas candy 6562 + 1 use_type-4 (3741) + **51 refused** as "no described effect" (most pet foods "Tăng 9 kháng ... cho pet", level-scaled "1/10 cấp độ" foods, Trung Thu cakes). Type 501: 22 of 106 have no mapped effect (e.g. 1645 Thuốc Kinh Nghiệm, 1686 Kinh Nghiệm Đan, 2800-2802 Tiềm Năng Bí Dược, 3390-3392 Quả Tinh Linh, 4608); several others are special template handlers below.

Template-gated 501 potions: use_type 3 (61 templates) is the "battle potion" type; `potionEffectHandler.CanHandle` is not consulted by dispatch (type handler is terminal).

### 3.3 Type 503 gem, 504 star stone
Both `use_type = 4` in data -> blocked at `service.go:1224` before the handler. `gemSocketHandler` (`effect_gem_socket.go:25`) would consume the gem and say "Đã gắn %s." without touching the equipment (dead code); `starStoneEffectHandler` explicitly returns `ErrCannotUseItem` (`effect_star_stone.go:1-3, 25`). Direct use is NOT meaningful: gems/stars go through the forge RPCs (`jewelSet`, `starOne/starAll`, see `reference_go_economy_navigation`). Port: refuse with the generic notice.

### 3.4 Type 505 skill book (197) - `effect_skill_book.go:31`
`tpl.I1 > 0` -> consumed with "Đã sử dụng %s." (none in data: I1 = 0 for all 197). Life-skill books 2400 (Câu Cá), 2408 (Hái Thuốc), 2409 (Trồng Trọt), 2410 (Nấu Ăn), 2411 (Chế Thuốc) are learned earlier in `prepareBookUse` (`LearnLifeSkillByBook`; "Bạn đã học kỹ năng này." keeps item and returns success; level too low -> "Cấp độ không đủ!"; message "Đã học kỹ năng <name>.") and the effect only consumes. Others: `LearnSkillFromBook(name)` (level-1 skill matching the name suffix, class first); failure keeps the item with `SkillErrorMessage(err)` or "Không thể học kỹ năng". Pushes: `onSkillUpdate`, `onMWeaponSkillUpdate`, `onUpdateLearnedSkill`, passive -> stat refresh (`reward_callbacks.go:60-83`). Our port already has this (M9).

### 3.5 Type 506 "Yếu Quyết" (199)
These are pet skill-learning books (info "Dùng trong phần Luyện pet - Kỹ năng", description "Có xác suất học được kỹ năng ... "), `use_type 2`, **all `i1 = 0`**. `creBookEffectHandler` (`effect_cre_book.go:19-43`) reads `creatureID = I1` and calls `ContractPets` (summon a pet) -> with I1 = 0 it returns `ErrCannotUseItem` -> notice "Vật phẩm này hiện chưa sử dụng được.". Real use is the pet-skill panel (pet module), not `useItem`. Port: refuse from bag.

### 3.6 Types 507, 512, 513, 516, 520 and stubs
- 507 `petFuncHandler` (`effect_pet_func.go:24`): data has 28 templates (Tẩy Tủy Đan ...), all `use_type 4` -> never reached. (Handler would add `N1` or MaxLife to pet life, so our existing `petHook.restoreLife` for 507 is not legacy-observable.)
- 512/513 pet equip level/colour (`effect_pet_equip.go:19-60`): 1 + 4 templates, `use_type 4` -> unreachable. Pet equipment *instances* are routed by `isPetEquipmentItem` to `usePetEquipmentItem` (`use_pet_equip.go:24`): needs `targetType==2 && petId>0`, else note "Hãy dùng trang bị này cho pet"; errors "Cấp pet không đủ để mặc trang bị này", "Pet không thể mặc trang bị này"; pushes `onUpdatePet(petId,"equN",newItemId)`, `onMoveItem...`, `onRefreshPetProp`, `onPetEquipOn`.
- 516 formula books (144): `prepareBookUse` (`use_books.go:62-95`): `LearnRecipeSkillByFormulaName(tpl.Name)`; exists -> "Bạn đã học công thức này." (success, item kept); skill level too low -> "Cấp kỹ năng sống không đủ." (kept, rollback); success message "Đã học công thức." + `onUpdateLearnedSkill`. 66 names are "Bí Kíp Chế Tạo ..." -> Mat Bao recipes (`use_mys_books.go:47`, msg "Đã học công thức chế tạo X.", `pushMysMakeData`, notice `SkillLevelNotice`). The typed `formulaHandler` (`effect_formula.go:16`) only consumes with "Đã học công thức từ %s." after that.
- 520 `targetItemHandler`: 0 templates of type 520 -> irrelevant. (`itemToTarget` RPC is separate, `use.go:238`.)
- Stubs (`service.go:225-246`, `effect_stub.go:21-26`): 510, 511, 514, 517, 518, 519, 521-525, 527, 551, 552 all `ErrCannotUseItem` wrapped -> generic notice. 515 is overridden by the fishing tool handler (`service.go:247`). 526 is not registered (falls through to the fallbacks).

### 3.7 Type 515 fishing tools (15 templates) - `effect_fishing_tool.go:67`
- Contest baits 2982-2986 (lvl 1-5) -> buff `BaitBuffID(level)` = item id - 895 (2087-2091), 5 min; only on map 102 while contest open else `ErrFishContestOnly` "Chỉ dùng được trong Nơi Thi Câu Cá khi cuộc thi đang diễn ra."; clears other bait buffs (pushes `delBuff`), message "Đã dùng %s, có hiệu lực 5 phút." (`:104-128`). Lamp 2987 -> buff `BuffLamp` 3 min, requires `FishingNow` else "Chỉ dùng Đèn Thần khi đang câu cá trong Nơi Thi Câu Cá." (`:130-148`).
- Normal tools (`domain/fishtool/tools.go`): Bột Mì 2391 (buff 1679, -2 s), Tôm 2392 (1681, -4 s), Giun Đất 2393 (1680, -6 s +5%), Tôm Viên Dinh Dưỡng 2394 (1682, -8 s +5%), Dầu Mè 2398 (1683, -6 s), Lao Ném Cá 2397 (1673, +10%); 15 min each, reuse adds time; baits are mutually exclusive: stronger replaces weaker, weaker refused+kept "Đang có hiệu ứng mồi %s mạnh hơn, không thể dùng %s." (`effect_fishing_tool.go:151-189`). 2395, 2396, 2399 -> generic notice. Consumers: npc fishing loop (not ported).

### 3.8 petGrowHandler - `effect_pet_grow.go:55`
CanHandle: template id in `petGrowItemExp` = {961: 30000, 962: 150000, 964: 300000, 1139: 300000, 1173: 3000000, 1451: 100000000, 1585: 300000, 1586: 2000000, 1587: 6400000, 1836: 12500000, 3339: 100000000} exp. Gates: needs `uctx.PetID` else `ErrPetSkillItemNeedsPet` "Hãy chọn pet để sử dụng vật phẩm này!"; level gate is `pet.Level < tpl.ReqLevel` -> "Cấp pet chưa đủ để dùng vật phẩm này!"; owner level cap: pet cannot exceed `ownerLevel + 5` -> "Cấp pet không được cao hơn cấp nhân vật quá 5 cấp!" (checked before consume). Gain = min(amount, `ExpRoomForOwner`); level-up rolls pet skill growth; push `onUpdatePet` via `UpdatedPets`. Batch: `ApplyBatch` consumes `ceil(gain/amount)` units. Character level gate is skipped for these ids (`service.go:1147`).

### 3.9 Template-id handlers (registered `service.go:167-176`, checked before type handlers)
| Template ids | Handler | Effect, gates, consumed? |
|---|---|---|
| 995 Quy Nguyên Châu, 1475 Quy Nguyên Đơn (Tân Thủ) | `attrResetEffectHandler` `effect_attr_reset.go:26` | `ResetAttributePoints`: refund = sum of AptStrength+Agility+Stamina+Intelligence+Energy -> zero them, `AttrPoints += refund` (`domain/character/attr_reset.go:5-18`). 1475 only lv <= 39 else keep "Chỉ nhân vật cấp 1 - 39 có thể dùng."; refund 0 -> keep "Nhân vật chưa phân phối điểm thuộc tính nào."; else "Đã tẩy điểm thuộc tính, hoàn lại %d điểm." + stat refresh. |
| 1581 Luyện Thú Đơn (type 550, lv 30) | `catchPotionHandler` `effect_catch_potion.go:32` | buff 565 (prop 27 = +4 catch points) 30 min, adds remaining time. Also usable in battle round 1 (`battle_catch_potion.go`). Consumer: `application/combat/catch_bonus.go`. |
| 3984 Tinh Hồn Chi Thực (501, lv 1, use_type 1) | `petAptitudeFruitHandler` `effect_pet_aptitude_fruit.go:67` | +1 base aptitude on explicit pet else active pet (`GetActivePet`). Picks lowest of Lực/Xảo/Nhẫn/Trí/Thần still below cap = `round(template*1.2)`; tie -> lower index; start = max(stored, round(template)) if never refined. No pet -> "Hãy cho pet xuất chiến hoặc đi theo rồi dùng Tinh Hồn Chi Thực!" (kept); all maxed -> "Tư chất của pet đã đạt tối đa, không thể tăng thêm!" (kept). Message "Tư chất %s của %s tăng từ %d lên %d."; `RecalculateStats`; `UpdatedPets`. |
| 1361 Chìa Khóa Thần Bí (509) | `mysteryKeyHandler` `effect_mystery_key.go:34` | uniform 1 of [4, 125, 158, 261, 264, 267, 9, 10, 11, 12, 13, 14] x1, inherits bind; bag capacity checked first (`ErrInventoryFull`, key kept); "Đã mở Chìa Khóa Thần Bí." |
| 7254, 6636, 7255, 4803, 4804, 4805, 7256, 6492, 7258, 7259, 7260 | `mountDressBagHandler` `effect_mount_dress.go:67` | dress 6/7/8/9/10/11/19/20/21/22/23 for 30 days (+30 if held; permanent -> keep "Đã sở hữu vĩnh viễn thú cưỡi %s."). Needs reborn: else keep "Cần chuyển sinh để sở hữu thú cưỡi." Push `onUpdateDressList(1, dressId, expiryMs)`. |
| 2037, 2038, 2846, 2847 | `bloodBagItemHandler` `effect_blood_bag_items.go:66` | fill blood-bag pool (HP 2038 / MP 2037: +1,000,000; 2847/2846 +50,000), cap 10M; pet target fills pet pools (bag+2). Full -> keep. Push `onUPP{ep}`. **Already ported.** |
| 2797 Dược Thủy Sức Sống (lv 50) | `vigorPotionHandler` `effect_vigor_potion.go:53` | refill vigor (`CurrentSP`) to `VigorCap`; 2 per local day (feature state `vigor_potion {day, used}`); full -> keep "Sức lực đã đầy, không cần hồi phục."; limit -> keep "Hôm nay bạn đã dùng đủ 2 bình Dược Thủy Sức Sống."; pet target -> "Vật phẩm này chỉ dùng cho nhân vật."; push `onUPP{vigor,maxVigor}`. |
| 2021 (+100), 2074 (+25), 2077 (+50% max) | `actpointPotionHandler` `effect_actpoint_potion.go:51` | Magic-estate actpoint restore via `RestoreActpoint`; full -> keep "Năng Lượng đã đầy, không cần hồi phục."; push `onUPP{actpoint,maxActpoint}`. |
| `domainitem.LinhLungTemplateIDs()` (Huyết/Ma Linh Lung flasks + Linh Long Tinh/Túy refills 2255, 2260, 2537, 2538 ...) | `linhLungHandler` `effect_linh_lung.go:30` | flask: restore `min(cap=10000+N%*max, missing, pool)`, item kept, pool stored on item, re-push slot; empty pool -> keep "<name> đã cạn <label>, hãy dùng Linh Long để nạp thêm."; refill pours into a carried flask of the tier (needs one: "Cần có %s trong túi để dùng %s."; full "%s đã đầy.") and is consumed. |
| 2271/2272/2273 (100k/1M/10M), 1063/1132/2520 (1k/100k/1M) | `moneyChestHandler` | unbound -> bạc, bound -> ngân phiếu (moneyBind); consumed. |
| 642, 653, 849, 2693, 2790, 2791, 3436, 3840-3844, 5341 | `kimPhieuScrollHandler` | credit goldBind (100/500/500/888/5000/80000/300/88/188/288/588/1888/600). |
| 1402, 1403, 1404, 1701, 1704 | `transformCardHandler` `effect_transform_card.go:75` | 1 h PM transform + buff 2730 (`PMTransformBuffID`), `onSetRes`; 1402 reverts (else `ErrNoTransformToRevert` notice, kept). |
| 2977-2981 | `fishingCatchHandler` | transforms 2977/2978/2979 (1 h), 2980 Piranha exp = level*300, 2981 Shark moneyBind level*100 + bạc level*20. |
| `domainfishcontest.RewardBags` | `fishRewardBagHandler` | contest reward bags (event). |
| 3232-3238 | `vipStarBagHandler` | awards of VIP month bag (id - 3232 + `VIPMonthBagFirstID`); award rows. |
| 3988, 3551 | `halloweenBagHandler` | candy bag 3-5 Kẹo + maybe Xúp Bí Ngô; lantern 1 of 7 prizes; bound; capacity first; rare prize announced. |
| 2571, 3591, 3592, 6561, 6562 | `christmasItemHandler` | Christmas openers (event tuning from `game_tuning.christmas`). |

### 3.10 Type 550 point/talent/spirituality/merit/soul/rune/pet-skill items (through `questItemEffectHandler`, other report owns the chain; listed for completeness)
- Pet skill items (`effect_pet_skill_item.go:22-38`, 17 ids: 2793, 2544, 3401, 3623, 3898, 3899, 4191, 5234, 5938, 6133, 6500, 6584, 6695, 6707, 6708, 6717, 6799): need pet target (`ErrPetSkillItemNeedsPet`), learn one random unlearned handbook special skill; notices "Pet đã học đủ kỹ năng rồi!", "Pet không còn ô kỹ năng trống để học thêm!", "Vật phẩm này không dùng được cho pet này!"; message "Pet đã học được kỹ năng %s.".
- Point items (`effect_point_items.go:62-80`): 3815 elementPnt +10, 5343 yijieElement +10, 3816/5114/5275 medalExp +25/+125/+2000, 5215/5216 runeExp +500/+50, 6524/6525 Văn Chỉ +100/+800, 5994/5949 magiccystalpre +100/+5, 5993/5947 magiccystallimit +10/+200, 5948 magiccystalrec +20, 4839/4884/4857 soulExp +100/+1000/+15000, 4162 paPnt +5000. Message "Bạn nhận được %d %s."; push `onAddMoney` via `GrantedCurrencies` or `onUPP`.
- Talent (Anh Linh) items 4591/4592/4724/5307 -> pvePoint +500/+1500/+100/+3500; talent-stone bags; full bag -> "Túi Thiên Phú Thạch đã đầy, hãy sắp xếp lại túi!".
- Spirituality (Thần Tu) 2336 (+400000), 2992/2993/2994 (+20000/+50000/+100000), 2795/2796 (level x [500,1000], daily cap 3/5), 2480 (level x [1000,2000]), 5903 (30M-200M); push `onUPP` + `onInitViewProp`.
- Merit/nature: 4134 (+500 expRe, lv 120), 4155 (+100 expRe), both reborn-only (`ErrMeritNeedsRebirth` "Chỉ nhân vật đã chuyển sinh mới dùng được vật phẩm này!"); 4054 (+1000), 4838 (+50), 4885 (+500) npPnt.
- Soul bags 4669, 4671, 4685, 4686, 5875, 5876, 3963-3966 (`effect_soul_bag.go`), rune bags 5132-5207/5209/5210 (`effect_rune_bag.go`), full bag notices "Túi Mệnh Hồn đã đầy, hãy sắp xếp lại túi!" / "Túi Phù Văn đã đầy, hãy sắp xếp lại túi!"; pushes `onPutSoulToBag`.
- Daily caps (`daily_use_limit.go:30`): 2795 (3/day), 2796 (5/day), feature state `item_daily_use`.

### 3.11 Battle-only items
`ResolveBattleItemEffect` (`battle_item_effect.go:26-53`): food in `foodBuffs` with `field` true -> not usable in battle; else grants its buff (`FoodBuffID`); `use_type 4` unusable; consumable rule -> `combat.ItemEffect` (halved for 3829); `envField` items unusable; petLife/petLoyalty items "pet panel only". Client limits use_type 1 to round 1 and use_type 2 to later rounds. Luyện Thú Đơn 1581 in battle: `GrantCatchPotionBuff` (`battle_catch_potion.go:25-40`). Linh Lung in battle: `LinhLungBattleEffect` (heals `min(cap,pool)`, item kept).

## 4. State

Persisted: bag stack (`character_items`), buffs (legacy `player.character_buffs`: buff_id, type, expires, battles_left), character columns (`attr_points`, `apt_*`, `current_sp`/vigor, `bag_slot_num`, `bank_slot_num`, `pet_max_num`, `soul_exp`, `rebirth_exp`, currencies), `character_feature_states` (`vigor_potion`, `item_daily_use`, medal exp), pet rows (`life`, `exp`, aptitudes, loyalty, skills), item properties (linh lung pool). In-memory: none relevant (food battle counters are persisted `BattlesLeft`).
Restart story: all of the above survives; the timed-buff expiry is lazy.
Proposed Mongoose additions in our port: `CharacterBuff.battlesLeft` already exists (`server/src/modules/buff/buff.schema.ts:23`); `BuffService.grant` always writes `battlesLeft: 0` and overwrites `expiresAt` (no add-remaining semantics) - needs an options overload (see section 7).

## 5. Data tables

- `data_tbl_item_template`: `id, name, type, use_type, req_level, i1..i3, n1..n3, color, stack_max, description, info, skill_id`. `use_type`: 1 field/char use, 2 pet-target / later-round battle, 3 battle potion, 4 not usable from the bag. Type counts above. I1..I3 on food/potions = cooking recipe ids, never heal values. Sample: `{id:995, name:'Quy Nguyên Châu', type:501, use_type:1, req_level:1}`; `{id:6373, 'Bí Điển Thần Binh Cấp 2【Tốn Phí】', type:500, use_type:1, description:'Cần tiêu phí 1440 vàng để mở'}`.
- `data_tbl_buff` (read through `GameDataService.getBuff`): `id, name, type, code_name, buff, percent_flag, prop1..6, prop_num1..6`. Buff ids used: food (268-275, 287-294, 311-312, 327-330, 772-776, 883-887, 1041-1043, 1169-1173, 1231-1233, 1376-1381, 1691-1697, 1716, 1766-1768, 1870, 2263, 2339, 2705-2709, 2719, 2836-2838, 2854-2858, 3316, 3393-3397, 1404, 2709), encounter 313/314/1203/1365, exp 281/762/764/1538, catch 565, wedding 1183-1186, transform 2730, fish tools 1673/1679-1683, bait 2087-2092.
- `data_tbl_item_award`: `item_id, award_id, type, count, rate, payload` (type 33 = title; payload `{costGold}`), 354 title-award item ids.
- Id collisions: item template and equipment template share ids (41, 42, 128, 1063, 2137) - hooks must skip equipment instances (`use_template_hooks.go:3-9`); buff ids vs item ids are different tables.

## 6. Push sequence (non-equipment path, `use.go:150-198`)

1. (errors first) level -> `onSystemMidMsgOrNote "Cấp độ không đủ!"` and `return nil`; known notice errors -> `onSystemMidMsgOrNote <msg>` and `return nil`; others -> RPC error.
2. (equip path: `onMoveItem`/equip pushes, not in scope).
3. gift box -> opens dialog; return.
4. `onUPP {money,currentHp,currentMp}` when `hp_healed`/`mp_restored` present.
5. slot: `onDelCharactorSlot(itemId, oldSid)` when stack <= 0, else `onAddCharactorSlot(item)`. Then item-loss notice for consumed count.
6. `sendEffectCallbacks`: `onMidNote <message>`; `onAddCharactorSlot` for granted items + gain notice; `onAddFairy`; `onAddPet`; `onUpdatePet` for `UpdatedPets`; temp bag offer; `onPutSoulToBag`; `onUpdateDressList(1, id, expiry)`.
7. `sendStructuredRewardCallbacks`: titles, `upLongBuff` per granted buff, `delBuff` per removed buff, `onSetRes`, currency `onAddMoney`, skills (`onSkillUpdate`, `onMWeaponSkillUpdate`, `onUpdateLearnedSkill`), medals, monster hearts, then stat refresh `onUPP` (when `RefreshCharacterView`/title/passive), `onInitViewProp`, then `extra_upp` `onUPP`.
8. Return `{success:true, itemId, effects:[]}`.
Keep-item results (`ConsumeItem=false`) still go through steps 5-7: slot re-push shows unchanged stack and `onMidNote` carries the message (note: kept-item refusals are `onMidNote`, not `onSystemMidMsgOrNote`).

## 7. Our port: status and plug-in points

Existing (`server/src/modules/inventory/use-item.service.ts`): dispatch is a flat `useConsumable` (`:143`) with `useHooks` (template-claimed, run before level gate), blood-bag refill, skill book 505, `orderHook` (loop boss), `planPageBook` (324/325), use_type 2/4 refusal ("Vật phẩm này bạn không dùng được!"), then `healAmount(tpl)` (HP/MP flat tables for 501; **food 502 reads `i1/i2` as heal** - the exact legacy bug fixed 2026-10-26, `potion.ts:21-33`). `usePet` (`:84`) = pet-target path: blood bag and type 507 life restore only. Hooks registered by: `title-medal.service.ts:34` (550 title medals), `secret-passage.service.ts:31` (128/2137 Mat Dao), `loop-boss.service.ts:48` (order hook), `pet.service.ts:58` (pet hook). No `addUseHook` for anything else. `BuffService` (`buff.service.ts:39`) has `grant(characterId, buffId, seconds)` only (overwrites expiry, `battlesLeft` forced 0); stats already include active buffs (`stats/core-providers.ts:45-52`); no consumers of exp-rate (props 24/25), encounter buffs (313/314/1203/1365), catch bonus (27 / buff 565) or battle-count decrement in combat (grep of `server/src/modules/combat` finds none).

| Handler | Templates | Our status | Plug in at |
|---|---|---|---|
| 500 expand 324/325 | 2 | DONE (`bag-pages.ts`) | - |
| 500 expand 326 pet slot | 1 | MISSING (only `petOpenSlot` gold RPC, `pet-slot.service.ts`) | extend `planPageBook`/new hook; `PetSlotService`, `PetLimits.defaultSlots`, cap 120 |
| 500 encounter books | 9 | MISSING; consumer missing too | `BuffService.grant` (needs add-remaining) + `EncounterService` (`combat/encounter.service.ts`) must read buffs 313/314/1203/1365 |
| 500 exp books | 9 | MISSING; consumer missing | `BuffService` + `combat/rewards.ts` exp rate (props 24/25) |
| 500 other (no-op/hồi phù) | ~165 | n/a (teleport scrolls live in `transport` module); Bí Điển 132 not handled | `UseItemService` default branch: keep + notice |
| 501 HP/MP potions | ~20 | DONE (`potion.ts`) | - |
| 501 rule potions (%, per level, hp<->mp, SP, revive) | ~30 | MISSING | new `consumable-rules.ts` + `UseItemService`; stats via `CharacterStatsService.healCapped` |
| 501 pet target (heal/loyalty/life 425-427, 1533/1534) | ~8 | MISSING (`usePet` only 507/blood bag) | `PetItemHook` extension in `PetService` |
| 501 pet grow 961.. | 11 | MISSING | `PetGrowthService` (`pet/pet-growth.service.ts`) via `usePet` |
| 502 buff foods | 84 + 4 candies | MISSING (port heals via I1/I2: wrong) | new `food-buffs.ts` table + `BuffService` (needs `battles` + add-remaining) |
| 502 refused 51 | 51 | PARTIAL (port's i1/i2 path misbehaves) | keep + "Vật phẩm này chưa có hiệu quả sử dụng." |
| 503/504 | 74 | PARTIAL: refused by use_type 4 line (message differs: "không dùng được!") | keep |
| 505 skill books | 197 | DONE (`SkillLearnService`) | life-skill books 2400, 2408-2411 not verified |
| 506 Yếu Quyết | 199 | PARTIAL: refused (use_type 2) - matches Go outcome | pet-skill panel (`pet-skill.service.ts`) |
| 507, 512, 513, stubs | ~120 | refused by use_type 4 (OK); but `usePet` still implements 507 life restore - not legacy-reachable | remove or leave harmless |
| 515 fishing tools | 15 | MISSING (no fishing loop) | `BuffService`; defer with fishing |
| 516 formula / Bat Bao recipes | 144 | MISSING | `SkillLearnService`/`forge` recipe learn; hook |
| 520 | 0 | n/a | - |
| Attr reset 995/1475 | 2 | MISSING | `CharacterStatsService`: zero `apt*`, `attrPoints += sum` (`character.schema.ts:70-80`) |
| Catch potion 1581 | 1 | MISSING; consumer missing | `BuffService` + `pet-catch.service.ts` |
| Aptitude fruit 3984 | 1 | MISSING | `PetGrowthService` / aptitude fields on `pet.schema.ts` |
| Mystery key 1361 | 1 | MISSING | hook + `InventoryService.addItem` |
| Mount dress bags | 11 | MISSING | `MountService` (`mount.service.ts` has `ownedDresses`) |
| Vigor 2797, actpoint 2021/2074/2077 | 4 | MISSING | `character` (vigor), magic estate not located (unverified) |
| Linh lung | ~8 | MISSING | item `properties` on `character-item.schema.ts` |
| Transform cards, fishing catches | 10 | MISSING | `PM` transform in `vip/pm.service.ts` |
| Money chests, kim phiếu | 19 | MISSING | `CurrencyService.credit` (`progression/currency.service.ts:27`) |
| Point items, spirituality, merit, talent, soul/rune bags | ~60 | MISSING (other report scope) | `CurrencyService`, `progression`, `pet-soul`, `pet-stone` |
| Halloween, Christmas, VIP star, fish rewards | ~12 | MISSING (events) | defer |
| Battle items | - | PARTIAL: potions only (`consumeForBattle`) | battle-item path: food buffs, rule effects |

### Pseudocode (TypeScript-ready)

```ts
// server/src/modules/inventory/item-effects.ts : registry keyed by template id / type, evaluated in legacy order.
interface EffectResult { consume: boolean; message?: string; pushes: Push[] }
const keep = (msg: string): EffectResult => ({ consume: false, message: msg, pushes: [] });

function dispatch(tpl, ctx): Promise<EffectResult> {
  if (tpl.id === 719) return ok();
  if (Number(tpl.use_type) === 4) return refuse('Vật phẩm này hiện chưa sử dụng được.');   // service.go:1224
  if (PET_GROW[tpl.id]) return petGrow(tpl, ctx);
  const byId = TEMPLATE_HANDLERS.get(tpl.id); if (byId) return byId(tpl, ctx);
  const byType = TYPE_HANDLERS.get(Number(tpl.type)); if (byType) return byType(tpl, ctx);
  return fallbacks(tpl, ctx);
}

// food/buff (502): timed adds remaining time, battle-count adds remaining battles
async function grantFood(cid: number, tid: number) {
  const fb = FOOD_BUFFS[tid];
  const active = (await buffs.listActive(cid)).find((b) => b.buffId === fb.buffId);
  if (fb.battles) return buffs.grantBattles(cid, fb.buffId, fb.battles + (active?.battlesLeft ?? 0));
  const left = active?.expiresAt ? Math.max(0, Math.ceil((active.expiresAt.getTime() - Date.now()) / 1000)) : 0;
  return buffs.grant(cid, fb.buffId, fb.seconds + left);
}
// push order: slot push, upLongBuff, onMidNote "Đã sử dụng X.", stat refresh onUPP

// exp book guard
function strongerExpBuff(active, book): string | null { /* props 24/25, percent_flag==1, value>=100; char>=book.char && pet>=book.pet */ }

// attr reset 995 / 1475
const refund = apt.str + apt.agi + apt.sta + apt.int + apt.eng;
if (tid === 1475 && level > 39) return keep('Chỉ nhân vật cấp 1 - 39 có thể dùng.');
if (refund <= 0) return keep('Nhân vật chưa phân phối điểm thuộc tính nào.');
// chars.updateOne: set apt*=0, $inc attrPoints += refund; then stats recompute + onUPP
```

Where code should live: `server/src/modules/inventory/item-effects/*.ts` (pure tables + rules, `*.test.ts`), one `UseItemService` extension point `addTemplateHandler(ids, fn)` / `addTypeHandler(type, fn)` replacing the flat `useConsumable` chain; the feature modules (buff, pet, character, mount) register their handlers in `onModuleInit` like `TitleMedalService.onModuleInit`. Gamedata: `GameDataService.getBuff`, `template(29, id)`; add `foodBuffFor(tid)` tables in shared or inventory (static, from Go `food_buff_table.go`). Shared types: add `LongBuff` already exists; no new wire types except `onUPP` fields.

`BuffService` changes needed: `grant(cid, buffId, seconds, opts?: { battles?: number; addRemaining?: boolean })`, `consumeBattleCharges(cid)` called from `battle-end.service.ts`.

Recommended porting order by player impact:
1. Fix the 502 food path (stop healing by I1/I2); add `foodBuffs` + buff service extension (84 foods, most used consumables) and keep-notice for the 51 unsupported ones.
2. Rule potions (percent / per-level / revive-in-battle later) and pet-target potions (loyalty 425-427, life 1533/1534, pet grow 11 ids), since pet progression is the main sink.
3. Exp books + their rate consumer in `combat/rewards.ts`; encounter books + consumer in `EncounterService`.
4. Quy Nguyên Châu 995/1475, Tinh Hồn Chi Thực 3984, Luyện Thú Đơn 1581, pet slot book 326.
5. Formula/recipe books 516 (144), life-skill books, Bí Điển (132, pending decision).
6. Vigor/actpoint potions, mount dress bags, Linh Lung, money chests, kim phiếu, point items, merit/spirituality.
7. Transform cards, fishing tools/catches, event items (Halloween/Christmas/VIP star).

## 8. Unverified / open questions

- `appbuff.ConsumeBattleCharges` implementation and who calls it were not read (comment only, `food_buff_table.go:9`).
- Whether the 11 "Hồi Phù" type-500 scrolls (286, 712, 713, 717, 999 ...) are used via `useTransport*`/client-side RPC and never reach `useItem` effect (transport module exists in our port; Go side not traced).
- Paid Bí Điển (132 templates, 66 with `costGold` award rows): scroll handler never routes them to the award handler. Go gap or other path? Not found by grep (`Bí Điển` has no Go reference outside tests/docs).
- 517 Túi Tạm / 518 wing items go through other RPCs (`tempbag`, `wing_*`); only the stub refusal was verified.
- Magic-estate actpoint service in our repo (needed for 2021/2074/2077) was not located.
- Item `properties` storage for Linh Lung pool in our `character-item.schema.ts` not checked.
- `docs/memory/item-inventory.md` claims about page books 324/325 being no-ops are stale relative to `effect_expand_book.go` (they work in Go).
