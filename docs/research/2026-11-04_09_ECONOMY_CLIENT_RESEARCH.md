# M5 Economy — legacy Flash client research

Scope: bank / bag pages / temp bags, repair, system+VIP+limited+credit shops, crafting, equipment upgrades, runes, misc item
actions. Source: `D:\mcgame\docs\client` (paths below are relative to it; line numbers verified by read/grep on 2026-11-04).
Go notes (`D:\mcgame\docs\memory\*.md`, `internal/presentation/rtmp/handlers/**`) are cited only where the client cannot answer;
every such item is tagged **(Go)**. Anything not proven is tagged **inferred** or listed in section 9.

## 0. Decompile gaps that shape this milestone (read first)

| Gap | Effect |
|---|---|
| `system/CallBack.as` aborted stub (all `on*` push bodies invisible) | Push names/payloads must come from consumers or Go. Only `system/CallBackGlobal.as` is readable (shop config pushes, `onSystemSay`, ...). |
| `view/view/compDragable/BagPanel.as` aborted | Bag page tabs, payment radios (`changeMoneyType` 1/2), gold/silver lock flags, tool-button logic, bag-expansion UI are invisible. Only Language strings + callers survive. |
| `view/view/comp/EquipFunc.as` aborted (20 lines, stub) | It is the `equipChange` component inside `EquiptFuncPanel` (`EquiptFuncPanel.as:309, 807`). It hosts **all human-equipment functions**: holeDig, jewelSet/Del, changeSoul/Bind/Prefix/Element/Level, changeName, equResolve, human star. **No client call site exists for those RPCs** — arg shapes come from Go **(Go)**; UI behaviour from Language strings. |
| `ToolKit` (e.g. `ableToTemp`, `isBigThan`) and `ResManager` not in tree | Which items may enter the convenience bag is not provable. Language `TEMP_BAG_U[0]` says: gems, feathers, crafting materials, life-skill materials. |

Style recap: `_core.remote.foo(a,b)` = fire-and-forget; `_core.remote.call("foo", new Responder(fn), a, b)` = awaits reply
(see agent memory `decompile_gaps_and_rpc_semantics`). `RPC_DELAY` (`config/RPCConfig.as`): repair/repairAll/moveItem/moveItemNum/dropItem 1100 ms,
shopClosePanel 1100, npcFuncClick 1100, useItem 800, bagSort 3000, getLimitTimeShop 60000 (client-side drop window).

## 1. Bank, bag pages, temp bags

### 1.1 Slot id (sid) map — `predef/GamePredef.as`
- `SLOT_SID_EQUIP=[1,22]` (1163); `SLOT_SID_BAG=[2100,2130,2160,2190,2220,2250,2280,2310,2340,2370]` (1164);
  `SLOT_SID_BANK=[300,330,360,390,420,450]` (1165); `SLOT_SID_GUILD_BANK=[500..620]` (1166); `SLOT_SID_PET_EQUIP=[1000,1200]` (1167);
  `SLOT_SID_TEMPBAG=[80,99]` (1179); reward temp bag uses sids 1101..1130 (`TemporaryBagPanel.as:127,554`).
- Page `n` (1-based) owns sids `ARR[n-1]+1 .. ARR[n]`. Bag pages 1..7 = sids 2101..2310 (general); page 8 = **quest bag** 2311..2340;
  page 9 = **pet-item bag** 2341..2370. `MAX_BAG_TAB=9`, `MAX_PET_TAB=10` (`GamePredef.as:1256-1257`). Bank: 5 pages of 30 (sid 301..450); `MAX_HOUSEWARE_SLOT_NUM=150` (`ViewManager.as:486`).
- `Player.bagSlotNum` / `bankSlotNum` (`object/Player.as:167,148`) = number of **unlocked** general pages / bank pages. Capacity checks:
  `getEmptyBagSlotNum` = `bagSlotNum*30` − count of `sList` rows with `sid` in `(2100, ARR[bagSlotNum]]` (`Player.as:1708-1722`);
  `getEmptyBankSlotNum` likewise for bank (`Player.as:1954-1967`); `enoughBank(n)` (2533). Quest/pet pages do **not** count toward bag capacity.
- `DataManager.isBagSlot(sid)` true for general pages `1..bagSlotNum` plus quest and pet-item pages (`data/DataManager.as:206-215`).
- Login payload keys (Go, `login_payload.go:274-276`): `bagSlots, bankSlots, bagSlotNum, bankSlotNum`. `onUPP` may carry `bankSlotNum` after a bank expansion (Go `tempbag.go:150`).

### 1.2 Client-side gating when moving between bag pages
`view/view/comp/Slot.as:974-1002` (bag slot drop target, source is a bag slot): sends `moveItem(srcSid, dstSid)` (fire-and-forget) **unless**
- dst on pet-item page (sid 2341..2370) and source `kind != ITEM_KIND_PETEQU(9)` → silently dropped (984-987);
- dst on quest page (2311..2340) and template `type != ITEM_TYPE_QUEST(508)` → dropped (988-1000).
General pages (1..7) accept anything. Shift-drop or divide mode on an empty target opens NumPanel (`NumPanel.TYPE_MOVE`) — already ported (`moveItemNum`).
This contradicts the Go note `bag-bank-tabs.md` only in wording; the actual rule is the same (quest-only / petequ-only pages, everything else general).
The Go note says the bag tab drop handler calls `moveItemToPage(srcSid, PAGE_TYPE_BAG=1, tab 1..9)`; that call site is inside the aborted `BagPanel.as` (**unverified in client**).

### 1.3 Bank
- Opening: NPC type `NPC_TYPE_BANK=7` (`GamePredef.as:314`). `NpcFuncPanel.funcClick` (`compDragable/NpcFuncPanel.as:436-476`): for bank/auction NPCs sends
  `npcFuncClick(npcId, passMD5)`; `passMD5 = _core.delPass` if cached else prompts `PANEL_INPUT.showInput(DELETE_BY_PASS[0], NPCFUNCPANEL_S[3] "Mở kho", cb)` then `MD5.hash(text)`. Other NPC types send `npcFuncClick(npcId)`. (H5 `npcFuncClick(npcId)` exists; needs the optional 2nd arg.)
- Server push that opens the panel: `initViewBankPanel` (no args) **(Go `npc_click.go:83`)** — it is a client method name (`BankPanel.initViewBankPanel`, `BankPanel.as:1827`); on wrong/missing password Go pushes `onNpcMsg(npcId, "Mật khẩu rương không đúng!")` / `"Vui lòng nhập mật khẩu rương!"` **(Go)**.
- `initViewBankPanel` body (1827-1856): sets visible; **if** `!enoughBank(1) && bankSlotNum < 5` opens `ConsumPanel` (`MAIN_CONSUMP`) with `msg = BANKPANEL_S[0].replace("{gole}", TBL_ITEM_TEMPLATE[324].gold)`, `useAble=true`, `itemData={type:29,id:324}`; panel positioned beside the bank. "Mua+dùng" there = `useItemGold({tid:324})` (see 3.5). So bank expansion item = template **324**, price = its `gold`.
- `initView` (6032-6048): if `!_dm.sInited` → `call("getInitSlot", Responder(setSlot))`, else `updateView()`. `setSlot(res)` = `_dm.initSlotData(res); updateView()`. So **bank items arrive inside the `getInitSlot` reply** (same keyed-by-item-id map; items whose `sid` is in 301..450). H5 `getInitSlot` currently returns bag+equipment only → delta.
- `updateView` (5187-5256): fills slot widgets from `sList` rows with `sid` in `(300, ARR[bankSlotNum]]` (`slotData=row; type=row.type; giid=row.itemId; stackNum=row.stackNum`), then enables page canvases/tab buttons: `bankSlotNum` 2 → pages 1-2 …; 5 → all. Tabs: `tabBtn0..4`.
- RPCs from the panel:
  - `moveItemToPage(srcSid, PAGE_TYPE_BANK=2, tab 1..5)` on drop onto a tab button (`BankPanel.as:5516-5520`; tab→number: tabBtn0→1 (5278), tabBtn1→2 (1680), tabBtn2→3 (2288), tabBtn3→4 (1675 dragEnter), tabBtn4→5). Fire-and-forget. Go resolves first empty slot in that page; bank tab > `bankSlotNum` rejected **(Go `bag.go:333-341`)**.
  - plain slot-to-slot drag inside/between bag and bank uses the same `moveItem(srcSid,dstSid)` (Slot.as:1001) — bank slots are bag-type `ItemSlot`s (**inferred**: `Slot.SLOT_BAG` branch has no bank exclusion).
  - `bagToBank(sid, 2)` on double-click of a bank item when `actionState == ST_BANK(9)` (`BankPanel.as:5293-5307`). The bag-side double-click (arg 1?) is in the aborted BagPanel (**unverified**). Go has **no** `bagToBank` handler (grep) → legacy server never supported it; H5 may ignore it or implement as move-to-first-free-slot.
  - `call("bankSort", null)` after Alert `BANKPANEL_S[3] "Xác nhận sắp xếp kho?"` (`BankPanel.as:2775-2795`); button disabled 30 s (Timer 30000). Result arrives as pushes (null Responder), **inferred** same as `bagSort` (`onItemSort`). Go has **no** `bankSort` handler.
  - `closeBank()` (no args, fire-and-forget) whenever `visible` goes true→false (1894-1909). Go: no-op. Panel `reset()` re-runs `initView` on next show.
