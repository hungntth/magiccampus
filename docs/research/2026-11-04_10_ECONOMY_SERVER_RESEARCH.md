# M5 Economy - legacy server research

Date: 2026-11-04. Scope: bank/bag pages/temp & quest bags, repair, shops (NPC/mall/VIP/credit/exchange), crafting (equipment,
mix, life skills), equipment upgrades (star, holes, jewels, soul/bind/element/prefix, tier, resolve, maker), runes, misc cards.
Legacy root `D:\mcgame`; paths below are relative to `internal/` unless stated. Client refs are `docs/client/...` (decompiled AS).
Marks: **[data]** backed by a seed table or a client constant, **[go]** Go-invented (no data/client backing), **[stub]** mock/no-op,
**[unverified]**.

## 1. Summary

The economy surface is large but uneven in the Go server. What is really implemented and what is a mock:

| Area | Go status |
|---|---|
| NPC shop buy (`buyAmountItemClient`/`buyItemClient`), mall buy (`buySystemItemClient`/`Multi`), VIP shop, `changeMoneyType` | real |
| `sellItem`, `exchangeItem`, `updateLimit`, `getShopAwardStr`, `getShopConfig`/`getLimitShopConfig`/`getRemainShopConfig`, `shopClosePanel` | **stub/mock** (hard-coded values) |
| Credit/limited/guild/event shops (TBL_CREDIT, shop type 2, `amount` stock, `st=3` limit) | **no server logic** (data only) |
| Repair (`repair`, `repairAll`) | real code but durability never decreases anywhere, cost is [go] |
| Bank: NPC open + password, `moveItemToPage`/`moveItem` to bank sids, `closeBank` (no-op) | partial; `bankSort` unregistered |
| Bag/bank page opening (items 324/325 "expansion books") | **not implemented** (type-500 scroll no-op); only admin HTTP sets `bagSlotNum` |
| Temp bag (`getTBag`, `openTempSlot`, ...) | real but quirky |
| Equipment craft `newMake`/`getMakeColor`, material mix, jewel upgrade | real |
| `newCook`/`newMedicine` | real (deterministic, skill-gated) |
| star/hole/jewel/soul/bind/element/prefix/tier/resolve/maker | real |
| Runes | real, but built on the deco (dress) feature; chips source unknown |
| `onGetMakeLimitTimes` | belongs to Mystery Treasure, **not** equipment craft |
| `MysteryExchangeItem/Score` | secured but yield is a placeholder (1 crystal per unit) |
| `changeNameByCard`, `useTransport*` | real |