- Strings: `BANKPANEL_S[0]` "Kho đã đầy. Xác nhận trả {gole} vàng để trực tiếp mở rộng kho?"; `[2]` "Ngân hàng"; `[3]` "Xác nhận sắp xếp kho?"; `BANKPANEL_U[0]` "Kho"; `[1]` "Sắp xếp kho"; `[2]` "Xếp"; `NPCFUNCPANEL_S[3]` "Mở kho"; `DELETE_BY_PASS[0]` "<font color='#fd4f1a'>Mã bảo vệ (Mặc định: 123456)</font>" (`Language.as:3181`), `[1]` "Mở khóa".
- Tables read: `TBL_ITEM_TEMPLATE[324]` (gold price). Panel `ViewManager.PANEL_BANK=330`.

### 1.4 Bag page expansion / payment prefs (BagPanel aborted)
- Strings only: `BAGPANEL_S[0]` "Túi đã đầy. Xác nhận trả {gole} vàng để trực tiếp mở rộng túi đồ?"; `[22]` sort help; `[23]` "Xác nhận sắp xếp túi đồ?"; `[24]` "Xác nhận trả {price} vàng để mua và dùng Sách Mở Rộng Túi Đựng Pet để tăng thêm 1 ô pet?"; `[26]` "Nhấp vào Mở Ô Chức Pet". Bag expansion item id is **not recoverable** from the client (probably 323, **inferred**, unverified).
- Tabs `BAGPANEL_U[15..21]` = "1".."7" (7 general pages) + `[12]` "N.vụ" (quest page) + `[13]` "Pet" (pet-item page) + `[14]` "Túi tiện dụng" (opens the convenience bag, see 1.5). `BAGPANEL_U[6..9]` Ngân phiếu / Bạc / Kim phiếu / Vàng (short: N.ph / Bạc / K.ph / Vcoin).
- Currency radios: `changeMoneyType(n)` — **awaited** (`Responder(onChangeMoneyType)`), reply `{flag:bool, num:int}`. Confirmed callers send **3** (`radioGoldBind`) and **4** (`radioGold`) (`compDragable/SystemShopPanel.as:2084-2100`); on `flag` true `onChangeMoneyType` calls `setDefaultGold(1)` for num 3, `setDefaultGold(2)` for num 4 (2223-2235, 1157-1187). The silver pair (1 = Ngân phiếu/bound, 2 = Bạc) is sent by the aborted BagPanel (**inferred** from H5 prefs `selectedMoneyType` 1 / `selectedGoldType` 3). Both radio pairs are disabled until the reply arrives.
- Gold/silver **lock**: `bagpanel.goldDisable()` / `silverDisable()` / `goldLockFlag` / `silverLockFlag` (BagPanel, aborted). Any gold or silver spend first calls `goldDisable()`; if locked the client shows `PANEL_INPUT.showInput(DELETE_BY_PASS[0], ACTIVEPANEL_S[38]" vàng mở khóa" | BAGPANEL_S[21]" bạc mở khóa", cb)` and awaits **`unlockMoney(MD5(pass))` → boolean** (ShopPanel.as:848-851 and ~60 other panels). On `true` the panel proceeds (`doBuy(true)`) and resets `goldLockFlag=false`. Server: verify secondary password, cache it (Go `shop/misc.go:19-43` returns `true`/`false`, on failure pushes a password-failure notice). `BAGPANEL_S[25]` "Vàng đã khóa, cần mở khóa trước!"; `PLAYER_S[23]` "Vàng đang khóa, cần mở khóa trước!".

### 1.5 Convenience bag ("Túi tiện dụng") + Ma Tâm bag — `compDragable/TempBagSlot.as` (panel id `ViewManager.POP_TEMP_BAG_SLOT=19700`, `ViewManager.as:478`; `PANEL_TEMPORARY_BAG=829` is the *other* reward bag, see end of section)
Two storages in one panel: **tBag** (gems/feathers/crafting/life materials; `TEMP_BAG_U[12]` titles the second as "Túi Ma Tâm tạm thời") and **tBag.mx** (monster-heart bag, drops go straight in; items id 5375..5697 / 5770..5841 per `Slot.as:1021`).
- State object `player.tBag` (`Player.as:150`), received by `getTBag`:
  `{tempbagNum:int (opened container slots, 0..5), tempSlotNum:int (total capacity), curNum:int, dire:bool, ot:bool, tempBag:{1..5:{tid, ot}} (installed container items), tempList:{pos(1-based):{t:tplId, n:count, b:bound, c:colour(1..5)}}, mx:{same keys}}` (`TempBagSlot.as:1020-1125, 1442-1469`). Display q = `c*5` (1100, 1118).
- RPCs (awaited unless noted):
  - `getTBag()` → tBag object (1682). Called on first show when `player.tBag` unset.
  - `openTempSlot()` → `uint` new `tempbagNum` (2096; handler `onOpenSlot` 835). Cost per next slot: `COST_ARR=[10,50,100,200,500]` gold indexed by current `tempbagNum` (634, 1837); max 5 (`slot_max` 113). Confirm text `TEMP_BAG_U[1]` "Xác nhận trả {cost} vàng để mở ô túi mới?". `openmxTempSlot()` identical for `mx` (779, 2086).
  - `tempBagSort()` / `mxBagSort()` / `oneKeyOpenAllMXTemp()` → full tBag object or falsy (`onTBagSort` 2349-2355 re-applies `onGetTBag`). 30 s hint in `TEMP_BAG_U[7]`; open-all Alert `TEMP_BAG_U[14]`.
  - fire-and-forget: `addtItemFromBag(bagSid, tab*100+pos)` (703/710/2417), `addmxFromBag(bagSid, mxtab*100+pos)` (1517/2190), `moveItemBtwTemp(fromPos,toPos)` (742/752), `movemxBtwTemp` (1556/1566), `tempToBag(pos)` / `mxtempToBag(pos)` (double-click, needs `enoughBag(1)`; 1655/768), `setTbagDire(bool)` (checkbox "Trực tiếp đặt vào túi tiện dụng" `TEMP_BAG_U[6]`; 1782), `delTempSlot(posId, pass)` (`compGameStage/StageMain.as:200-220`, `PANEL_INPUT` with `SLOT_U[0]` "Xóa vật phẩm"), `addItemFromTemp(pos, bagSid[, n])` / `addMXFromTemp(pos, bagSid[, n])` (`Slot.as:1031-1060`), `setTempBag(srcBagSid, tempSid)` / `setmxTempBag` to install a container item (`Slot.as:1169-1220`, confirms `SLOT_U[1,3]`, rejects `SLOT_U[4]`).
- Push: per-position update calls `UpdateSlot(pos, {t,n,b,c}|null)` / `UpdatemxSlot` (`TempBagSlot.as:1246, 852`), name of the push **unknown** (CallBack stub). Go uses a full-state push `updateTempBags(tBagData)` **(Go `tempbag.go:38,65,154`)** — unverified against client.
- Client gating (all server must replicate): capacity (`curNum >= tempSlotNum` → `TEMP_BAG_U[2]` "Vật phẩm đã vượt quá giới hạn."), item eligibility (`TEMP_BAG_U[3]`), stack merge only if same `t`, `b`, `c` and `n1+n2 <= stackMax`; mx bag only accepts monster-heart items (`TEMP_BAG_U[13]`). Container swap: only equal-or-more capacity (`SLOT_U[2]`), `tItemTmp.t < 0` (permanent) cannot swap to same size.
- Materials in this bag count toward crafting: `Core.getItemNum*` adds `tBag.tempList` counts (`system/Core.as:1514-1535, 1720-1730`); crafting RPCs carry `tempBagFlag` (see 4).
- Other temp-bag-like storage: **reward temp bag "Túi tạm thời"** (`compDragable/TemporaryBagPanel.as`, 30 slots, sid 1101..): `TEMPORARYBAGPANEL_U[0..2]`; RPCs `addSingleItemToBag(pos0)` (index−1101, line 548-556) and `addAllToBag()` (559); items `{ti, ii, n, q}` pushed (`warnTemporaryBag`, Go note) and warn badge `TemporaryBagWarnCanvas` ("Khi offline hệ thống sẽ tự làm hủy các vật phẩm trong túi tạm thời！"). Not part of the user's list but name-colliding.

## 2. Repair and durability

- UI entry points (all fire-and-forget; client never shows a cost):
  - Bag tool "Sửa chữa" sets mouse state `ACTION_REPAIR_NOWEAR=90`; Ctrl-click on the portrait tool sends `repairAll(1)` (`compMain/PortraitCanvas.as:591-607`). Help text `BAGPANEL_S[13]`: "...Thao tác này có thể tốn khá nhiều bạc hoặc ngân phiếu (Giữ phím Ctrl khi nhấp chuột sẽ có thể sửa toàn bộ trang bị)".
  - Shop panel buttons (`ShopPanel.as`): `SHOPPANEL_U[1]` "Sửa" (mouse state `ACTION_REPAIR_NORMAL=100`, 451-453, 550-563; ignored in battle), `SHOPPANEL_U[2]` "Sửa hết" → Alert `SHOPPANEL_S[3]` "Sửa chữa toàn bộ trang bị?" → `repairAll(2)` (1217-1223), `SHOPPANEL_U[4]` "Sửa hết (pet)" → Alert `SHOPPANEL_S[7]` → `repairPetEquAll(battlePetId, 1)` (831-838). `SHOPPANEL_S[1]` "Sửa chữa(người/pet)", `[2]` "Sửa chữa toàn bộ (người)", `[6]` "Sửa chữa toàn bộ(pet)".
  - Clicking an item with a repair mouse state (`Slot.as:743-787`): if slot `index` in 600..607 (pet equipment window) → `repairPetEqu(petId, itemId, mode)`, else `repair(slotData.id, mode)`; `mode` **1** for NOWEAR (bag tool), **2** for NORMAL (shop tool). `repair` accepts item instance id (bag or equipped).
  - Magic-weapon repair (`ACTION_REPAIR_MAGIC_WEAPON=91`) uses `magicWeaponAutoRepair(id, stoneSlot)` with item `ITEM_DARKBLUE_STONE=2330` — out of scope.
- Arg contract: `repair(itemId:number, mode:1|2)`, `repairAll(mode:1|2)`, replies not awaited; money change arrives through `onUPP` (**Go** `item/misc.go:41-58`; Go ignores `mode`, cost = `(maxEndure-endure)*10` silver, `service.go:1626-1634`, **simplified — real formula unknown**). The client refreshes durability from the pushed item DTO (`endureLeft`/`endureMax`); which push carries it is **unknown** (H5 should push `onAddCharactorSlot` for each repaired item; flagged).
- Durability display: tooltip line `TIPEQUIP_S[22]` "Độ bền: {endureLeft}/{endureMax}" (`TipEquip.as:3376-3395`); `toFixed(1)` for gather-glove equipment (`ProductPanel.isGloveEquip`); whole line red when `endureLeft == 0`. Template also has `endureMax` (`TIPEQUIP_S[13]` "Độ bền tối đa: {endureMax}"). Dress kind has no durability line. Pet combat gating uses `<10%` / `<=0` durability (`UserBarCanvas.as:1042-1053`; `CHARSELECTCANVAS_U[35,36]`).
- Bag `Sửa chữa` was a "Deferred" disabled button in H5 (inventory.md); no price display exists in legacy — the toast result is the only feedback.

## 3. Shops beyond NPC buy

### 3.1 Tables, tabs and the shop-config push (system shop / "mall", Vcoin)
- Tables: `TBL_SHOP=53` indexed by `name`; `TBL_SHOP_SLOT=51` indexed by `sid` (primary) and `st` (secondary) (`GamePredef.as:544-546, 8367-8369, 8455`); `TBL_CREDIT=107` indexed by `shopId` (8397).
- Slot row keys used by the client: `id, sid, st, position, type, itemId, gold, money, point, gt, quality/q, pType1/pNum1/pType2/pNum2, sale, amount, r, tid` (list from H5 `ShopSlotView` + VIP doc; key parse in `CallBackGlobal.as:90-154`).
- **Pushes** (only readable pushes, `system/CallBackGlobal.as`): `onGetShopConfig`, `onGetLimitShopConfig` (36-49, 270-283): payload `[code:int (0 = ok), msg:string, list:string[]]`, each string `"<n>;obj.id='1';obj.st='3';obj.sid='35';...;"` → `parseAndSetShopSlot` (90-154) patches/creates `TBL_SHOP_SLOT` rows (re-indexes when `st`/`sid` changes; `position` never overwritten). `onGetRemainShopConfig` (358-365) is a no-op that only logs errors.
- Triggers: `onLineList` handler calls `global.call("getShopConfig"|"getLimitShopConfig"|"getRemainShopConfig", null)` on the **global** connection (237-243); `Core.startGame` also sends `remote.call("getShopConfig", null)` (`Core.as:1852`). All replies are the pushes above (fire-and-forget). Go sends empty lists `[0,"",[]]` **(Go `shop/config.go:104-130`)** → H5 can send the same empty payload or skip (static rows already ship client-side in legacy; in H5 the server resolves rows itself).
- `getRemainShopConfig` is also **awaited** with arg slotId in `TipItem.as:450` (`Responder(cb)`) to show remaining limited stock (reply shape not visible; **open**).