Key corrections to legacy memory docs: repairAll that is live is the **shop** one (shadows item's); transport gold cost is 3/5 gold
(not 1000/5000); holeDig charges 2000 silver per selected money type (not gold); star rates are off by one versus the client table.

## 2. Entry points (RPC -> handler -> service)

Dispatcher registration is last-write-wins (`infrastructure/rtmp/dispatcher.go:208-212`). Order in `cmd/gameserver/main.go`:
item 462, npc 552, shop 594, rune 601, mysteryTreasure 649, mysteryExchange 654, exchange 804, stub 807. Craft handler is
never registered (`handlers/craft/get_make_limit_times.go:1-10` says superseded by mysterytreasure).
Collisions: `repairAll` item (`handlers/item/handler.go:188`, dead) vs shop (`handlers/shop/handler.go:55`, **live**);
`shopClosePanel` shop (`shop/handler.go:56`) then stub (`stub/handler.go:32`) - both return nil.

Handlers in `presentation/rtmp/handlers/`:

| RPC | Handler | Service |
|---|---|---|
| `getInitSlot` | `item/equip.go:40` (returns ALL items of all slot types keyed by item id) | `item.GetAllItems` |
| `moveItem`, `addtItemFromBag`, `addmxFromBag` | `item/bag.go:17` | `item/service.go:758 MoveItem`, `:860 validateMove` |
| `moveItemNum` | `item/bag.go:132` | `service.go:902 MoveItemPartial` |
| `moveItemToPage(sid, pageType, tab)` | `item/bag.go:226-344` | `MoveItem` |
| `closeBank` | `item/misc.go:216` (no-op) | - |
| NPC bank open: `npcFuncClick(npcId, md5pass)` | `npc/npc_click.go:65-86` | `rtmputils.VerifySecondaryPassword` |
| `getTBag`/`openTempSlot`/`openmxTempSlot`/`oneKeyOpenAllMXTemp`/`tempBagSort`/`mxBagSort` | `item/tempbag.go:70/96/159/225/16/43` | `BuildTBagPayload` (`application/item/tempbag_login.go:14`) |
| `repair(itemId,type)` | `item/misc.go:16` | `service.go:1636 RepairItem` |
| `repairAll(type)` (live) | `shop/purchase.go:148` | `shop/service.go:454 RepairItems` -> `item.RepairAll` `service.go:1682` |
| `buyAmountItemClient`/`buyItemClient` | `shop/purchase.go:15/46` | `shop/service.go:76 BuyItem` |
| `buySystemItemClient` / `buySystemItemMulti` | `shop/purchase.go:77/185` | `shop/service.go:275 / 535` |
| `sellItem` | `shop/purchase.go:108` | `shop/service.go:436` **mock** |
| `exchangeItem` | `shop/purchase.go:127` | `shop/service.go:443` **mock** |
| `changeMoneyType(1..4)` | `shop/purchase.go:165` | `shop/service.go:503` |
| `unlockMoney(md5)` | `shop/misc.go:19` | `VerifySecondaryPassword` |
| `openShopDirect`, `updateLimit`, `getShopAwardStr` | `shop/misc.go:69/45/57` | mocks |
| `getVipShopConfig`, `getVipShopCharConfig`, `buyVipShopItem` | `shop/vip.go:147/166/224` | `application/shop/vip.go:42/75/145` |
| `newMake`, `getMakeColor` | `item/craft.go:732`, `:948` | inline in handler |
| `materialMixOne/All` | `item/mix.go:17/163` | inline |
| `newCook`/`newMedicine` | `item/life_skill.go:56/60` | `application/skill/life_skill.go:116 CanCraftRecipe` |
| `starOne/starAll/getStarNum` | `item/star.go:59/154/36` | inline |
| `getHoleNum/holeDig` | `item/hole.go:15/47` | `application/item/hole.go` |
| `getJewelData/jewelSet/jewelDel` | `item/gem.go:20/43/144` | `application/item/hole.go:159-237` |
| `jewelUpdateOne/All` | `item/jewel.go:18/165` | inline |
| `changeSoul/sureChangeSoul` | `item/change_soul.go:108/277` | pending map in handler |
| `changeBind/sureChangeBind` | `item/change_bind.go:63/173` | pending map |
| `changeElement/sureChangeElement` | `item/change_element.go:63/163` | pending map |
| `changePrefix/sureChangePrefix` | `item/change_prefix.go:401/466` | pending map |
| `changeLevel` | `item/change_level.go:137` | inline |
| `equResolve(equId, md5)` | `item/resolve.go:18` | inline |
| `changeName(equId, matRef, tempFlag)` | `item/maker.go:16` | `application/item/maker.go:116` |
| `bindItem` | `item/bag_manage.go:133` | `service.go:2104` |
| `getRuneBagData, exchangeRune, runeMove, arrangeRuneBag, runeSet, runeRemove, runeUpLvl, runeResolve` | `rune/handler.go:26-33`, `actions.go`, `rune_socket.go` | `application/rune/*` |
| `MysteryExchangeItem/Score` | `mysteryexchange/handler.go:74-75`, `exchange.go` | placeholder yield |
| `gp` | `exchange/handler.go:28` (account gold -> `onGetAwardPoint`) | - |
| `changeNameByCard`, `useRedBag`, `useTransport*` | `item/special.go:23/190`, `item/transport.go:51-102` | - |
| `onGetMakeLimitTimes`, `addLimitMakeTimes` | `mysterytreasure/handler.go:73-75` | Mystery Treasure feature (not equipment) |

Confirmed unregistered in Go (grep of all `"name"` registrations): `bankSort`, `repairPetEqu`, `repairPetEquAll`, `petEquLevelUp`,
`petEquModBind/Color/Pre`, `sublimePetEquip`, `restrainPetEquip`, `magicWeaponAutoRepair`, `pmJewelExchage`(unchecked) -> ignore.

## 3. Rules

### 3.1 Slot types, sids, pages, bank, temp bag, quest bag

R1. Slot types: 0 bag, 1 equipped, 2 bank, 3 temp bag, 4 quest bag, 5 pet item bag, 6 pet equipped (`domain/item/item.go:24-30`).
Item types: 1 consumable, 2 equipment, 3 material, 4 quest (`item.go:15-18`); only types 1 and 3 stack; stacking also needs same
template, bound flag, **slot type** and colour (`item.go:115-124`) - so bag and bank rows never merge.

R2. sid <-> (slotType, slotIndex) (`item.go:263-331`; client `GamePredef.as:1164-1179`, `DataManager.as:208`):

| Area | sid range | slotIndex | Notes |
|---|---|---|---|
| equip | 1..22 | sid-1 | position-based (H5 already) |
| bank | 301..450 | sid-301 | 5 pages x 30 |
| temp bag | 80..99 | sid-80 | "normal" temp; Go also treats slotIndex<145 as normal and >=145 as MX |
| MX temp | 100..299 | sid (index == sid!) | Go quirk |
| pet equip | 1001..1200 | sid-1001 | |
| bag | 2101..2310 | sid-2101 | 7 pages x 30 |
| quest bag | 2311..2340 | sid-2311 | 1 page, always visible |
| pet item bag | 2341..2370 | sid-2341 | 1 page |
| fallback | >=2800 -> bag idx sid-2800; anything else -> bag idx sid | | |

Client page tabs: `moveItemToPage(srcSid, PAGE_TYPE_BAG=1|BANK=2, tab)`; bag tabs 1..9 (7 normal + quest(8) + pet(9)), bank tabs 1..5.

R3. Capacity: character `bag_slot_num` (default 1, max 7 = `MaxBagTabs`) and `bank_slot_num` (default 1, max 5) pages of 30
(`character.go:102-105`, `:472-476`, `:1519-1533`, `application/character/service.go:74-75`). `getMaxSlots`: bag = bagSlotNum*30,
bank = bankSlotNum*30, temp 30, quest 30, pet-item 30 (`application/item/service.go:305-326`). Adds always go to bag slotType 0, first
empty index below capacity, stacking onto existing same template/bound/colour first (`service.go:1843+`); **nothing auto-routes to
quest bag, pet bag or bank**.

R4. `moveItemToPage(srcSid, pageType, tab)` (`item/bag.go:226-344`):
- source resolved by sid via `ParseSID` (any slot type, equipped too - no restriction); missing -> error response `ItemNotFound`.
- pageType 1: tab 1..7 -> bag slotType 0, range `[(tab-1)*30, +30)`; refused with `onMidNote("Trang túi chưa mở.")` when `tab > clamp(bagSlotNum,1,7)`.
  tab 8 -> quest bag: only quest items (`itemType==4`, source already in quest bag, or template type 508/509/550) else
  `onMidNote("Chỉ vật phẩm nhiệm vụ mới đặt được ở đây.")`. tab 9 -> pet bag: only equipment template kind 9, or item template type
  507/508/512/513/550, else `onMidNote("Chỉ vật phẩm thú cưng mới đặt được ở đây.")`. Tabs 1-7 accept anything.
- pageType 2: tab 1..5, refused with `onMidNote("Trang ngân hàng chưa mở.")` when `tab > clamp(bankSlotNum,1,5)`; target slotType 2.
- bad page/tab -> `ErrInvalidArgs`. Target = first empty index in the page; none -> `onMidNote("Trang đã đầy.")` (reply nil).
- same row already there -> `{success:true}` with no pushes. Otherwise move row, push `onDelCharactorSlot(itemId, srcSid)` then
  `onAddCharactorSlot(dto with new sid)`; reply `{success:true}`.
- **No stack merge** in this path (just first empty).

R5. `moveItem(fromSid, toSid)` (`bag.go:17-130`): does not require an open bank, does not check bank/page capacity, no NPC proximity.
Merge if `CanStack` and `existing.stack + src.stack <= template.stack_max` else `ErrCannotStack` error response (`service.go:758-857`);
otherwise swap; destination temp bag validates (R9). Pushes: merge -> `onAddCharactorSlot(dest dto, sid=toSid)` + `onStackItemInto(from,to,srcId,destId,total)`;
swap -> `onSwapItem(from,to)`; plain move -> `onMoveItem(from,to,itemId)` (+ `onEquipOn()` when either side is equipped).
H5's existing `moveItem` already mirrors this for bag sids; M5 only has to extend sid parsing (R2) and the bank/quest/pet ranges.

R6. **Bank access** (`npc/npc_click.go:65-86`): NPC type 7 (`domain/creature/npc.go:15`; 6 NPCs in data: ids 1636, 375, 410, 517, 247,
506, all `shop_id` 0/null). `npcFuncClick(npcId, md5pass)`: `shop_id>0` is handled first (opens shop). Bank: empty pass ->
`onNpcMsg(npcId, "Vui lòng nhập mật khẩu rương!")`; wrong -> `onNpcMsg(npcId, "Mật khẩu rương không đúng!")`; ok -> push
`setClientDP(passHash)` then `initViewBankPanel()` (no args). Pass check = account secondary password md5
(`rtmputils/secondary_password.go:20-40`; default md5 `e10adc3949ba59abbe56e057f20f883e` = "123456", `domain/auth/account.go:18`). `closeBank` = no-op.
Bank items travel in `getInitSlot` (slotType 2). `bankSort` is called by the client (`BankPanel.as:2784`) but not registered. [stub]

R7. **Page opening** [data + gap]: client opens `ConsumPanel` for template **324 "Sách Mở Rộng Kho"** (bank page, gold 248, desc
"max 5") from `BankPanel.as:1834-1850` when no free bank slot and `bankSlotNum<5`; **325 "Sách Mở Rộng Túi Đồ"** (bag page, gold 248,
desc "max 6 pages" -> 1+6 = 7 = `MaxBagTabs`); 326/2092 pet bag books (pet slots). Shop slots: 2064 (324), 2063 (325), 2092 (326), all
sid 35 (mall tab), `gold` 248/248/20. Purchase goes `buySystemItemClient(slotId, n)` then client "buyAndUse" -> `useItem`. In Go both are
`type 500` -> `scrollEffectHandler` (`application/item/effect_scroll.go`) = **message only, item NOT consumed, no page added**. Nothing
else sets `bagSlotNum/bankSlotNum` except admin HTTP (`infrastructure/adminhttp/player_action_economy.go:115-140`). Item 1201 "Túi Mở
Rộng Tổng Hợp" (type 550) is documented as 1 bank + 1 bag + 6 pet books (award table, unverified). Proposed H5 rule (derived from
descriptions): using 325 -> `bagSlotNum = min(7, +1)`, 324 -> `bankSlotNum = min(5, +1)`, consume 1; push `onUPP{bagSlotNum|bankSlotNum}`
(Go already uses these keys: `login_payload.go:275-276`, `tempbag.go:152`). Price 248 gold per page, flat (not scaled by page index).

R8. Quest/pet bags: same 30-slot page; items only get there through `moveItemToPage` tab 8/9 (R4). `bagSort` in Go sorts bag only
(`bag_manage.go:78`, H5 done). `isQuestItem`/`isPetItem` at `bag.go:356-397`.

R9. **Temp bag** (`item/tempbag.go`, `tempbag_login.go:14-63`): moving into slotType 3 is allowed only for item templates with
`kind==6` (material) or `kind==14` (feather) or `type==503` (jewel) or `type==552`, normal temp index < 100; MX temp (index >= 100)
only "Ma Tâm" items (template id 5375-5697 or 5770-5841 or type 506), `service.go:860-900`. Else `onMidNote` (normal: "Chỉ cần đặt vật phẩm nguyên liện( Bảo Thạch, Lông Vũ, Nguyên Liệu Chế Tạo, Nguyên Liệu Kỹ Năng Sống)." / MX: "Chỉ có thể đặt Ma Tâm."), reply nil.
Moves push `onMoveToTBag(fromSid, idx-30, dto, normalCount)` or `onMoveMXToTBag(fromSid, idx-145, dto, mxCount)` (+ `onAddCharactorSlot`
of the swapped-out item); the index arithmetic is inconsistent with `ParseSID` (temp sids 80..99 give idx 0..19, then `-30`) -> **temp bag
is unreliable, port last or skip**. Opening extra temp slots: cost array `[10,50,100,200,500]` gold, max 5 each (`tempbag.go:107/170/236`),
charged from `Gold` only (not `SelectedGoldType`), pushes `onUPP{gold, bankSlotNum:1 (sic)}` + `updateTempBags`. Capacity array per step
`[6,6,12,12,12]`; MX base 12. Crafting RPCs accept `tempBagFlag` (idx = temp slot instead of item id).

### 3.2 Repair

R10. `repairCost = (maxDurability - durability) * 10` per item, 0 if undamaged or durability null (`service.go:1623-1634`) [go: no data
or client formula; `equipt_template.repairable` (1858 of 1872 = 1) is ignored]. `repair(itemId, type)` (`misc.go:16`): any item owned
by the char (bag or equipped; `type` 1 = anywhere/NOWEAR via Slot.as:751, 2 = NPC shop via Slot.as:785 - ignored by Go); not enough
`Money` -> error. Charged from **`Money` (unbound silver) only**, ignoring `selectedMoneyType`/bind. Push `onUPP{money}`; reply
`{success,cost,money}`.
R11. `repairAll(type)` live = shop version (`purchase.go:148`): type default 2; repairs **only equipped slots** (`FindEquipped`), sums cost,
needs `Money >= total` else error, then repairs all, pushes `onUPP{money}`, reply nil. Client: shop panel `repairAll(2)` after Alert
(`ShopPanel.as:1217-1221`), portrait Ctrl+click `repairAll(1)` (`PortraitCanvas.as:604`, blocked on maze maps 2007-2009 client-side).
R12. `ReduceDurability` (`item.go:149`) has **no caller** in Go; combat never wears gear [confirmed negative]. Repair only matters if H5
adds wear. Pet equipment repair RPCs are unregistered.

### 3.3 Shops

R13. Shop data: `data_tbl_shop` (121 rows; `type` 1 = normal NPC/mall 83, 2 = exchange/event 38), `data_tbl_shop_slot` (2543 rows). Slot
columns: `sid` = shop id, `type` 29 item / 19 equipment, `item_id`, `gold`, `money`, `point`, `p_type1/p_num1`, `p_type2/p_num2`
(special currency), `gt` (1 = unbound currency required), `quality` (0..), `amount` (stock; -1 unlimited 2214 rows), `st` (0 normal,
1 hot, 2 discount, 3 limit, 4 new, 5 hidden, -1; `GamePredef.as:1529-1533`), `position`, `r`, `sale` (always 0), `price_all`.
Mall tabs are shops named 商城* resolved by the client (ids 35 scroll, 36 gem, 41 food, 65 treasure, 66 material, 67 pet, 70 points,
81 book, 88 dress, 89 flyer); 99 钻石商店 = VIP shop, 109 金子商店. Exchange/event shops are type 2 (ids 11,13-16,71,72,83,85,90-93,98,101,
103,105-108,111-116,119,121,122,125-128,131-135).
R14. `buyAmountItemClient(slotId, amount)` / `buyItemClient` (`shop/service.go:76-273`): slot via `resolveSystemShopSlot` (`resolve.go:11-41`:
shop slot id, else treat the number as item template id, else equipment template id) - **no check the shop is on the player's map /
NPC**; template = equipment if `slot.type==19` else item; price: if slot gold and money both 0 and item template exists use template
`gold`/`price`; priority **PType1 special currency** (`DeductCurrency(p_type1, p_num1*amount)`) > gold > money > error "item has no
price defined"; gold: `gt==1` -> currency 4 (Gold) else `selectedGoldType` in {3,4} else 3; money: `gt==1` -> 2 (Money) else
`selectedMoneyType` in {1,2} else 1; `PType2` second special cost deducted too; stock `amount` **not enforced**, amount upper bound not
checked in Go (H5 uses 1..99999). Colour = `ceil(slot.quality/5)`; `binded = currency in {1,3}`; item type consumable unless
template kind==1 (item) / equipment slot. Order: deduct on in-memory char -> add item -> `charRepo.Update` (no compensation).
Special-currency names/keys: `shop/config.go:12-102`; currency ids `domain/character/character.go:21-90`
(1 battle/arena pt, 2 dog medal, 3 achilles medal, 7 group-pvp medal, 10-18 festival points, 19 pet arena, 20/21 guild contrib,
22 xmas, 25 national day, 26 pet chip, 29-31 events, 49 anniversary, 60 showtime, 61 shop gold, 62, 64 MC beans, 65 pet arena act, 73-75
magic crystal, 200/201 pet guard, 213-230 misc) - H5 has none of these balances.
R15. Pushes on success (`purchase.go:15-44`): `onBlueMsg("Mua thành công x{n}! Mất {cost} {currencyName}.")`, `onUPP{moneyKey: newBalance}`
(key per `getCurrencyKey`: 1 moneyBind, 2 money, 3 goldBind, 4 gold, 20 guildContrib, 61 shopGold, 64 mcbeans, 0 honor, default money),
`onAddItem{i,q,s:"",c,t(29|19),n,tt(kind)}`, `onAddCharactorSlot` per changed bag row; reply `true` (`buyItemClient`: reordered, reply nil).
Failure: `onRedMsg("Mua thất bại: <err>")`, reply nil (not an RPC error). Quest hook `PushQuestProgress`.
R16. `buySystemItemClient(slotOrItemId, amount)` (mall, `service.go:275-434`): treats `slot.type==29` as item else equipment (**inverse test vs
R14**); only Gold or Points: `slot.point>0` -> pay `Honor` (cost `point*amount`, currencyType 0, key `honor`); else `gt==1` -> Gold(4)
else `selectedGoldType` (3/4, default 3) with price **`slot.gold`** (no template fallback); bound iff paid with GoldBind (3).
`buySystemItemMulti` (`:535-723`, handler `purchase.go:185-255`): arg dict `{slotId: amount}` or list of `{shopSlotId,amount}` /
`{id,count}` / pairs; all-or-nothing balance check; gold type from `selectedGoldType`; **ignores `gt`**; reply `{success, items[]}` and
pushes `onAddItem` per item, `onAddCharactorSlot` per DTO, one `onUPP{key:balance}`; error -> `{success:false, items:[]}`.
R17. `changeMoneyType(t)` (`service.go:503-529`): 1,2 set `selectedMoneyType`, 3,4 set `selectedGoldType`; else error. Reply `{flag:true,num:t}`.
Client mall radios send only 3 or 4 (`SystemShopPanel.as:2084-2097`), then `setDefaultGold(1|2)`. Defaults 1 and 3. No pushes.
R18. `sellItem(itemId[, md5pass])` is a **mock** returning money 1234567 (`service.go:436-441`, handler pushes `onUPP{money}` and returns true;
no item removal, no credit). Client contract: unit sell price shown = `int(template.price/4)` (`TipItem.as:723`, `TipEquip.as:2852`);
items with `color > 2` require the secondary password md5 as 2nd arg (`ShopPanel.as:765-800`). H5's current sell (floor(price/4),
bound -> moneyBind else money) is derived from the client tooltip, not Go. [client-backed, Go none]
R19. `exchangeItem(creditId:string, amount)` mock: returns fixed equipment 2001 and `onUPP{cbM:500}` (`service.go:443-452`).
`updateLimit` returns fake dicts (`:469-495`); `getShopAwardStr` returns "" ; `getShopConfig`/`getLimitShopConfig`/`getRemainShopConfig`
push `onGetShopConfig`/... with `[0,"",[]]` (`shop/config.go:104-132`); `getLimitTimeShop` and `shopClosePanel` are stubs. Client wiring:
credit shop = `NpcShopPanel.as:304`, `NpcShopItemDisplay.as:241` (`exchangeItem(creditId, n)`), limits from `TBL_CREDIT`.
**TBL_CREDIT** (`data_tbl_credit`, 252 rows): `shop_id`, `tab`, `type` (29/19), `item_id`, `c_type1/c_num1`, `c_type2/c_num2` (cost currency
ids: 32 x96 = shop 1, 41 x70 = shop 3, 67, 34, 66, 49, 72, 68, 70), `bind`, `is_sell`, `limit_type` (0 none, 2, 3), `limit_num`. `limit_type`
semantics (day/week/month/total dicts returned by `updateLimit`) are inferred from `UpdateLimitResult` field names only [unverified].
Currency ids 32-72 are **not** in `DeductCurrency`, so Go could not charge them [gap]. Recommend M5 skips credit/guild/event shops.
R20. `unlockMoney(md5)` (`shop/misc.go:19-43`): returns true after pushing `setClientDP(md5)`; on failure pushes `a(SecondaryPasswordFailureMessage)`
and returns false.
R21. **VIP shop** (`application/shop/vip*.go`) [go-invented economy on shop 99 data]: needs active VIP/PM membership
(`HasActiveVIP`); pool = slots of shop `sid=99` with `st != 5` (71 rows, minus hidden); shared rotation every 4 h in UTC+7
(`vip_rotation.go:450-485`, FNV-seeded `rand.Perm`, 6 slots); personal refresh: 1st/day free, then 20 gold, max 5/day (`vip_refresh.go:18-27`,
count per UTC+7 day); one purchase per slot per epoch, amount forced 1; price `slot.gold * (100 - discount[pmLevel])/100` min 1 with
discount `[0,2,4,8,12,18,25,33,42,50][pmLevel]` (`vip_discount.go:7-14`), charged from `Gold` (never bound; item unbound). Persistence:
postgres `vipshop_repository` (rotation, per-char override, purchases, refresh counter). Dynamic feed of last 20 buys (in memory).
Errors via `onRedMsg` and reply `{flag:false,...}`. H5 has no VIP/PM; skip or defer.
R22. Mystery exchange (`mysteryexchange/exchange.go`): `[dict, md5]`, password required, items must be owned, **not equipped, not bound**,
deleted first then `+1` MysteryCrystal per unit (`exchangeItemCrystalPerUnit=1`, placeholder [go]); score dict keys 2..17 deducted from
the Mystery Treasure state. Depends on `mysterytreasure` module -> out of M5 scope.
R23. `gp` returns account-level gold (`account.Gold`) as `onGetAwardPoint` (`exchange/handler.go:44`); characters of one account share it.