### 3.2 System shop panel (`compDragable/SystemShopPanel.as`, `PANEL_SYSTEM_SHOP=550`)
- Tabs (`initTabs` 1326-1374): by `st` — Hot `"1"`, Discount `"2"`, Limit `"3"`, New `"4"` (`SHOP_SELL_TYPE_*`, `GamePredef.as:1529-1533`; `"5"` = HIDE never listed, 1726); by shop name via `getShopListByName(SYSTEMSHOPPANEL_S[n])` — Pet `[5]`, Treasure `[1]`, Material `[2]`, Jewel `[0]`, Scroll `[3]`, Book `[4]`, Point `[15]`, Dress `[6]`, Flyer `[7]` (NB: `SYSTEMSHOPPANEL_S[0..10]` are still Chinese: 商城宝石, 商城宝物, 商城材料, 商城卷轴, 商城书店, 商城宠物, 商城时装, 商城飞行器, 商城积分 — the shop `name` column in `TBL_SHOP` holds these keys); Search, Limit-time, Trolley.
- `addDataToList` (1707-1741): skips `st == 3` rows whose `sid` is not in `GamePredef.SYSTEM_SHOP_ID=[35,36,41,65,66,67,70,81,88,89]` (1973, 1724) and `st == "5"` hidden rows; sorted by numeric `position`.
- Buy: select slot → `buy()` (2416-2429): if `bagpanel.goldDisable()` prompt `unlockMoney`; then `doBuy(true)` (1919-1960) opens NumPanel (`TYPE_BUY`) → `buySelected(n)` → **`buySystemItemClient(shopSlotId, n)` fire-and-forget** (`SystemShopPanel.as:2796-2798`; same call in `ConsumPanel.as:366,486`, `FuncBag.as:640`, `EquipFuncBag.as:1744`, `EquiptFuncPanel.as:13299`; awaited variant `call("buySystemItemClient", Responder(onBuyDisc), slotId, 1)` in `GameIntroPanel.as:4382`). Results arrive as the same pushes as NPC buy: `onBlueMsg`/`onRedMsg`, `onUPP`, `onAddItem`, one `onAddCharactorSlot` per changed slot (shop-system.md).
  Currency: `gold` column = vàng; Kim phiếu (bound gold) selected via `changeMoneyType(3|4)`; `SYSTEMSHOPPANEL_U[21]` "Mua xong sẽ khóa", `SYSTEMSHOPPANEL_S[16]` "Vật phẩm mua bằng kim phiếu sẽ bị khóa". Point shop rows (`point > 0`) need `player.exPoint >= point` else Alert `SYSTEMSHOPPANEL_U[61]` "Không đủ điểm đổi"; confirm `SYSTEMSHOPPANEL_U[60]` "Xác nhận dùng {num} điểm thưởng để mua vật phẩm" (`handler` 2813-2843).
- **Limited-time shop**: `call("getLimitTimeShop", Responder(onGetLimitTimeShop))` (2568; `RPC_DELAY` 60 s). Reply = map of rows `{id, tid, gold|point, startTime, endTime, ...}`; client sets `type=tid` (1220), time via `parseAndSetTime`. Buy: `buyLimit()` Alert `SYSTEMSHOPPANEL_U[24]` "Trả {num} vàng để mua vật phẩm này" → `buyLimitSelected(n)` → **`call("buyLimitTimeItem", null, slotId, n)`** (2443-2446); `tid == 12` forces qty 1 (1946). Go registers **neither** `getLimitTimeShop` nor `buyLimitTimeItem` (grep) → legacy server never implemented; low priority. The `getLimitShopConfig/updateLimit` names in the brief are different RPCs (3.1 and 3.4).
- **Trolley** (`SystemShopTrolleyPanel.as`, tied to the "đầy xe" promo in `GameIntroPanel`): `buySystemItemMulti(buyList:{shopSlotId:num}, carStyle:0|1)` awaited with `Responder(handleCallback)` (`SystemShopTrolleyPanel.as:330-343, 840-862`); gold lock must be open (`clickLock(2)`); confirm `SYSTEMSHOPPANEL_U[40]` "Bạn cần trả tổng cộng {totalGold} vàng, xác nhận mua?". Go accepts map or list shapes **(Go `purchase.go`)**; reply shape unknown (**open**). Promo-only → defer.
- Strings: `SYSTEMSHOPPANEL_U[0..9]` tab labels "H\no\nt","S\na\nl\ne","N\ne\nw","Pet","Quý","Ng.liệu","B.thạch","Sách","Thức ăn","Điểm"; `[15]` "Skill"; `[16..17]` "Tất cả"; `[19]` "Số\nlượng"; `[20]` "Li\nmit"; `[22]` "Kết thúc: {hour} giờ {minute} ph…"; `[25]` "Xe hàng"; `[28]` "Tổng giá: "; `[46]` "Thời trang"; `[47]` "Vật phẩm bay"; `[48]` "Dò tìm"; `SYSTEMSHOPPANEL_S[11]` "Các vật phẩm bán trong shop đều có thể có được khi chơi game"; `[12]` "Tất cả vật phẩm bán trong sho…" (truncated).

### 3.3 VIP shop (`compDragable/VipShopPanel.as`, `PANEL_VIP_SHOP=855`, `VIP_SHOP_ID=99`, refresh gold 20: `GamePredef.as:1557-1558`)
- Requires `player.pmLevel > 0` else Alert `VIPSHOPPANEL_U[14]` "Chỉ có VIP mới có thể sử dụng Shop VIP!" (`VipShopPanel.as:782-792, 1213-1221`). `pmLevel` = VIP/PM level (H5 has no VIP yet → whole feature **blocked on VIP system**).
- `call("getVipShopConfig", Responder(onGetVipShopConfig))` (1062-1071) and `call("getVipShopCharConfig", Responder(onGetVipShopConfig))` after Alert `VIPSHOPPANEL_U[13]` "Xác nhận tốn {gold} vàng để làm mới shop?" (782-801). Reply `{flag:bool, vipShop:{n:slotRow}, reflashTime:number(ms), shopDynamic:{...}}` (558-598); `flag=false` → Alert `VIPSHOPPANEL_U[11]` "Sự kiện đã bắt đầu!" (**sic, as in source**). `VIP_SHOP_SLOT_NUM` slots shown; rows carry `type,itemId,stackNum,st`.
- `call("buyVipShopItem", Responder(onBuyVipSlotSelected), slotId, n)` → `{flag, shopDynamic}`; `flag=false` is silent (628-637). Buy confirm needs gold unlock (`unlockMoney`) then NumPanel. Strings `VIPSHOPPANEL_U[10]` "Xác nhận mua？", `[18]` "Vật phẩm này chỉ được mua 1 lần!", `[19,20]` "Xác nhận dùng {gold} vàng mua vật phẩm này?", `[15]` "Hôm nay không làm mới vật phẩm!", `[6]` "Thời gian làm mới lần sau:{time}", `[7]` "{name} mua {item}", `[0]` "Shop VIP", `[1]` "Làm mới".
- Rules (rotation, discounts) are server-only; see Go `docs/memory/vip-shop.md`. Defer until VIP exists.

### 3.4 Credit / exchange shops ("NpcShopPanel", special-shop NPCs)
- `NpcShopPanel.updateView(shopId)` (`NpcShopPanel.as:299-329`): first `call("updateLimit", Responder(onUpdateLimit))`; rows from `TBL_CREDIT[shopId]` filtered `isSell != 0`, grouped by `tab`, sorted by `position`. `onUpdateLimit` (372-383) stores `{dayDict, weekDict, monthDict, totalDict}` into `player.creditDayDict/WeekDict/MonthDict/TotalDict` (maps creditId → used count).
- Shop configs `ViewManager.NPCSHOP_CONFIG` (`view/ViewManager.as:379-`): ids `"1"` Shop Kết Tinh (`prop` `wisdonCrystal`), `"2"` courage/Dũng Khí (`couragePoint`), `"3"` `heroScore2507`, `"4"` `anni2017`, ... `"9"` `tkyyhpointV2`. Each shop shows a player property as currency (`updateCurrency` 272-281). These are event-currency shops → defer unless the H5 character has these props.
- Exchange: `call("exchangeItem", Responder(onExchangeItem), creditId, n)` (`NpcShopItemDisplay.as:200-242`). Reply = the updated usage dict for the row's `limitType` (1 day, 2 week, 3 month, 4 total) → stored into the matching `player.credit*Dict`. Client gating (488-540): remaining = `limitNum - used` (`getLeftNum` 244-290; `limitType <= 0` → unlimited 9999); 0 left → Alert `NPC_SHOP_PANEL[211]` "Lượng đổi đã đạt mức giới hạn"; equipment rows (`type == 19`) exchange exactly 1 with Alert `NPC_SHOP_PANEL[208]` "Xác nhận dùng {num} đổi {num1} {name}?", others ask a number via `showInputNum(NPC_SHOP_PANEL[209] "Nhập số lượng đổi {name}", [210] "Đổi Điểm", ...)`. Row keys: `itemId, type, cNum1 (cost per unit), limitType, limitNum, tab, position, isSell`.
- Opening push: `openShopById(shopId)` (Go note) vs `onOpenShop` for `TBL_SHOP`; the two shop-id spaces overlap (shop-system.md). `openShopDirect(shopId)` is **awaited-less** `call("openShopDirect", null, id)` fired from pet arena panels (`PetArenaPanel.as:1948` id 98, `PetArenaActivityPanel.as:1920` id 115); client then expects `onOpenShop`-style open (`ShopPanel.showDataDirect(shopId)`, 411-439, sets `currentNPCID=-1`).
- `shopClosePanel()`: fire-and-forget when ShopPanel visible true→false (`ShopPanel.as:1246-1256`); `onOpenShop` payload `{hide: npcId}` hides it if `hide == currentNPCID` (503-509).

### 3.5 Buy-and-use (`ConsumPanel`)
`ConsumPanel` (200x144 popup) resolves a `TBL_SHOP_SLOT` row by `type`+`itemId`+`gold > 0` (`itemData` setter 349-362). Button "mua+dùng" → gold-unlock check → **`useItemGold({tid})`** fire-and-forget (`ConsumPanel.as:223-239`). Plain buy: `buySystemItemClient(shopSlotId, n)`. Same RPC `useItemGold({tid, mid})` is used by teleports (`Player.as:501-508, 656-663`, `mid` = map id).

### 3.6 NPC shop details (delta vs H5)
- Sell: `sellItem(itemId, md5Pass?)` fire-and-forget (`ShopPanel.as:592-597`) triggered by **dropping a bag slot on the shop panel** (762-800) or Ctrl+double-click. Items with template `color > 2` require the secondary password: cached `_core.delPass` → just Alert `SHOPPANEL_S[0]` "Xác nhận bán vật phẩm này?", else prompt (`BAGPANEL_S[20]` "Bán vật phẩm") then `MD5.hash`. 2 s later the HUD number display refreshes. H5 `sellItem(itemId)` lacks the optional password.
- Buy: `buy()` (845-909): if slot `gt == 1` and slot `gold > 0` requires "gold" radio selected (else Alert `SHOPPANEL_S[8]` "Mua vật phẩm này cần trả vàng, vui lòng đánh dấu trả bằng vàng"), same for `money`/`SHOPPANEL_S[9]` bạc; otherwise lock checks and `unlockMoney`. Page size 12 for shop type 1, 9 otherwise (73-74). Auto-opens the bag beside it and closes it on hide (1296-1312, 536-548).
- Shop slot stock: `ShopSlot` shows `currentAmount` (−1 = unlimited, 0 = sold out; `comp/ShopSlot.as:347-350`); `NumPanel.as:302` `call("buyAmountItemClient", Responder(cb), shopSlotId, n)` → remaining amount (already ported, returns −1).

## 4. Crafting

### 4.1 Equipment crafting ("Chế tạo", `EquiptFuncPanel`, tab 0)
- Recipe source: **not** `TBL_RECIPE`; it is `TBL_EQUIPT_TEMPLATE` rows with `makable == 1`, grouped by `type` (tree: kind → type) and filtered by class (`reqClass` contains `"|<classId>"`, for jewelry types 400..403 `reqClassId`) (`EquiptFuncPanel.as:11481-11519`). Required materials per row: `requireItem1..3` (item template ids) and `requireNum1..3` (`makeListChange` 8627-8664). List sorted by `reqLevel`; `TBL_CLASS` rows feed the class combo ("Chọn nghề" `EQUIPTFUNCPANEL_S[65]`).
- Player picks 3 input slots (`makeInputItem1..3`, bag or convenience-bag). `canMake()` (7865-7887): for each slot, if required `type > 0` the dropped item's `type` must equal `required.type − 1` (non-temp) / have any type (temp). Level-6 material needs equipment `reqLevel >= 61` (`EQUIPTFUNCPANEL_S[64]` "Chỉ có trang bị cấp 61 trở lên mới có thể dùng nguyên liệu cấp 6!"; set by `onGetMakeColor` when `flag == 1`, 8864-8870).
- **`getMakeColor(materials, equipTemplateId)`** — awaited, fired on every input change when `canMake()` (4335-4378). `materials = {1:{tempBagFlag:bool, idx:number}, 2:..., 3:...}`: `idx` = item instance id when `tempBagFlag=false`, convenience-bag **position** when true; absent slots omitted. Reply (8846-8874): `{canMake:bool, colorPerList:{makePer1..makePer4: number}, flag?:int}`. `canMake` → shows 4 percentages "NN%" and enables the Chế button; else disables, and `flag == 1` toasts `EQUIPTFUNCPANEL_S[64]` (`sysMidNote` + `sysMsg`). (4 buckets = green/blue/purple/orange, per Go note.)
- **`newMake(materials, equipTemplateId)`** — awaited, same `materials` shape (10787-10821). UI first plays a 2 s progress bar "Đang chế tạo..." (`EQUIPTFUNCPANEL_S[1]`, `progressBar.showByTime(2)`, 9554-9564) and `setTimeout(startNewMake, 2000)`; panel disabled until done. Reply `{flag:bool}` (10540-10550): `true` → `makeListChange(false)` (re-reads requirements); `false` → `sysMidNote(EQUIPTFUNCPANEL_S[2])` "Vui lòng xác nhận số nguyên liệu đặt vào và đảm bảo có ít nhất 1 chỗ trống trong túi đồ!". Result item and material consumption arrive via inventory pushes (`onAddCharactorSlot` / `onDelCharactorSlot` / `onUpChaSlotStackNum`, Go).
- Gold/silver: cost formula `reqLevel^2 * MONEY_EQUFUNC_MAKE(10)` is client-visible only for pet-equipment level-up / recolor displays (`EquiptFuncPanel.as:8187, 12804`); for `newMake` no cost is shown (server-side). `GamePredef.as:1416-1421`: `MONEY_EQUFUNC_STAR=200, DIG=2000, MAKE=10, NAME=10000, ELEMENT=30000, ACTIVE=50000`.
- Strings: `EQUIPTFUNCPANEL_U[28]` "Tạo", `[1]` "Chế", `[0]` "Tự đặt ng.liệu", `[30]` "Nguyên liệu cần", `[31]` "Đặt nguyên liệu", `[32]` "Tỷ lệ phẩm chất", `[35]` "Mua nguyên liệu" (`EQUIPTFUNCPANEL_S[35]`).