### 3.4 Crafting

R24. **Equipment craft** `newMake(materials, recipeId)` where `recipeId` = **equipment template id** and `materials = {1:{tempBagFlag,idx},2:..,3:..}`
(`craft.go:732-946`, client `EquiptFuncPanel.as:10818`). Client list = equipment templates with `makable==1` (916 rows; 899 have
`require_item1>0`), filtered by class (`EquiptFuncPanel.as:11490`). Requirements come from the template: `require_item1..3` + `require_num1..3`
(slots with 0 skipped, `craft.go:617-636`). **No money cost, no level/class/learned-recipe check, no limit/cooldown** in Go
(`MONEY_EQUFUNC_MAKE=10` is only used for tier-upgrade/pet gear cost). Material resolution (`:645-700`): for each requirement the slot ref must exist,
item must be owned, template match and `stackCount >= require_num`.
R25. Rates (`craft.go:103-118, 534-567, 194-219, 277-326`):
1. Material level of an item: instance `properties.level|itemLevel` > template `level` > `item_level` > from template colour > from **instance
   ColorCode `c` -> level `c+1`** (so ColorCode 1..5 -> level 2..6; ColorCode 0 -> no level). Base materials (24, 18, 27, 7, ...) have template
   level 0 and `color_code` 0, so level comes from their ColorCode after mixing.
2. If **every** selected material has a level in 2..6: custom rates by the **lowest** level: L2 `[100,0,0,0]`, L3 `[0,100,0,0]`, L4 `[0,0,100,0]`,
   L5 `[0,0,95,5]`, L6 `[0,0,0,100]` (makePer1..4 = colour 2,3,4,5). Any L6 material with equipment `req_level < 60` -> craft refused.
3. Else (any white/unknown material): `data_tbl_recipe_plan` rows for `recipe_id == equipment id` (362 rows, 184 recipes, 183 are equipment ids; `st`
   1..4 -> colour code: st1 and st2 both -> 2, st3 -> 3, st4 -> 4; `rate` is an absolute percent, can be >100, e.g. 180/200 for st2; `num`=1,
   `p` unused). Rates sum per colour. Total < 100 => remainder is **failure** (134 of 184 recipes < 100); total >= 100 => no failure.
   Example recipe 1014: st2 10, st3 15, st4 8 = 33% success.
4. No plan rows or zero rates: fallback = lowest material tier (instance ColorCode, else `properties.color`, else quality-derived) else template
   colour, else 1; 100% of that bucket, never fails.
`selectIndex`: `pool = max(total,100)`; `pos = rand*pool`; first `pool-total` is failure; then walk makePer1..4.
`getMakeColor` returns the raw bucket values (not normalized; `normalizeCraftPreviewRates` is dead code).
R26. Result item (`craft.go:806-945`): free bag slot required (a stack fully consumed counts as freed); consumes materials
(`onDelCharactorSlot` if emptied else `onAddCharactorSlot`) **before** rolling the result - failure still consumes. Success: new equipment
`AddItemWithBindAndColor(template=recipeId, bound = any material bound, colour = bucket colour)`; quality = `previewIndex*5 + prefixType`
(1..5): `prefixType` = 5 ("Trác Việt") unless the bucket is the highest nonzero one, in which case uniform 1..5 (`:338-371`);
`UpdateCraftedEquipmentQuality` then sets `ColorCode = ceil(q/5)`, `properties.q/quality`, `color = ColorCode-1`, `preNameType = q%5 (0->5)`,
**rerolls main/prop lines**: the template lines are shuffled over the template's used slots (`mainProp1/2, prop1/2`), each value =
`randInt(floor(base*M[q-1]), floor(base*M[q]))` with `M` = `EQUIPT_QUALITY` table `[1,1.05,1.1,1.15,1.2,1.25,1.3,1.35,1.4,1.45,1.5,1.6,1.7,1.8,1.9,2.1,2.3,2.5,2.7,2.9,3.5]`
(index 0..20, capped at 20; **[data]** `GamePredef.as:9762-9783`, `domain/item/display.go:20-33,97-112`); `bindMainPropNum1/2 =
randInt(0, floor(bind_prop_num*M[q]))` when `q >= 6` else 0 (`service.go:2266-2300`); **pre-drilled holes**: 1 (40%), 2 (35%), 3 (25%)
(`application/item/hole.go:113-139`, `t1..tn = 0`) [go]; random element 1..6 (`AssignRandomEquipmentElement`, `service.go:2507`);
`maker` = crafter name. Push order: material slot pushes, `onAddCharactorSlot(result)`, orange (colour 5) broadcast `onSystemSay`
(`broadcastOrangeEquipmentNotice`), optional bag-capacity warning. Reply `{flag:true}`; every failure path replies `{flag:false}`.
R27. `getMakeColor(materials, recipeId)`: no consumption; reply `{canMake:true, colorPerList:{makePer1..4}, flag:0}`; unresolved materials
`{canMake:false, flag:1}`; missing refs `{canMake:false, flag:0}`; L6/level gate `{canMake:false,flag:1}`.
R28. **Material mix** `materialMixOne(num, itemId, tempFlag)` / `materialMixAll` (`mix.go`): item template `kind` 5 or 6; `2<=num<=5`; stack >= num;
rate = `num * (6 if itemColor==4 else 20)` percent where `itemColor = instance ColorCode (or template color when 0)`; client label =
same plus VIP bonus `TBL_PM_RIGHT id 8 value<pmLevel>` when basic rate is 6 (`EquiptFuncPanel.as:12594-12612`, display only; Go
ignores) [rate data-backed by client]. Success: new row/stack of same template, same bound flag, `ColorCode+1` (capped 5), 1 unit
(`One`) or `floor(stack/num)` attempts each rolled (`All`, `mix.go:225-230`). Consumption happens before the roll. Reply `{slotId, num: remaining, flag, finalNum}`.
Failure of `One` still returns remaining. Pushes: `onAddCharactorSlot|onDelCharactorSlot(source)`, on success `onAddItem{t:29,i,n,c:newColor,q:newColor,tt,s:""}`
then `onAddCharactorSlot(product)`. Note a colour-5 stack can still be mixed (stays 5) - waste, same in Go.
R29. **Life skills** `newCook(ingredientDict, recipeSkillId)`, `newMedicine` (`life_skill.go:64-139`): recipe = `data_tbl_skill` row 
(type 21 cook-book, 54 rows; type 22 medicine-book, 24 rows; base skill types 17 cook / 18 medicine, 10 rows each); player must know the recipe skill, base life skill
level >= recipe `level` (`skill/life_skill.go:116-149`). Result items = `skill.use_item_id` (+ `skill.use_item_type` if > 0), 1 each; ingredient
requirement = result item template's `i1..i3 / n1..n3` (all three must be > 0). Ingredients arg `{slot: itemId}`. Deterministic, no
money, +20 mastery (`dex`) per craft (`lifeSkillCraftMasteryGain`); result bound if any ingredient bound. Errors via
`onSystemMidMsgOrNote("Thiếu nguyên liệu" | "Chưa học công thức" | "Cấp kỹ năng sống không đủ" | "Không tìm thấy công thức")`, reply nil;
success pushes consumed slot updates, `onAddCharactorSlot` per product, life-skill state update, reply `true`. Example: skill 5436
-> item 2708 (needs 10x2806, 10x2807, 1x2827). H5 has no life-skill state -> defer.

### 3.5 Equipment upgrades

Instance fields live in `character_items.properties` jsonb + columns `star_level`, `color_code`, `is_bound`, `durability`, `max_durability`
(`migrations/20260328184527_baseline_mcgame_schema.sql`, table `player.character_items`). Property keys (populate: `service.go:1760-1800`):
`mainProp1/2, mainPropNum1/2, prop1/2, propNum1/2, activeProp, activePropNum, bindMainPropNum1/2` (default = template `bind_prop_num`),
`element` (0 none, 1..6), `preNameType` 1..5, `q`/`quality`, `color`, `maker`, `t1..t10` (-1 undrilled/absent, 0 empty, >0 gem template),
`flag/flag2/flag3` (sublimation/ky linh/pet stones, not in scope), `upgradeNum` (= star level for the client), `endureLeft/endureMax`.