### 4.2 Material combining ("Nguyên liệu" tab: `materialMixOne/All`)
- UI `materialMixNum` stepper min 2 max 5 default 5 (`EquiptFuncPanel.as:851-860`). Displayed success = `num * rate` where `rate = 20`, or `6` for colour-4 (orange) materials: temp-bag items use `q/5 == 4` (8325-8335), bag items fetch `gdc(TBL_ITEM_INSTANCE, itemId)` and read `data.color == 4` → `0.3*20 = 6` (8340, 9589-9603). VIP (`pmLevel>0`) adds `TBL_PM_RIGHT[id 8].value<pmLevel>` percent when rate is 6 (12587-12615) — display only; server must apply the same bonus **(inferred)**.
- RPCs, both awaited, same shape (8442, 11687): `materialMixOne(num:2..5, itemRef:number, tempBagFlag:bool)` and `materialMixAll(num, itemRef, tempBagFlag)`; `itemRef` = item instance id, or convenience-bag **position** when `tempBagFlag`. Reply (10098-10134): `{slotId, num (remaining stack), flag:bool, finalNum:int}`; client matches `slotId` against `slotData.id` (bag) or `slotData.idx` (temp), sets stack or cleans slot; `flag && finalNum` → toast `EQUIPTFUNCPANEL_S[11]` "Dung hợp thành công {finalNum} nguyên liệu!", `flag && !finalNum` → `[13]` "Dung hợp thành công 1 nguyên liệu!", `!flag` → `[14]` "Dung hợp nguyên liệu thất bại!". Buttons disabled until reply; button enabled only if `stackNum >= num` (14341-14353). Go formulas: `num*20%`, orange `num*6%` (item-inventory.md).
- Tooltip/help `EQUIPTFUNCPANEL_S[42]`: same colour and bound state required; level-6 mix success 30% (client text says "xác suất thành công khi dung hợp nguyên liệu cấp 6 là 30%", differs from Go's 6%/num — flag).
- Gem upgrade ("Bảo thạch" tab): `jewelUpdateOne(num:2..5, itemRef, tempBagFlag)` / `jewelUpdateAll(...)` (14279, 9015), same reply as mix (`onJewelUpdate` 13786); toasts `EQUIPTFUNCPANEL_S[15,17,18]` "Thăng cấp thành công {finalNum} bảo thạch!" / "...1 bảo thạch!" / "Thăng cấp bảo thạch thất bại!". Max gem level 5 (`[44]`).

### 4.3 Life-skill cooking / medicine (`compDragable/LifeSkillPanel.as`, separate NPC types `NPC_TYPE_MAT`, `NPC_TYPE_PLAN`)
- `newCook(materials:{1..3: itemInstanceId}, skillId, SKILL_TYPE_COOK=17)` (1157-1175) and `newMedicine(materials, skillId, 18)` (1116-1134), awaited; reply truthy ⇒ client subtracts required counts from the input slots and (for "all") repeats while stock allows (`onNewCook` 1050-1098, `newCookAll` 2283-2299). Progress bar 2 s "Đang làm..." (`LIFESKILLPANEL_S[53]`).
- Recipe source: skill row selected from the list (`TBL_SKILL` rows with `id`, `useItemId`, `useItemType`, `isLearned`); required materials come from the **result item template** `TBL_ITEM_TEMPLATE[useItemId].i1..i3` and `n1..n3` (`cookListChange` 2162-2209). Learned skills via `call("initLearnedSkill", Responder(onInitLearnedSkill), null)` → map `{k:{sid}}` (2217-2261). Defer (needs life-skill system).
- Decoration "Hồn Khí" crafting limit: `call("onGetMakeLimitTimes", Responder(updateLimitMakeTimes))` and `addLimitMakeTimes` (`DecoratePanel.as:4230, 7960, 10168`) belong to the royal soul-weapon panel (`DECORATE_PANEL[0]` "Hồn Khí Vương Tộc"); **not** equipment crafting; reply shape in `DecoratePanel.as:9400` (**not read**, defer).

## 5. Equipment upgrades ("Lò luyện", `EquiptFuncPanel` + aborted `EquipFunc`)

Panel structure (Language `EQUIPTFUNCPANEL_U`): top tabs Trang bị (`[21]`) / Vật phẩm (`[22]`) / Thần khí (`[71]`) / T.bị pet (`[72]`); sub-tabs for human equipment `[59..70]`: Thăng tinh, Khảm nạm, Nguyên liệu, Bảo thạch, Cải tạo, Đục lỗ, Thăng cấp, Chữ ký, Đổi ng.tố, Đổi l.hồn, Đổi khóa, Phân giải. In this panel "khóa" = **bound** (`binded=1`).
Only the pet-equipment star tab (`tabA.selectedIndex == 5`, `isPetEqu` gate, `EquiptFuncPanel.as:10339-10355, 12668-12701`) and material/gem mix/crafting are visible; the rest below is **from Go + Language** and flagged.

| Function | RPC (arg order) | Reply / pushes | Source |
|---|---|---|---|
| Star (single) | `starOne(stoneCount:1..5, equipId, stoneItemId)` awaited | `{equSlotId, starSlotId, num, starNum, flag}`; toast `EQUIPTFUNCPANEL_S[4]` "Thăng tinh thành công lên {starNum} sao!" / `[6]` "Thăng tinh thất bại!" | client (pet tab) `EquiptFuncPanel.as:12684, 4909-4940`; shape also Go |
| Star (auto) | `starAll(stoneCount, equipId, maxTarget:1..10, stoneItemId)` awaited | same | `:7968` |
| Star level | `getStarNum(equipId)` → int | `onGetStarNum` sets `starNum` (`:12816`) | `:10347`; also `WingFuncPanel.as:3025` |
| Gem upgrade | `jewelUpdateOne/All(num, itemRef, tempBagFlag)` | see 4.2 | client |
| Hole count | `getHoleNum(equipId)` → `{holeNum, flag}` | — | **Go** `hole.go:15-45` |
| Dig hole | `holeDig(diamondItemId, equipId)` | `{equSlotId, diamondSlotId, num, flag}` + `onAddCharactorSlot`/`onDelCharactorSlot`, `onUPP` | **Go** `hole.go:47-160`; UI strings `EQUIPTFUNCPANEL_S[19,21,23,24,25,26]` ("Chỉ có trang bị khóa mới có thể đục lỗ!", "Đục lỗ thành công!"…); guide `[46]`: ≤10 holes, bound equipment only, diamond level 1..5 digs holes 1-2/3-4/5-6/7-8/9-10, 100% success, 2000 vàng-class cost `MONEY_EQUFUNC_DIG` (**client constant only; server uses it?** unverified) |
| Socket gems | `jewelSet(equipId, {holeIdx(1..10):{idx, tempBagFlag}})` → int count set | `onAddCharactorSlot` (+ stack updates) | **Go** `gem.go:43-142`; UI `[7]` "Xác nhận khảm nạm?", `[8]`, `[9]` "Khảm nạm thành công {successNum} bảo thạch!"; gem = template `type 503` |
| Remove gem | `jewelDel(equipId, holeIdx)` | `onUPP`, `onAddCharactorSlot` (returned gem + equip) | **Go** `gem.go:144+`; fee 20% of gem value (`[39]` guide), confirm `[66]` "Xác định dùng {gold} vàng để tháo gỡ: {name}?", `[67,68]` |
| Gem data | `getJewelData(equipId)` | `{holeNum, ...}` | **Go** `gem.go:20-41`; tooltip reads inst `holeNum` and `t1..t10` (gem template ids, `TipEquip.as:3259-3285`, `TIPEQUIP_S[35,36,37]`) |
| Resolve | `equResolve(equipId, passMD5)` → truthy/falsy | `onAddCharactorSlot` (materials) then `onDelCharactorSlot(equipId, sid)` | **Go** `resolve.go:18-108`; UI `[63]` guide, `[69]` "Xác nhận phân giải trang bị này?", `[70,71]`, `[77]` "Phân giải thành công, nhận {itemNum} {itemName}!" (magic weapon variant uses `magicWeaponResolve`) |
| Signature | `changeName(equipId, materialRef, tempBagFlag)` | `{f:true, ii, n}` / `{f:false}`; `onUPP{money}`, `onAddCharactorSlot` | **Go** `maker.go`; `[50]` guide: purple+ bound, 1 level-4 material + `MONEY_EQUFUNC_NAME` 10000 silver/ngân phiếu; `[27]` "Đổi chữ ký thành công!"; tooltip suffix `TIPEQUIP_S[23]` " chế tạo" (`inst.maker`) |
| Element | `changeElement(equipId, materialIdx, tempBagFlag)` then `sureChangeElement(decision)` | `{f, ii, n, e, b, ei}` then `{f:"true"/"false", e}`; `onAddCharactorSlot`, `onInitViewProp`, `onEquipActiveList` | **Go** `change_element.go`; `[51]` guide (bound, level-5 material, 30000), `[30]` "Thay đổi nguyên tố thành công thành: " |
| Soul | `changeSoul(equipId, materialId, mode 1|2)` then `sureChangeSoul(decision)` | `{f, type:"1"/"2", ii, n, ap, apn, apro, apropnum, apropnu}` / `{f:"true", activeProp, activePropNum}` | **Go** `change_soul.go`; `[72]` guide: "Đổi hoàn toàn" 1 stone + 50000, "Đổi một phần" 2× cost keeps type; buttons `[52]` "Đổi 1 phần" / `[53]` "Đổi hết"; `[55]` "Đổi linh hồn thành công thành: " |
| Bind props | `changeBind(equipId, materialIdx, tempBagFlag)` then `sureChangeBind(decision)` | `{f, ii, n, b1, b11, b2, b12, mainProp1, mainProp2}`; confirm `{f:"sure"}` | **Go** `change_bind.go`; `[57]` guide 30000; `[58]` "Đổi thành công thuộc tính khóa: " (the client **pet** counterpart `petEquModBind` is visible at `:9258, 10061, 13951`) |
| Prefix / quality | `changePrefix({e, i1:{flag,idx}, i2, i3})` then `sureChangePrefix(decision)` | per Go note (crafting-system.md) | **Go** `change_prefix.go`; guides `[48]`, `[73]`; `[74]` "Thay đổi chất lượng thành công!", `[75]` "Phẩm chất trang bị của bạn đã là tối đa!", `[100]` "Vui lòng đặt nguyên liệu cùng cấp!", `[101]` "Trang bị cam cần sử dụng nguyên liệu đều là cấp 5 hoặc đều là cấp 6" |
| Tier up | `changeLevel({e, i1, i2, i3})` | `{f:true, e:oldId, i:newId, n:dto, sid}` | **Go** `change_level.go`; strings `[33]` "Thăng cấp thành công!", `[34]` "Vui lòng đặt chính xác trang bị và nguyên liệu!"; cost `reqLevel^2 * 10` (consistent with client display for pet equip `EquiptFuncPanel.as:8187`) |
| Bind item | `bindItem(itemInstanceId)` (fire-and-forget) | `onChangeEquiptInst` / `onCreateItemInstance` + `onAddCharactorSlot` | client `Slot.as:724-726` (bag "Khóa" tool, `ACTION_BIND`); Go `bag_manage.go:133-173`; help `BAGPANEL_S[9]` ("...thao tác này có thể sẽ làm cho vật phẩm xuất hiện thuộc tính mới") |

Star constants (client): `EQUIPT_STAR_MAX=10`, `EQUIPT_STAR_SUCCESS=[100,100,100,90,80,70,60,50,30,30,30]` indexed by *target* star (`GamePredef.as:1425-1426`; displayed `int(SUCCESS[star+1]*basic/5)`, `EquiptFuncPanel.as:10415`), buff variant `EQUIPT_STAR_SUCCESS_BUFF=[100,100,100,100,100,95,80,70,45,45,45]` when long-buff 3263 is on (`:10420-10424`, 1427), `EQUIPT_STAR_NUM` multipliers `[1,1.1,1.21,1.33,1.46,1.61,1.77,1.94,2.14,2.36,2.6]` (1424). Confirm Alert `EQUIPTFUNCPANEL_S[102]` is shown when equipment is unbound but star stone is bound (turns equip bound; string index 102 is **missing from Language.as** — gap). A special event rate table `GamePredef.MC_BIRTH_CONFIG[8]` replaces rates when `MC_BIRTH_FLAG[8]`.
Quality multipliers `EQUIPT_QUALITY[q]` (q 1..25, 1.05 … 3.5+) at `GamePredef.as:9762+`.

## 6. Runes ("Phù Văn", `DecoratePanel`, `TBL_DECO_RUNE=119`, `TBL_RUNE_CHIP=124`) — light
- All in `compDragable/DecoratePanel.as` + `comp/Rune*.as` (panel title `DECORATE_PANEL[0]` "Hồn Khí Vương Tộc"; tabs `[1]` Hồn Khí / C.Hóa H.Khí / Phù Văn / Mật Bảo). Constants `RuneSlot.CHA_RUNE_SET=0`, `PET_RUNE_SET=1` (`RuneSlot.as:22-23`); slot types `Slot.SLOT_RUNE_UP=39, CHA=40, PET=41, CHA_HOLE=42, PET_HOLE=43`.
- RPCs (drag & drop in `RuneSlot.dragDropHandler`, `RuneSlot.as:55-140`):
  - `runeSet(bagPos, holePos, setType 0|1, decoPosition)` awaited → `decoInfo`; `runeRemove(holePos, bagPos, setType, decoPosition)` awaited → `decoInfo`; `runeMove(fromPos, toPos, setType)` fire-and-forget (−1 = the "upgrade input" hole: bag→hole `runeMove(bagPos,-1,set)`, hole→bag `runeMove(-1,bagPos,set)`; only rune `kind` 1 → character bag, 2 → pet bag, else Alert `DECORATE_PANEL[49]` "Chỉ được đặt vào túi phù văn cùng loại").
  - `getRuneBagData(cid)` awaited → `{chaBag:{pos:rune}, petBag:{pos:rune}, upLvlHole?, ...}` (`RuneBag.as:658-669, 786`); `arrangeRuneBag(cid, bagType)` fire-and-forget (`:732`).
  - `runeUpLvl()` awaited → bag update `{..., upLvlHole:runeId}`, `onRuneBagUpdate` (`DecoratePanel.as:4918-4946, 10249`), exp label `DECORATE_PANEL[45]`; `runeResolve(runeObj, bagType)` fire-and-forget (`RuneClickBag.as:751`); `exchangeRune()` fire-and-forget (chip→rune, `RuneChipBag.as:788`).
- `decoInfo` stored in `player.decoInfo` (`DecorateLogic.updateDecoInfo`, `DecorateLogic.as:18-26`). Defer; depends on the Hồn Khí/decoration system (not in M0–M4).

## 7. Misc item actions (`object/Player.as`)
- **Teleport scrolls**: `useTransport(mapId, useItemFlag:bool)` (`Player.as:2162-2173`, plus name-based `1372`, `CharactorInfoPanel.as:2985` passes `false`), `useTransportGroup(mapId)` (leader "Nhóm" path, `transGroup` 482-541). Client picks first: any non-senior/senior scroll in bag → `useTransport(mapId, false|true)` with Alert `WORLDMAPICON_S[1]` "Dùng Tiêu Diêu Phù sẽ đến được đây, xác nhận sử dụng?"; no scroll → Alert `WORLDMAPICON_S[0]` "Bạn không có Tiêu Diêu Phù, xác nhận mua và dịch chuyển?" (senior `[2]`/`[8]`, group `[3]`/`[4]` "Cá nhân"/`[5]` "Nhóm") → gold lock check (`PLAYER_S[23]`) → **`useItemGold({tid:ITEM_TRANSPORT(1036)|ITEM_TRANSPORT_SENIOR(2947), mid:mapId})`** (`Player.as:501-508, 656-663`; skipped when `inBattle` or `taskSweep`). Item ids (`config/ItemConfig.as:26-38`): regular 1036, month 1363, half-month 2946, week 1515; senior 2947, week 2948, half-month 2949, month 2950, week-true 3722, day 4942, half-day 4941. Wrong map name → `PLAYER_S[20]` "Vui lòng chọn bản đồ chính xác cần đến." H5 note: Go's priority list (inventory-notes) includes 1036,1363,2946,1515 first.
- **changeNameByCard(newName)** (`Player.as:1114`): item `ITEM_RENAME_CARD=2126`; client validation `haveSpecialStr` (`CHARACTORPANEL_S[11]` "Tên mới chứa ký tự không hợp lệ, vui lòng kiểm tra lại!"), `haveSpecialStr2` (`CHARSELECTCANVAS_S[19]`), `haveBadWord`; input prompt `CHARACTORPANEL_S[9]` "Nhập tên mới (giới hạn 12 ký tự)" / `[10]` "Đổi tên". Fire-and-forget. `changeName` (equipment signature) is a different RPC.
- **useRedBag(slotId)** (`Player.as:1095`): item `WEDDING_RED_BAG_1=1710` (wedding system) — note only.
- `useRadar(npcName)` (`Player.as:1313`), `useSeek(name)` (`:770`, `EnemyHBox.as:230`, `CharactorInfoPanel.as:1836`), `useTrack(id|name)` (`:1705`, `EnemyHBox.as:156`, `CharactorInfoPanel.as:1124`) — note only (radar → `onNpcPos`, Go).
- `itemToTarget(slotId)` for `ITEM_TYPE_TARGET_ITEM` (`Player.as:906-908`), `useItem(targetType, petId, slotId)` already in H5.

## 8. Delta vs H5 and proposed shared types

Already in H5 (`server/src/modules/inventory/*.rpc.ts`, `shop.rpc.ts`): getInitSlot, moveItem, moveItemNum, dropItem, bagSort, equipOn/Off, useItem, fullHp/MpRecoverByItem, buyAmountItemClient, sellItem. Everything below is new.

Server-side modules (proposed): `modules/inventory` (bank/pages/temp bags/repair), `modules/shop` (system shop, unlockMoney, changeMoneyType, credit shops), new `modules/forge` (craft, mix, star, gems, upgrades) and later `modules/rune`. Client: `client/src/ui/bankPanel.ts`, `tempBagPanel.ts`, `forgePanel.ts`, `systemShopPanel.ts`; shared sid helpers in `client/src/game/bagActions.ts`.

```ts
// packages/shared/src/inventory.ts additions
export const BANK_SID_BASE = 300;            // pages: (300+30(n-1), 300+30n]
export const BANK_PAGE_SLOTS = 30;
export const BANK_MAX_PAGES = 5;
export const QUEST_BAG_SID_BASE = 2310;      // 2311..2340
export const PET_ITEM_BAG_SID_BASE = 2340;   // 2341..2370
export const PAGE_TYPE_BAG = 1;
export const PAGE_TYPE_BANK = 2;
export type PageType = typeof PAGE_TYPE_BAG | typeof PAGE_TYPE_BANK;

export interface TempBagItem { t: number; n: number; b: 0 | 1; c: number }
export interface TempBagContainer { tid: number; ot?: boolean }
export interface TempBagState {              // reply of getTBag / tempBagSort / mxBagSort / oneKeyOpenAllMXTemp
  tempbagNum: number; tempSlotNum: number; curNum: number; dire: boolean; ot: boolean;
  tempBag: Record<number, TempBagContainer>;
  tempList: Record<number, TempBagItem>;
  mx: Omit<TempBagState, 'mx' | 'dire'>;
}

// protocol.ts
export interface GetMakeColorReply { canMake: boolean; colorPerList?: Record<'makePer1' | 'makePer2' | 'makePer3' | 'makePer4', number>; flag?: number }
export interface MakeMaterialRef { tempBagFlag: boolean; idx: number }          // idx = item id, or temp-bag position
export type MakeMaterials = Record<1 | 2 | 3, MakeMaterialRef>;                 // omitted slot = absent
export interface NewMakeReply { flag: boolean }
export interface MaterialMixReply { slotId: number; num: number; flag: boolean; finalNum: number }
export interface StarReply { equSlotId: number; starSlotId: number; num: number; starNum: number; flag: boolean }
export interface ChangeMoneyTypeReply { flag: boolean; num: number }            // num echoes 1..4
export type ShopConfigPush = [code: number, msg: string, rows: string[]];       // onGetShopConfig / onGetLimitShopConfig
export interface CreditUsage { dayDict: Record<string, number>; weekDict: Record<string, number>; monthDict: Record<string, number>; totalDict: Record<string, number> } // updateLimit reply
```

RPC name list (keep exact legacy names): `closeBank`, `bankSort`(fire), `moveItemToPage(srcSid,pageType,tab)`, `npcFuncClick(npcId, passMD5?)`, `getTBag`, `openTempSlot`, `openmxTempSlot`, `tempBagSort`, `mxBagSort`, `oneKeyOpenAllMXTemp`, `addtItemFromBag`, `addmxFromBag`, `moveItemBtwTemp`, `movemxBtwTemp`, `tempToBag`, `mxtempToBag`, `addItemFromTemp`, `addMXFromTemp`, `setTbagDire`, `setTempBag`, `setmxTempBag`, `delTempSlot(pos,passMD5)`, `repair(itemId,mode)`, `repairAll(mode)`, `unlockMoney(passMD5)→bool`, `changeMoneyType(1..4)`, `sellItem(itemId,passMD5?)`, `buySystemItemClient(slotId,n)`, `buySystemItemMulti(map,carStyle)`, `useItemGold({tid,mid?})`, `getShopConfig`, `getLimitShopConfig`, `getRemainShopConfig`, `updateLimit`, `exchangeItem(creditId,n)`, `openShopDirect(shopId)`, `shopClosePanel`, `getMakeColor`, `newMake`, `materialMixOne/All`, `jewelUpdateOne/All`, `starOne/All`, `getStarNum`, `holeDig`, `getHoleNum`, `jewelSet`, `jewelDel`, `getJewelData`, `equResolve`, `changeName`, `changeElement`/`sureChangeElement`, `changeSoul`/`sureChangeSoul`, `changeBind`/`sureChangeBind`, `changePrefix`/`sureChangePrefix`, `changeLevel`, `bindItem`, `useTransport(mapId,flag)`, `useTransportGroup(mapId)`, `changeNameByCard(name)`.
Pushes needed (names legacy): `initViewBankPanel`, `onNpcMsg`, `onGetShopConfig`, `onGetLimitShopConfig`, plus existing `onAddCharactorSlot`, `onDelCharactorSlot`, `onUpChaSlotStackNum`, `onUPP` (incl. `bankSlotNum`, `bagSlotNum`), `onAddItem`, `onBlueMsg`, `onRedMsg`, `onSystemMidMsg`, and for temp bag `updateTempBags` (**Go name, not client-verified**).

Suggested M5 order (client-evidence strength): (1) bank + moveItemToPage + bank slots in getInitSlot; (2) repair/repairAll (+ durability in DTO); (3) forge: newMake/getMakeColor, materialMix, star (visible contracts); (4) human-equipment upgrades from Go + Language; (5) unlockMoney/changeMoneyType + lock flags; (6) system shop (without limit-time/trolley); defer VIP shop, credit shops, runes, life-skill, limit-time shop.

## 9. Open questions (static analysis cannot settle)

1. **BagPanel internals** (aborted): page tab drop (`moveItemToPage(src, 1, tab)`), tool-mode dispatch, silver radios' `changeMoneyType` args (1/2 inferred), bag-expansion item id and RPC, lock flag lifecycle (when `goldLockFlag`/`silverLockFlag` become true again — likely after a timer or `setGoldLock(true)` in `SystemShopPanel.as:1012`; not read).
2. **EquipFunc internals** (aborted): exact arg shapes of holeDig/jewelSet/jewelDel/changeSoul/changeName/etc. are Go-derived only; push order after each (e.g. whether the equipment DTO precedes `onUPP`) unproven.
3. **Pushes** (CallBack stub): names `updateTempBags`, `warnTemporaryBag`, `onItemSort`, `onChangeEquiptInst`, `onCreateItemInstance` come from Go; payloads unverifiable client-side. How the client refreshes equipment durability after `repair` (no payload read) is unknown.
4. `bankSort` / `bagToBank` reply/push contract (client sends them; Go lacks handlers). `getRemainShopConfig(slotId)` reply, `buySystemItemMulti` reply, `getLimitTimeShop` reply keys beyond `{id,tid,gold,point,startTime,endTime}`.
5. Repair cost formula and bound-currency preference ("bạc hoặc ngân phiếu"): client has none; Go's `(max-cur)*10` is a stub.
6. Level-6 mix success text says 30% (client string `EQUIPTFUNCPANEL_S[42]`) vs Go `num*6%`; VIP bonus from `TBL_PM_RIGHT[8]`.
7. `EQUIPTFUNCPANEL_S[102]` (unbound equip + bound star stone confirm) is missing from `Language.as`; `ToolKit.ableToTemp` item eligibility for the convenience bag is not decompiled.
8. Which message the client expects on `unlockMoney` failure (Go pushes a "secondary password failure" notice; text unseen).