**Star** (`star.go`, `domain` multiplier `equip_stats.go:83-92`):
R30. Star stone = template **5 "Thăng Tinh Thạch"** (type 504). `starOne(count 1..5, equipId, stoneItemId)`; `starAll(count, equipId, maxTarget 1..10, stoneItemId)`.
Preconditions (any failure -> reply nil, no error): item owned & equipment, star < 10, stone is template 5 with stack >= count.
**No money cost** (client constant `MONEY_EQUFUNC_STAR=200` unused), no bind change (client warns when unbound gear meets bound stones:
`EquiptFuncPanel.as:12690` - Go ignores).
R31. Success rate = `TABLE[idx] * count / 5` capped at 100 with `TABLE = [100,100,100,90,80,70,60,50,30,30,30]`
(`EQUIPT_STAR_SUCCESS` **[data]** `GamePredef.as:1426`). **Index mismatch**: Go uses `idx = currentStar` (`star.go:23-34`), the client display uses
`idx = currentStar + 1` (`EquiptFuncPanel.as:10415`, `WingFuncPanel.as:3596`). Go effective per transition 0->1..9->10:
100,100,100,90,80,70,60,50,30,30; client-displayed: 100,100,90,80,70,60,50,30,30,30. Buff variant `EQUIPT_STAR_SUCCESS_BUFF = [100,100,100,100,100,95,80,70,45,45,45]`
applies while buff 3263 is on (client only; Go none). **Pick one and say which**: recommend the client table (the player sees it).
R32. Failure: star unchanged, except Go resets to 0 when current star >= 8 [go-invented, unverified vs original]. Stones are consumed before the roll.
`starAll`: loop `while star < maxTarget && stones >= count`, break on failure-to-0 only (a failure below 8 keeps looping), stack decremented in place;
one `onAddCharactorSlot(equip)` and stone push at the end. Reply `{equSlotId, starSlotId, num: stones left, starNum, flag: lastRollSuccess}`.
`getStarNum(equipId)` -> int star (0 on any problem).
R33. Star multiplier **[data]** `EQUIPT_STAR_NUM = [1,1.1,1.21,1.33,1.46,1.61,1.77,1.94,2.14,2.36,2.6]` (`GamePredef.as:1424`): applied only to
`mainPropNum1/2`: `floor(base * mult[star])`; secondary props, bind bonuses, gems and set bonuses are not multiplied (`equip_stats.go:94-134`).
Star also read by the client as `upgradeNum`.

**Holes / jewels**:
R34. `getHoleNum(equId)` -> `{holeNum: count(t_i >= 0), flag}`. `getJewelData(equId)` -> `{holeNum, t1..t10}` (-1 undrilled).
R35. `holeDig(diamondItemId, equipId)` (`hole.go:47-161`): equipment must be **bound**; capacity = `equipt_template.hole_num` (1871 of 1872 are 0 -> treated as
**10** `MaxHoles`); diamond = item template **type 600** (only template 16 "Kim Cương", kind 6); required diamond **ColorCode >= floor((nextSlot-1)/2)**
(slots 1-2: 0, 3-4: 1, ..., 9-10: 4; `application/item/hole.go:141-146`); cost **2000** [data: client `MONEY_EQUFUNC_DIG=2000`] taken from `moneyBind`
if `selectedMoneyType != 2` else `money` (`handler.go:428-451`); order: validate -> consume 1 diamond (push `onAddCharactorSlot|onDelCharactorSlot`) ->
deduct money -> set `t{next}=0` -> push `onAddCharactorSlot(equip)`, `onUPP{money key}`; reply `{equSlotId, diamondSlotId, num, flag:true}`,
all failures `{flag:false}`. No rollback if the drill fails after the charge.
R36. `jewelSet(equId, {slot:{idx, tempBagFlag}})` (`gem.go:43-142`): per slot 1..10: hole must be drilled and empty (`t==0`), the ref must be an item whose
template `type==503`; consumes 1 gem per slot (own push each), then bulk-writes `t{slot}=gemTemplateId`, pushes `onAddCharactorSlot(equip)`;
reply = count set (int). Free of charge. Gem stats: template `prop_type` + `propl_num` added as **flat** (`equip_stats.go:142-160`): Go maps only
1->strength, 2->agility, 3->**max HP**, 4->intelligence, 5->spirit (`gemPropToStat` `:198-210`); props 6..14 (luck + 8 resistances; client
`GamePredef.as:1369-1382` 3 = STAMINA) give **nothing** in Go. [go; 3->HP vs STAMINA ambiguity unverified]
R37. `jewelDel(equId, slot)`: needs a gem in the slot; fee = `round(gem.template.gold * 0.2)` from the selected silver type (skipped if 0);
clears the slot to 0 (drilled stays), returns **the same gem template** as a new item (bound = equipment's bound, colour 0) with
`onAddCharactorSlot`; pushes `onUPP`, `onAddCharactorSlot(equip)`; reply bool. 20% [go]. 
R38. `jewelUpdateOne(num 2..5, itemId, tempFlag)` / `jewelUpdateAll` (`jewel.go`): gem template `type==503` and `next_jewel_tid > 0`; rate **`num*20%`
[data, client `EquiptFuncPanel.as:7298`]**; consumption before roll; product = `next_jewel_tid`, same bound, colour 0; `All` loops
`floor(stack/num)` rolls; replies/pushes like mix (R28) but `onAddItem.c = nextTemplate.color`. No money. Chains (data_tbl_item_template type 503,
72 rows): 14 chains x 5 tiers by `prop_type`, e.g. type 1 (11 -> 47 -> 52 -> 57 -> 62: +1,+2,+4,+7,+10, template gold 2,10,50,225,1125, colours 0..4);
prop 1-5/6: +1,+2,+4,+7,+10 (6: +1,+3,+5,+8,+10); props 7..14: +5,+8,+15,+25,+35; template 3740 "Đá Tẩy Luyện" has no stats/next.
Chain heads: 10,11,13,9,12,65 (props 4,1,2,3,5,6) and 66,68,69,2254,43,67,70,72 (props 8,13,7,14,10,9,11,12).

**Prefix / soul / bind / element** (all consume resources at the *preview* step, confirm only applies):
R39. `changeName(equId, matRef, tempFlag)` ("maker signature", `application/item/maker.go:116-200`): equipment bound, colour >= 4 (via ColorCode, `q`,
display colour, then template), material = template `require_item3` (stack >= 1), needs `char.Money >= 10000` (unbound silver only, NOT selected type, 10000
= client `MONEY_EQUFUNC_NAME`); sets `properties.maker = char.name`; consumes 1 material, deducts silver; pushes material slot update,
`onAddCharactorSlot(equip)`, `onUPP{money}`, `onInitViewProp` if equipped; reply `{f:true, ii: matRef, n: remaining}` else `{f:false}`.
R40. `changeElement(equId, matRef, tempFlag)`: needs 30000 silver (selected type; client `MONEY_EQUFUNC_ELEMENT`), material = `require_item1`; new element = uniform 1..6
**excluding the current**; charges and consumes 1 material immediately, stores pending {equId,newElement}; reply `{f:true, ii, n: remaining, e:new, b:old, ei:new}`;
`sureChangeElement(1|0)`: applies (`UpdateEquipmentElement`), pushes `onAddCharactorSlot`; if equipped also `onInitViewProp`, `onEquipActiveList` + character
element state; reply `{f:"true", e}`; no pending / reject -> `{f:"false"}` (pending cleared, **no refund**). Pending is in memory per character.
R41. `changeBind(equId, matRef, tempFlag)`: 30000 silver, material = `require_item2`; rolls `bindMainPropNum1/2` each uniform `1..template.bind_prop_num`;
reply `{f:true, ii, n, b1:old1, b11:new1, b2:old2, b12:new2, mainProp1, mainProp2}`; `sureChangeBind` -> `{f:"sure", b1, b2}` (reject `{f:"false"}`), pushes
`onAddCharactorSlot` (+ `onEquipActiveList`, `onInitViewProp` if equipped). Stat effect: `bindMainPropNum` is added to the matching main prop
(`equip_stats.go:107-130`).
R42. `changeSoul(equId, matItemId, mode 1|2)` (`change_soul.go:108-275`): cost `50000 * mode` silver, material by `equipt.req_level`: <=60 -> 1659, <=80 -> 1660,
<=100 -> 1661, else 1662 ("Linh Hồn Thạch" types 550), `stack >= mode`; mode 1 or equipment has no soul: full re-roll `activeProp = rand 1..8`,
`activePropNum = rand 1..max` with `max = template.active_prop_num` (<=0 -> 10); preview reply `{f:true,type:"1",ii,n,ap,apn,apro,apropnum}` + pending;
`sureChangeSoul(1|0)` applies, reply `{f:"true",activeProp,activePropNum}`. Mode 2 (needs existing soul): keeps prop type, rerolls value, **applied immediately** reply
`{f:true,type:"2",ii,n,ap,apn:new,apro:new,apropnum:old,apropnu:old}`. Resources always consumed first.
R43. `changePrefix(req)` req = `{e, i1,i2,i3:{idx, flag|tempBagFlag}}` (`change_prefix.go`): equipment colour >= 4; template needs 3 requirement slots; each material template match,
stack >= `require_num`, **all three the same level 4..6** (`craft` level function R25.1); orange (colour 5) equipment needs level >= 5; cost `req_level^2 * 10`
silver (selected type; falls back to `item_level`, then 1) must be available at preview and confirm. Preview: L4 -> `q = 15 + prefix(weights 22,22,22,22,12 for 1..5)`
and star -1; L5 -> orange keeps `q`, otherwise `q = 20`; L6 -> orange+prefix5 stays 25, else `q = 20 + weighted prefix`; element rerolled uniform 1..6.
Preview reply `{f:true, equIns(preview dto, bound "1"), oldEquIns, sid, i}` with new rolled lines (`ApplyRandomizedEquipmentPropertyRolls`), pending kept in memory; **nothing is consumed yet**.
`sureChangePrefix(1|0)`: re-validates, sets quality/colour/prefix/element/star, **binds the item**, consumes the three materials (aggregating equal ids), deducts silver,
pushes slot updates, `onAddCharactorSlot(equip)`, `onUPP`, element update, orange broadcast; reply `{f:true,e,i,n}`; `{f:false}` otherwise.
R44. `changeLevel({e, i1,i2,i3:{flag, idx}})` tier upgrade (`change_level.go:137-370`): template `next_equ_tid > 0` (1311 equipment templates have one); materials from the
**next** template's `require_item/num`; all materials same colour (`q/5` else ColorCode else `color`); equipment display colour 4 requires materials of equal tier;
cost `next.req_level^2 * 10` silver (selected type, `MONEY_EQUFUNC_MAKE`); order: consume materials -> delete old equipment (`onDelCharactorSlot`) -> deduct money
(`onUPP`) -> create the next template **in the same slot**, keeps `is_bound`, colour = material colour (else next template colour), **resets stars/holes/gems/rolls** (new item), random
element -> `onAddCharactorSlot`; if equipped: HP/MP sync, element update, stat update, `onEquipActiveList`, appearance. Reply `{f:true,e:oldId,i:newId,n:dto,sid}`; failures `{f:false}`.
R45. `equResolve(equId, md5)` disassemble (`resolve.go:18-110`): password verified (else `a(...)` push and nil); equipment owned, `ColorCode >= 1`, **not equipped**; returns
template `require_item1..3 x require_num1..3` (**bound**, type consumable) with colour `ColorCode` if prefix 5 else `ColorCode-1` (clamped 0..5); then deletes the item;
pushes `onAddCharactorSlot` per material then `onDelCharactorSlot(equip)`; truthy reply. Gems/stars/holes are lost (no refund). No fee.
R46. `bindItem(itemId)` (`bag_manage.go:133`): sets bound; pushes `onChangeEquiptInst` (equipment) or `onCreateItemInstance`, then `onAddCharactorSlot`; reply `{success:true}`.
Client sells ACTION_BIND by "bind" cursor (Slot.as:725).
R47. Equipment colour scales: quality 1..25, `ColorCode = (q+4)/5` clamped 0..5, `preNameType = q%5` (0 -> 5), display colour `color = ColorCode-1`, representative
quality of a colour `(c-1)*5+1`; quest-reward equipment uses `ColorCode+1` (`display.go:44-121`). Item (non-equipment) colour is 0..4 (client) while materials after mixing reach 5.

### 3.6 Runes (light)

R48. Data: `data_tbl_deco_rune` (1520 rows: `kind` 1 char / 2 pet, `next_id`, `exp` (resolve value), `up_exp` (upgrade cost), `prop_type/num`, `chip_id`), `data_tbl_rune_chip`
(76 rows: `rid` = result rune id, `num` = chips per rune). State: `character_feature_states` keys `rune` ({chaBag, petBag: {"pos": {n, r}}, upLvlHole}) and `rune_chip`
(`application/rune/service.go:20-60`); caps 100 slots each. Currency "rune exp" id 217 (`CurrencyRuneExp`).
R49. `getRuneBagData` -> bag wire (`RuneBagToWire`); `runeMove(from,to,bagType)` (0 char bag, 1 pet bag; -1 = upLvlHole): hole->bag merges only same rune, bag->hole only if hole empty,
bag<->bag swap/move; push `onRuneBagUpdate(bag)`. `arrangeRuneBag(cid, bagType)` dense pack, same push. `runeSet(bagPos, holePos 1..16, bagType, decoPosition)`: odd hole = char rune, even = pet; kind must
match bag; decrements the bag then writes the deco hole slot `R[holePos-1]` (refunds on failure); reply = decoInfo wire, push `onRuneBagUpdate`. `runeRemove` inverse. `runeUpLvl`: rune in `upLvlHole` -> `next_id`
if `runeExp >= up_exp` (deduct first), terminal if `next_id<=0`; reply bag wire. `runeResolve({pos:runeId}, bagType)`: remove, credit `sum(exp*n)` rune exp (bag saved first), push `onRuneBagUpdate`. `exchangeRune`: per chip stack
`floor(n/chip.num)` runes of `rid`, debit chips first; pushes `updateRuneChipBag` always and `onRuneBagUpdate` when something converted. Depends on the deco/dress feature (decoInfo) -> defer with it.

### 3.7 Misc

R50. `changeNameByCard(newName)` (`special.go:23-75`): trim, 2..12 runes else `onSystemSay("Tên phải từ 2 đến 12 ký tự.")`; consumes 1 of template **2126 "Thẻ Đổi Tên"** else
`onSystemSay("Bạn không có Thẻ Đổi Tên.")`; sets name; push `onUPP{name}`; reply `{success:true}`. **No uniqueness/profanity check**. `changeCharSex` consumes template 2844.
R51. `useTransport(mapId)` / `useTransportGroup` (`transport.go`): consumes first owned of regular priority [1036, 1363, 2946, 1515, 2947, 2948, 2949, 2950, 3722, 4941, 4942] (group leader: senior list only);
else pays **3 gold** (regular) / **5 gold** (senior/group leader) via `charHasGold` (selected gold type); map must exist with `T > 0`; no item and no gold -> `onSystemMidMsgOrNote("Bạn không có Tiêu Diêu Phù và không đủ Vàng để dịch chuyển.")`.
H5 owns movement; reuse `scene` module.
R52. `useRedBag(itemId)`: generic `UseItem` + slot push (note only; awards table-driven).

## 4. State

Persisted in Go (Postgres) vs proposed Mongo:

| Go | Proposed H5 |
|---|---|
| `player.characters.bag_slot_num` (1), `bank_slot_num` (1), `temp_bag_slots`, `mx_temp_bag_slots`, `pet_max_num` | `Character.bagSlotNum` (default 1), `bankSlotNum` (1), `tempBagSlots`, `mxTempBagSlots` |
| `player.characters.selected_money_type/selected_gold_type`, `money`, `money_bind`, `gold`, `gold_bind`, `honor`, special points | already: money keys + selected types; add `honor` and per-currency balances only when a special-currency shop is ported (suggest `currencies: Record<string, number>`) |
| `player.character_items` (`id, character_id, template_id, item_type, slot_type, slot_index, stack_count, is_bound, durability, max_durability, enchant_level, star_level, color_code, properties jsonb`) | `CharacterItem` + `starLevel: number`, `properties: Record<string, unknown>` (or typed subdoc: `mainProp1/2, mainPropNum1/2, prop1/2, propNum1/2, activeProp, activePropNum, bindMainPropNum1/2, element, preNameType, q, maker, t1..t10`); keep unique index `(characterId, slotType, slotIndex)` - bank (2), temp (3), quest (4), pet bag (5) just new `slotType` values; temp bag uses index offsets 0..19 / 100+ |
| `character_feature_states` `rune`, `rune_chip`; `deco_hole` | later `rune.service` collections |
| VIP: `vip_shop_rotation`, per-char override/purchases/refresh counter | defer |
| `account.secondary_password` (md5) | already `Account.secondaryPassword` |

In memory only (lost on restart): pending previews for `changePrefix` / `changeSoul` / `changeElement` / `changeBind` (handler maps keyed by character id,
`item/handler.go:63-69`), VIP dynamic feed, session-cached secondary password (`setClientDP`). Restart story: previews that already charged the player
(element/bind/soul) lose the roll with no refund - H5 can keep them in memory too but should note it or persist `{equipId, new values}` in a small collection
(recommended, cheap).

## 5. Data tables

| Collection | Columns used | Meaning / notes |
|---|---|---|
| `data_tbl_item_template` | `id, type, kind, color, color_code, level, item_level, stack_max, single_flag, price, gold, honor, next_jewel_tid, prop_type, propl_num, i1..i3/n1..n3, use_type` | `type` 500 scroll(324/325/326), 503 jewel, 504 star stone, 550 card/quest-ish, 600 diamond (only id 16), 601 metal ...; `kind` 6 material, 14 feather; ColorCode of materials is instance-level |
| `data_tbl_equipt_template` | `id, kind, position, req_level, item_level, color, color_code, endure_max, makable, repairable, require_item1..3, require_num1..3, next_equ_tid, bind_prop_num, hole_num, main_prop1/2, main_prop_num1/2, prop1/2, prop_num1/2, active_prop_type, active_prop_num, active_equip_id, req_class, price, gold` | 916 makable; 1311 with `next_equ_tid`; `hole_num` always 0 except one; `succ_rate` column exists (1845 zeros) and is **not used** |
| `data_tbl_recipe_plan` | `recipe_id (= equipt id), st (1..4), rate, num, p` | craft success buckets (R25.3); `data_tbl_recipe` (185 rows, ids 1001..) are fashion "formula" items - **id collision** with equipment ids, not crafting |
| `data_tbl_shop`, `data_tbl_shop_slot` | see R13 | slot `id` is the shop-slot id sent by the client; ids collide with nothing but `buy*` falls back to template ids (R14) |
| `data_tbl_credit` | R19 | credit/exchange shops, unused server-side |
| `data_tbl_skill` | `type` 17/18 base cook/medicine, 21/22 recipe books, `level, use_item_id, use_item_type` | life-skill crafts |
| `data_tbl_deco_rune`, `data_tbl_rune_chip`, `data_tbl_deco_hole` | R48 | rune system |
| `data_tbl_npc` | `type` 7 bank (6 rows), `shop_id` | bank/shop NPC routing |
| `data_tbl_pm_right` | id 8 value1..N | VIP bonus on rare mix (client display only) |

Id pairing tables:
- Bank pages: item 324 (shop slot 2064) -> `bankSlotNum` (max 5); bag pages: item 325 (slot 2063) -> `bagSlotNum` (max 7); pet bag: 326/2092.
- Soul stones: equipment `req_level` bands 60/80/100/999 -> items 1659/1660/1661/1662.
- Craft materials: `equipt.require_item1/2/3` (items 24 Kim Loại Hiếm x281 templates, 28, 26, 23, 7, 21, 25, 27, 22, 18): slot 1 doubles as `changeElement` material, slot 2
  as `changeBind` material, slot 3 as `changeName` material.
- Star stone = item 5, diamond = item 16, star-addition item 3315 (type 551, unrelated), rename card 2126, sex card 2844, transport scrolls 1036/1363/2946/1515/2947-2950/3722/4941/4942.
- Jewel chains: see R38. Diamond colour mixing uses the same `materialMix` (kind 6).
- Crafted tier map: recipe-plan `st` -> colour code (1->2, 2->2, 3->3, 4->4); makePer index -> colour code index+1.

## 6. Push sequences

- NPC shop buy ok: `onBlueMsg`, `onUPP{moneyKey}`, `onAddItem`, `onAddCharactorSlot`* (buyItemClient: BlueMsg, AddItem, AddCharactorSlot*, UPP). Fail: `onRedMsg("Mua thất bại: ..")`, reply nil.
- Mall buy: same as NPC shop (`buySystemItemClient`); Multi: `onAddItem`*, `onAddCharactorSlot`*, `onUPP`; reply `{success, items}`.
- Repair: `onUPP{money}`; reply `{success,cost,money}` (single) / nil (all). Error: RPC error response (`ErrorToResponse` / thrown error), no red msg.
- Bank open: `setClientDP(md5)`, `initViewBankPanel()`; fail: `onNpcMsg(npcId, text)`.
- Page move: `onDelCharactorSlot(id, oldSid)`, `onAddCharactorSlot(dto)`; refusals `onMidNote(text)`.
- craft ok: `onDelCharactorSlot|onAddCharactorSlot` per material, `onAddCharactorSlot(result)`, [`onSystemSay` orange], reply `{flag:true}`; fail: materials updated, reply `{flag:false}`.
- mix/jewel up: source slot push, [`onAddItem`, `onAddCharactorSlot(product)`], reply `{slotId,num,flag,finalNum}`.
- star: stone push (`onDel|onAdd`), [`onAddCharactorSlot(equip)` when star changed], reply `{equSlotId,starSlotId,num,starNum,flag}`.
- holeDig: diamond push, `onAddCharactorSlot(equip)`, `onUPP`, reply `{equSlotId,diamondSlotId,num,flag}`.
- preview/confirm (element/bind/soul/prefix): preview consumes + `onUPP` (+ material push) and replies; confirm pushes `onAddCharactorSlot(equip)` (+ equipped extras) and replies `{f:"true"|"sure"|true,...}`.
- changeLevel: material pushes, `onDelCharactorSlot(old)`, `onUPP`, `onAddCharactorSlot(new)`, [equipped: stat/appearance pushes], reply `{f,e,i,n,sid}`.
- resolve: `onAddCharactorSlot` x materials, `onDelCharactorSlot(equip)`.

## 7. Port notes (TypeScript)

Existing in H5 (verified by reading `docs/memory/inventory.md`, `shop.md`, `server/src/modules/{inventory,shop,character}`): bag slotType 0 only (plus equip 1, pet gear 6),
`BAG_SID_BASE = 2101`, `moveItem/moveItemNum/dropItem/bagSort`, NPC shop buy/sell with payment prefs (`spendMoney/addMoney/paymentPrefs`), `bind_prop_num` main-line bonus and star hook = 1
(`equip-stats.ts`), `GameDataService.getShop/shopSlots/getShopSlot/template/templatesByIds`. **Missing**: `starLevel`/`properties` on `CharacterItem`; `bagSlotNum/bankSlotNum/tempBag*` on
`Character`; sids beyond bag; `getNpc`-driven bank flow; gamedata accessors for `data_tbl_recipe_plan`, `data_tbl_credit`, jewel chain lookups, `recipe`/`rune` tables;
secondary-password verification helper (field exists on account).

Suggested modules: `server/src/modules/inventory/slot-map.ts` (+test), `bank.service.ts`/`bank.rpc.ts`, `modules/economy/{repair,mall}.service.ts`, `modules/craft/{craft-rules.ts,craft.service.ts,craft.rpc.ts}`,
`modules/equip-upgrade/{star-rules.ts,socket.service.ts,reroll.service.ts,upgrade.rpc.ts}` (pending previews in a `Map<number, Pending>`), shared types in `packages/shared/src/{inventory.ts,craft.ts}`. Pure rules (rates, sid map, quality) get unit tests.

```ts
// --- sid <-> slot (R2) ---
const SLOT = { BAG: 0, EQUIP: 1, BANK: 2, TEMP: 3, QUEST: 4, PET_BAG: 5, PET_EQUIP: 6 } as const;
function parseSid(sid: number): { slotType: number; slotIndex: number } {
  if (sid >= 1 && sid <= 22) return { slotType: SLOT.EQUIP, slotIndex: sid - 1 };
  if (sid >= 2101 && sid <= 2310) return { slotType: SLOT.BAG, slotIndex: sid - 2101 };
  if (sid >= 2311 && sid <= 2340) return { slotType: SLOT.QUEST, slotIndex: sid - 2311 };
  if (sid >= 2341 && sid <= 2370) return { slotType: SLOT.PET_BAG, slotIndex: sid - 2341 };
  if (sid >= 301 && sid <= 450) return { slotType: SLOT.BANK, slotIndex: sid - 301 };
  if (sid >= 1001 && sid <= 1200) return { slotType: SLOT.PET_EQUIP, slotIndex: sid - 1001 };
  if (sid >= 80 && sid <= 99) return { slotType: SLOT.TEMP, slotIndex: sid - 80 };
  throw RpcException.invalidArgs('sid');
}
// capacity: bag bagSlotNum*30 (max 7 pages), bank bankSlotNum*30 (max 5), quest 30, pet bag 30

// --- moveItemToPage (R4) ---
function planPage(pageType: 1 | 2, tab: number, item: ItemRow, c: { bagSlotNum: number; bankSlotNum: number }) {
  if (pageType === 1) {
    if (tab < 1 || tab > 9) return { err: 'args' };
    if (tab <= 7) return tab > clamp(c.bagSlotNum, 1, 7) ? { note: 'Trang túi chưa mở.' } : { slotType: SLOT.BAG, lo: (tab - 1) * 30 };
    if (tab === 8) return isQuestItem(item) ? { slotType: SLOT.QUEST, lo: 0 } : { note: 'Chỉ vật phẩm nhiệm vụ mới đặt được ở đây.' };
    return isPetItem(item) ? { slotType: SLOT.PET_BAG, lo: 0 } : { note: 'Chỉ vật phẩm thú cưng mới đặt được ở đây.' };
  }
  if (tab < 1 || tab > 5) return { err: 'args' };
  return tab > clamp(c.bankSlotNum, 1, 5) ? { note: 'Trang ngân hàng chưa mở.' } : { slotType: SLOT.BANK, lo: (tab - 1) * 30 };
}
// first free index in [lo, lo+30) else onMidNote('Trang đã đầy.'); push onDelCharactorSlot(id, oldSid) then onAddCharactorSlot(dto)

// --- bank open (R6): session.bankOpen = true on success; moveItem to/from bank sids should require it (H5 hardening; Go does not) ---
// npcFuncClick(npcId, md5?): npc.type === 7 -> verify account.secondaryPassword === md5 -> callback('setClientDP', md5), callback('initViewBankPanel')

// --- repair (R10/R11) ---
const repairCost = (it: { maxDurability: number; durability: number }) => Math.max(0, it.maxDurability - it.durability) * 10;
// repair(itemId): owner check; cost from Money only (spendMoney(id,'money',cost)); onUPP({money}); repairAll: equipped rows only, total first, all-or-nothing

// --- shop (R14/R16) --- reuse shop-buy.ts resolvePrice; add: buySystemItemClient(slotOrItem, n): slot.point>0 -> honor; else gold (gt===1 ? 'gold' : prefs.gold), price slot.gold
// mall: bound iff paid goldBind; buyAndUse flow stays client-side

// --- page books (R7, proposed) ---
// useItem(template 325): bagSlotNum < 7 ? bagSlotNum++ , consume 1, onUPP({bagSlotNum}); 324: bankSlotNum < 5 -> ++ ; else onMidNote

// --- craft (R25/R26) ---
type Rates = [number, number, number, number];
const LEVEL_RATES: Record<number, Rates> = { 2: [100,0,0,0], 3: [0,100,0,0], 4: [0,0,100,0], 5: [0,0,95,5], 6: [0,0,0,100] };
const matLevel = (m: ItemRow, tpl: Row) => num(m.props?.level) || num(m.props?.itemLevel) || num(tpl.level) || num(tpl.item_level)
  || (colorToLevel(tpl.color_code) ?? colorToLevel(tpl.color)) || colorToLevel(m.colorCode) || 0; // colorToLevel(c) = c>0 ? c+1 : 0
function craftRates(mats: ItemRow[], equip: Row, plans: Row[]): Rates | 'blocked' {
  const levels = mats.map((m) => matLevel(m, tplOf(m)));
  if (levels.every((l) => l in LEVEL_RATES)) {
    if (levels.some((l) => l >= 6) && equip.req_level > 0 && equip.req_level < 60) return 'blocked';
    return LEVEL_RATES[Math.min(...levels)];
  }
  const r: Rates = [0, 0, 0, 0];
  for (const p of plans) { const cc = p.st >= 2 && p.st <= 5 ? p.st : p.st === 1 ? 2 : 0; if (cc >= 2 && p.rate > 0) r[cc - 2] += p.rate; }
  if (r.some((x) => x > 0)) return r;
  const tier = fallbackTier(mats, equip); r[Math.max(1, tier - 1) - 1] = 100; return r;
}
function rollBucket(r: Rates, u = Math.random()): number { // 1..4 or 0 = failure
  const total = r.reduce((a, b) => a + Math.max(b, 0), 0), pool = Math.max(total, 100);
  let pos = u * pool; const fail = pool - total;
  if (pos < fail) return 0; pos -= fail;
  for (let i = 0; i < 4; i++) { if (r[i] <= 0) continue; if (pos < r[i]) return i + 1; pos -= r[i]; }
  return r.map((x, i) => (x > 0 ? i + 1 : 0)).filter(Boolean).pop() ?? 0;
}
const prefixFor = (bucket: number, r: Rates) => (bucket !== highest(r) ? 5 : 1 + Math.floor(Math.random() * 5));
const qualityOf = (bucket: number, prefix: number) => bucket * 5 + prefix;   // colour = ceil(q/5), preNameType = q%5||5
// newMake: validate refs (owned, template match, stack>=num) -> bucket=rollBucket -> need free bag slot when success
//   -> consume ALL materials (even on failure) -> on success create equipment (bound if any mat bound), set quality, reroll lines
//   with QUALITY_MULT[q-1..q], pre-drill 1/2/3 holes (40/35/25), element rand 1..6, maker = name; reply {flag}
// mix: rate = num * (colorCode===4 ? 6 : 20); One: single roll; All: loop floor(stack/num); product colorCode = min(5, c+1)

// --- star (R31): choose table index explicitly
const STAR = [100,100,100,90,80,70,60,50,30,30,30];
const starRate = (star: number, stones: number) => Math.min(100, Math.floor(STAR[star + 1] * stones / 5)); // client index (recommended)
// success: star+1 ; failure: star unchanged (Go: star>=8 -> 0, unverified). no money. consume stones first.
const starMult = [1,1.1,1.21,1.33,1.46,1.61,1.77,1.94,2.14,2.36,2.6]; // main lines only: Math.floor(base * starMult[star])

// --- holeDig (R35)
const needColor = (slot: number) => Math.floor((slot - 1) / 2); // slot = next undrilled 1..10; diamond item type 600 colorCode >= needColor
// bound equipment only; cost 2000 from moneyBind (or money if selectedMoneyType===2); t{slot}=0

// --- preview/confirm (R40-R43): Map<characterId, {equipId, ...new values}> ; preview charges+consumes then stores pending
// confirm(1): apply pending (re-load equipment) ; confirm(0)/none: clear, return {f:'false'}
```

Port order suggestion: (1) character page fields + sid map + bank (NPC type 7, password gate) + page books; (2) mall buy + `changeMoneyType` UI wiring + repair stub/real; (3) mix/jewel update/hole/jewel set-del/star (pure + simple);
(4) newMake/getMakeColor; (5) preview/confirm family + changeLevel + resolve + changeName; (6) runes with deco; (7) defer VIP/credit/mystery/temp bag/life skills.

## 8. Unverified / open questions

1. Star table index: Go uses `rate[star]`, client shows `rate[star+1]`; original server behaviour unknown. Failure -> 0 for star >= 8 not backed by client text.
2. Repair cost `damage*10`, jewel removal 20%, hole pre-drill chances (40/35/25), VIP discount table/refresh prices are Go choices; no client/data backing found.
3. Real `sellItem` rule: Go is a mock. H5 uses `floor(price/4)` from client tooltip; the second arg (secondary password for `color > 2`) is the client contract.
4. Whether gem props 6..14 (luck, resistances) and prop 3 (STAMINA vs HP) should apply to stats; Go only handles 1-5 and maps 3 to max HP.
5. Material colour ceiling: Go lets mixing reach ColorCode 5; client's rare-rate test is `color == 4`. Level mapping `ColorCode+1` makes level 6 (colour 5) the only way to craft orange-colour items.
6. Meaning of `recipe_plan.p` (50 rows = 1) and `equipt_template.succ_rate`; unused by Go.
7. TBL_CREDIT limit semantics (`limit_type` 2/3) and credit currency ids 32-72 (no balances in Go); client main equipment function panels (changeLevel/holeDig/jewelSet/equResolve call sites) are missing from the decompile (`EquiptFuncPanel.as` shown is the pet-equipment variant), so request shapes come from Go parsing only.
8. Temp-bag index arithmetic (`idx-30`, `<145`) is inconsistent; real client layout (`TempBagSlot.as`) was not traced.
9. Item 1201 pack contents and award tables for page books were not queried (`data_tbl_item_award` not in the imported collections list).
10. Mystery exchange yield per item/score: placeholder in Go; true table unknown (`data_tbl_mystre.mys_sil` is a candidate).
11. Stat effect of `changeSoul` prop types 1-8 is in `ApplyActivePropBonus` (not read here); set-bonus activation (`active_equip_id`) is already covered by `docs/memory/character-stats.md`.
