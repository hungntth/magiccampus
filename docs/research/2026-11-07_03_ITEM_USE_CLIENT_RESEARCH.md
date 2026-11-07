# Item use (bag double-click / "Sử dụng") - Flash client contract and H5 delta

Paths are relative to `E:\mcgame\docs\client` unless absolute. All line numbers come from reads/greps in this session.
Things not visible in the decompile are marked **inferred**.

## 1. Summary

Every bag use funnels into `object/Player.as:792 useItem(targetType, petId, slotId, ctrlToPet)`. It does all client-side
gating and decides between a plain `useItem` RPC, an input/confirm dialog, a quantity dialog (`useMultiItem`) or a
specialised RPC. The bag window (`view/view/compDragable/BagPanel.as`) is an aborted stub, so the double-click handler
itself is invisible; the **inferred** wiring is bag slot `Slot.EVENT_SLOT_DCLICK` -> `Player.useItem(1, -1, slot.id)`,
and the "Sử dụng" tool mode goes through `Slot.actionOnItem(ACTION_ITEM)` (`view/view/comp/Slot.as:727`).
`remote.useItem` is a dynamic proxy call with no Responder: fire-and-forget, result arrives as pushes
(`config/RPCConfig.as:61` `RPC_DELAY["useItem"] = 800`).

## 2. Key files

- `object/Player.as:792-1235` - the whole use decision tree. Helpers: `enoughBag` :352, `getMaxPetGrowItemCanUse` :2313, `seekName` :768, `seekNpc` :1304, `trackName` :1703, `footleName` :1402, `antiFootleName` :1807, `festfootleName` :576, `useHalloweenCard` :2014, `useSnowBall` :457, `useTransport` :1352, `useTransportGroup` :1626.
- `view/view/comp/Slot.as:692-802` - `actionOnItem`: tool "use" click on a bag slot (target CHA -> `Player.useItem(1,-1,slotData.id)` :728; target PET -> `Player.useItem(2, view.mousePetId, slotData.id)` :797). `onClick` :1673 raises `EVENT_SLOT_DCLICK` (:1680) for slots with `isDClick`.
- `system/Core.as:1626 useItem(templateId, slot, ctrl)` - hotbar path: looks up first bag slot of template, `CORE_S[9]` "Không có vật phẩm này" when absent; in battle (`state != ST_CORE_NORMAL`) it arms battle item target selection instead of RPC. Caller `UserBarCanvas.as:1029` (`useSlot`), `ProductPanel.as:548`, `Player.as:468`.
- `view/view/compMain/PetCanvas.as:407-458` (also `PortraitCanvas.as:492`, `PetManagerPanel.as:7036`) - the "item" button next to the pet: shows the bag, sets `view.mouseState = ACTION_ITEM`, `mouseTargetType = MOUSE_TARGET_PET`, `mousePetId = battlePet.id` (or -1). Blocked in maze maps 2007/2008/2009 (`MAZE_INFO_PANEL_U[13]`) and when `state == ST_BATTLE` it only opens the bag.
- `view/view/compDragable/MultiItemPanel.as` - choose-one gift bag panel.
- `config/ItemConfig.as` - special template ids, `BATCH_ITEM_LIST` :121. `predef/GamePredef.as:1017-1158` item type constants, `PET_GROW_ITEM_ADD_EXP` :2151.
- `view/view/compDragable/QuestPanel.as:1161` - quest equip auto-activation calls `remote.useItem(1,-1,sid)` directly (no gating).
- Invisible: `BagPanel.as` (aborted), `system/CallBack.as` (stub; push bodies come from Go notes / consumers).

## 3. Language strings (Language.as)

| Constant | Vietnamese | Used in Player.useItem |
|---|---|---|
| `TASKSWEEPPANEL_U[22]` (:5601) | Trong khi tự động hoàn thành phụ bản không thể dùng vật phẩm này | taskSweep gate |
| `PLAYER_S[3]` | Vật phẩm này bạn không dùng được! | useType not 1/3 on character |
| `PLAYER_S[4]` | Cấp độ bạn chưa đủ! | level < reqLevel (char) |
| `PLAYER_S[5]` | Nghề nghiệp bạn không phù hợp! | `reqClass` lacks `\|classId\|` |
| `PLAYER_S[6]` | Vật phẩm này pet không dùng được! | useType not 2/3 on pet |
| `PLAYER_S[7]` | Pet không đủ cấp độ! | `expToLv(pet.exp) < reqLevel` |
| `PLAYER_S[8]` | Bạn không có đủ chỗ trống trong túi đồ! | key (509) / template 3012 with no free slot |
| `PLAYER_S[10]` | Xác nhận tẩy điểm? | 995 reset points |
| `PLAYER_S[11]`,`[12]` | Đối tượng dò tìm: / Vui lòng điền | seek |
| `PLAYER_S[13]`,`[14]` | Tên NPC cần dò tìm: / Vui lòng điền | radar |
| `PLAYER_S[15]`,`[16]` | Đối tượng dùng: / Vui lòng điền | track/footle/halloween/snowball |
| `PLAYER_S[17]`,`[27]` | Chọn bản đồ:  / Mời nhập vào | transport map picker |
| `PLAYER_S[19]` | Vui lòng điền | rose/chaco target name |
| `PLAYER_S[21]` / `[25]` | Tên NPC này không tồn tại. / NPC này không thể dò tìm. | seekNpc |
| `PLAYER_S[24]` | Sau khi ly hôn, độ thân mật của 2 người sẽ trở về 0, các kỹ năng hôn nhân cũng sẽ mất, xác nhận ly hôn? | 122 good card (useGoodCard) |
| `PLAYER_S[26]` | Pet không tồn tại. | pet equipment with no target pet (Alert) |
| `PLAYER_S[30]` / `[31]` | Dùng / Nhập số lượng dùng： | quantity dialog title/prompt |
| `PLAYER_S[32]` | Cấp độ pet vượt quá giới hạn, cấm dùng thuốc | not referenced in Player.useItem (pet grow; inferred server push) |
| `CORE_S[9]` | Không có vật phẩm này | Core.useItem hotbar, template absent |
| `CALLBACK_S[58]` | Đối tượng tặng:  | rose/chaco title |
| `GROUPPANEL_U[14..17]` | Bạn không có Sách Hồi Nhóm... / Bạn không ở trạng thái tạm rời nhóm / Xác nhận muốn dùng Sách Hồi Nhóm? / Bạn đang chiến đấu hoặc quan sát chiến đấu, không thể về nhóm | 3552 return-to-team |
| `CHANGE_SEX_CARD[0]` | Xác nhận đổi giới tính? | 2844 |
| `CHARACTORPANEL_S[9..11]`, `CHARSELECTCANVAS_S[19]` | Nhập tên mới (giới hạn 12 ký tự) / Đổi tên / Tên mới chứa ký tự không hợp lệ... / Nhập tên nhân vật bao gồm ký tự đặc biệt... | 2126 rename card |
| `MULTI_ITEM_PANEL[0..4]` | Có thể nhận {num} vật phẩm bên bảng dưới. / Có thể nhận toàn bộ / Nhật / Túi quà / Không đủ chỗ trống. | gift bag panel |

## 4. Flow: `Player.useItem(targetType, petId, slotId, ctrlToPet)` (Player.as:792)

Order of evaluation, each step returns on refusal:

1. `slot = data.sList[slotId]`; if `ctrlToPet` -> `targetType = 2`, `petId = battlePet.id` if a battle pet exists (:811-818). Missing slot: silent no-op.
2. Task sweep gate (:821-829): template `skillId <= 0` while `player.taskSweep` -> `sysMidNote(TASKSWEEPPANEL_U[22])`.
3. `tData = getTemplateData(slot.type, slot.itemId)`. If `tData.kind == 9 (ITEM_KIND_PETEQU)` and `50 <= tData.position <= 57` -> force `targetType = 2`; `petId` = open+visible pet-manager panel's pet, else battle pet; `petId < 0` -> `Alert(PLAYER_S[26])` (:833-853).
4. Target CHA (:854-871): `useType` must be 1 or 3 (`PLAYER_S[3]`); `player.level >= reqLevel` (`[4]`); `reqClass.indexOf("|"+classId+"|") >= 0` (`[5]`).
5. Target PET (:874-891): `useType` must be 2 or 3 (`[6]`); `petList[petId]` must exist (else silent return); `PetLogic.expToLv(pet.exp) >= reqLevel` (`[7]`). No class check for pets.
6. Type switch (:893-909): `type 509 (KEY)`: `enoughBag(1)` else `PLAYER_S[8]`; if Treasure panel visible with `tData.l` (`Treasure.useFlag()`, Treasure.as:1402) -> silent return. `type 520 (TARGET_ITEM)`: `remote.itemToTarget(slotId)` and return (no confirm, no useType gate bypass: steps 4-5 already ran). Template id `3012` repeats the key checks (:910-921).
7. Only when `slot.type == TBL_ITEM_INSTANCE (28)` (consumable instance rows; equipment rows skip to the plain call at :1231):
   - **Batch (:933-951)**: `itemId in 5375..5697` or in `BATCH_ITEM_LIST [6232,6286,2336,5354,4884,6515,6562,6733]`: `stackNum > 1` -> `PANEL_INPUT.showInputNum(PLAYER_S[31], PLAYER_S[30], cb, max=stackNum, 1, stackNum)`, cb -> `useMultiItem(targetType, petId, slotId, n)`; `stackNum == 1` -> `useItem(targetType, petId, slotId)`. Quantity prompt is hard-coded in client (no template flag).
   - Special template ids (:952-1227), first match wins:

| Template id(s) (ItemConfig) | Client action | RPC (arg order) |
|---|---|---|
| 995 ITEM_RESETPOINT | confirm `PLAYER_S[10]` | `useItem(targetType, petId, slotId)` on Yes |
| 122 ITEM_GOOD_CARD | confirm `PLAYER_S[24]` | `useGoodCard()` (no args) |
| 1033, 1482 seek | name input | `useSeek(name)` |
| 1397, 1484, 1615 radar | NPC-name input; local check NPC exists in `TBL_NPC` with a row `fd > 0` else `PLAYER_S[21]`/`[25]` | `useRadar(name)` |
| 1034 track | name input | `useTrack(name)` |
| 1405 footle / 1406 anti-footle / 2799 feast fool | name input | `useFootle(name)` / `useAntiFootle(name)` / `useFestFootle(name)` |
| 3553 halloween card / 3590 snow ball | name input | `useHalloweenCard(name)` / `useSnowBall(name)` |
| 1036, 1363, 1515, 2946 teleport | map picker (`showPositionInput`) | `useTransport(mapId, true)` (Player.as:1372, 2170) |
| 2947-2950, 3722, 4941, 4942 senior teleport | picker; leader -> group | `useTransportGroup(...)` (:1646) else `useTransport` |
| 3552 return-team book | local gates (has item `GROUPPANEL_U[14]`, `groupAfk` `[15]`, not in battle/watch `[17]`), confirm `[16]` | `unGroupAFK(false)` on Yes (**not** `useItem`) |
| 32, 1302, 1303, 1315 roses/chaco | name input then (500 ms later) quantity dialog `1..hasNum` | `useIntimacyItem(name, n, tid)` |
| 1691-1693 wedding invitation | none | `useWeddingBag(slotId)` |
| 1710 wedding red bag | none | `useRedBag(slotId)` |
| 2126 rename card | name input; `haveSpecialStr`/`haveSpecialStr2`/`haveBadWord` local checks | `changeNameByCard(name)` |
| 2844 change sex card | confirm `CHANGE_SEX_CARD[0]` | `changeCharSex()` |
| 961,962,964,1585,1586,1587,1836,3339 pet grow potions | stack>1: quantity dialog max = `min(stackNum, getMaxPetGrowItemCanUse)` where cap = pet to `min(level+5, MAX_LEVEL)`, `ceil((lvToExp(cap)-pet.exp)/PET_GROW_ITEM_ADD_EXP[id])`; if max 0 nothing happens; stack==1 -> `useItem` | `useMultiItem(targetType, petId, slotId, n)` |
| 643, 1076, 2908 wallets; 5343, 3815, 4591, 5256, 4839, 3816, 4905, 4906, 4196..4276 (step 5), 4551, 4571, 4838, 4886, 4724, 5968, 5967, 5948, 5949, 5215, 5216, 4673 | stack>1: quantity dialog `1..stackNum`; stack==1 -> `useItem` | `useMultiItem(targetType, petId, slotId, n)` |
| default | none | `useItem(targetType, petId, slotId)` |

   Every `useItem` / `useMultiItem` carries `(targetType:int 1|2, petId:Number -1 for char, slotId:Number)`.

Hotbar/other callers: `Core.useItem` (Core.as:1626) -> `Player.useItem(1, -1, slot.id)`; in battle it does not RPC (arms battle command `BATTLE_ACTION_ITEM`, Battle.as:133 etc. - handled by `battleCmd`, not `useItem`).

## 5. Gift boxes / choose-one bags

- No dedicated client branch in `Player.useItem`: a choose-one bag is an ordinary type 550 (use_type 1) default `useItem`.
- Server answers with push **`itemMultitoSel(payload, packItemSid)`** (handler body invisible; signature inferred from `MultiItemPanel.setItemList(_arg_1:Object, _arg_2:uint)`, MultiItemPanel.as:491). Payload read keys: `packItemList` = map idx -> `{ti: table type (29 item, 19 equipment, TBL_CREATURE for pets), ii: template id, n: count, q: quality}`, `packGetNum` (number or the string `"all"`). `packItemSid` = bag item id (`data.sList[...]`, shows the bag icon). Go source of the push: `internal/presentation/rtmp/handlers/item/gift_box_pick.go:72-75`.
- Panel layout: 3 slots per page (`slotItem1..3`, `NUM_PER_PAGE`), page selector hidden when <= NUM_PER_PAGE; text `MULTI_ITEM_PANEL[0]` with `{num}` or `[1]` when `"all"`.
- Click a slot -> `selItem(n)`; button -> `getItemByIdx` (MultiItemPanel.as:559): local gates: `ti == TBL_CREATURE` needs `player.enoughPetSlot(1)`, `TBL_ITEM_TEMPLATE`/`TBL_EQUIPT_TEMPLATE` need `player.enoughBag(1)`, else `sysMsg(MULTI_ITEM_PANEL[4])` "Không đủ chỗ trống.". Then `call("selMultiItemByIdx", Responder(onGetItemByIdx), packItemSid, selectedIdx)`.
- Reply `int`: `< 0` -> nothing; `0` -> panel hides; `n > 0` -> picked entry is removed locally from `itemList` and panel re-renders with `packGetNum = n` (remaining picks).
- **No "open N at once" RPC other than `useMultiItem`**; no `selMulti...` batch variant. Rows with `ti` equal to creature use `colorByGrowRate(q/10)`.

## 6. Responses after `useItem` / `useMultiItem`

`remote.useItem` has no Responder, so the effect shows up only through pushes (CallBack.as is a stub; the names below come from Go `handlers/item/use.go:336-384 sendEffectCallbacks` and existing H5 client handlers, **inferred** for payloads not read in the client tree):

| Push | When | Payload (client-read keys inferred from H5 handlers / Go) |
|---|---|---|
| `onAddCharactorSlot(slotDto)` | stack decremented (re-sent row) or new rows granted | bag item DTO |
| `onDelCharactorSlot(id, sid)` | last unit consumed | id, sid |
| `onUPP(obj)` | HP/MP/exp/currency/page counts changed | partial player |
| `onMidNote(msg)` | effect text ("Đã mở X.") | string |
| `onSystemMidMsgOrNote(msg)` | refusals (red `[Sự kiện]` line + mid note) | string |
| `onAddItem({i,q,s,c,t,n,tt})` | gain notice "Nhận: ..." (`CALLBACK_S[52]`) | compact notice |
| `onAddPet`, `onAddFairy`, `onPutSoulToBag`, `onUpdateDressList(1, dressId, expiryMs)` | pet/fairy/soul/mount-dress grants | DTOs |
| `itemMultitoSel` | choose-one bags | section 5 |
| temp-bag offer (Go `offerTemporaryBag`) | reward overflow | **unknown payload in client** |

Ordering is not provable statically (CallBack stub); Go order is: onMidNote, then per granted item onAddCharactorSlot, onAddItem notices, then pets/fairies, etc. Slot update of the consumed stack ordering relative to those is a runtime question.

## 7. Items used on pets (`useItem(2, petId, slotId)`)

Client gate: `useType` 2 or 3 and `expToLv(pet.exp) >= reqLevel`. By type:
- **507 PETFUNC** (life restore, pet skill items, buffs): reach the pet via the pet "item" button (`mouseState ACTION_ITEM`, `mouseTargetType=PET`) or Ctrl (`ctrlToPet`, forces `battlePet`). The client does not special-case 507; only the `useType` gate applies (**inferred**: 507 rows have use_type 2/3).
- **Kind 9 pet equipment, position 50..57 (types 900-907)** auto-target the pet shown in the open pet panel (else battle pet); the useType 2/3 gate then runs because `targetType` was forced to PET.
- **Pet grow potions** 961/962/964/1585-1587/1836/3339: `useMultiItem(2, petId, slotId, n)` with the level-cap dialog above.
- Anything else with `use_type` 2 or 3 (types 507/550, 508, 512/513 per Go notes) follows the same default `useItem` path.

## 8. Types 500-552 / 600-612 / 1400-1404 - what the client actually distinguishes

Only these `type` values have a client branch in `Player.useItem`: **509 (key)** and **520 (target item)**; 600-612 (materials), 1400-1404 (feathers) and every other 5xx type have **no** client branch (plain `useItem`, gated only by use_type/level/class). Everything else is decided by `use_type` (CHA 1/3, PET 2/3) or by hard-coded template ids (section 4). Panels that open for items (forge, gem socket, pet panel) are **not** opened from `Player.useItem`; they run from their own bag components (`EquipFuncBag`, `FuncBag.DClickCallBack` -> `PetFuncPanel.funcBagClickHandler` :4133, `WingFuncPanel.funcBagClickHandler` :6355) when that panel is open - the H5 `forgeHook`/`tradeHook` equivalents.

## 9. H5 client delta (`client/src/game/bagActions.ts`, `BagController.ts`, `ui/bagPanel.ts`, `ItemFuncs.ts`)

Present: reqLevel gate, `useItem(1,-1,id)` / `useItem(2,petId,id)` for 507, 800 ms throttle, scroll picker + rename card (ItemFuncs), unGroupAFK server RPC, pet gear double-click (`petGear`), tradeHook/forgeHook/bank deposit intercepts, pushes onAddCharactorSlot/onDelCharactorSlot/onUPP/onAddItem/onSystemMidMsgOrNote.

Missing client branches (bagActions.ts:32-46):
1. `useType` gate with `PLAYER_S[3]` (char needs 1|3) and `PLAYER_S[6]` (pet needs 2|3); H5 only checks `tplType === 507`.
2. `reqClass` gate `PLAYER_S[5]` (BagItem may not carry reqClass - check).
3. Pet target gates: pet missing silent, pet level `PLAYER_S[7]`; H5 forces pet only for 507 and shows its own "Bạn chưa có pet..." toast (not legacy text).
4. Task sweep gate (`TASKSWEEPPANEL_U[22]`).
5. Key (509) and template 3012: `enoughBag(1)` check + Treasure panel `useFlag` guard.
6. **Type 520 -> `itemToTarget(slotId)`**: no client branch and no server RPC.
7. **`useMultiItem(targetType, petId, slotId, n)`** + quantity dialog (`Nhập số lượng dùng：`, title `Dùng`) for ids 5375-5697, `BATCH_ITEM_LIST`, wallets/packages list, and pet grow potions (with cap formula, needs `PET_GROW_ITEM_ADD_EXP`). No client or server support; `askAmount` exists and can be reused.
8. **Choose-one bags**: no `itemMultitoSel` handler, no MultiItemPanel, no `selMultiItemByIdx`; server also lacks them.
9. Special-id dialogs and RPCs not ported: `useGoodCard` (122), `useSeek`, `useRadar` (+NPC existence check), `useTrack`, `useFootle`, `useAntiFootle`, `useFestFootle`, `useHalloweenCard`, `useSnowBall`, `useIntimacyItem(name, n, tid)` (32/1302/1303/1315), `useWeddingBag(slotId)`, `useRedBag(slotId)`, `changeCharSex` (2844) + confirm, 995 reset-point confirm, 3552 return-team (RPC `unGroupAFK` exists server-side, client local gates absent), pet-equip auto target (`petGear` partly covers; verify the 50..57 / `PLAYER_S[26]` behaviour).
10. Pet "item" button / Ctrl-to-pet (`ctrlToPet`, `mouseTargetType PET` tool mode) - H5 `use` tool mode only targets the character.
11. Pushes not handled in `BagController`: `onMidNote`, `onAddPet`, `onAddFairy`, `onPutSoulToBag`, `onUpdateDressList`, `itemMultitoSel` (check other controllers before relying on this list).
12. H5 equips equipment through `useItem` with `itemType === EQUIP`; legacy sends the same `useItem` for equipment (non-INSTANCE rows hit the plain call at Player.as:1231), so that matches.

Server (`server/src/modules/inventory/use-item.service.ts`): handles equipment, 501/502 potions, 505 skill books, blood bags, page books, order items, pet 507; no `useMultiItem`, `itemToTarget`, `selMultiItemByIdx`, `useIntimacyItem`, `useSeek/useRadar/useTrack/useFootle/...`, `useGoodCard`, `changeCharSex`, `useWeddingBag`, `useRedBag` registered (grep of `server/src`). Its use_type gate rejects 2 and 4 on the character instead of "not 1 or 3" (use_type 0/other pass).

## 10. Proposed shared types

```ts
export interface UseMultiItemArgs { targetType: 1 | 2; petId: number; slotId: number; count: number } // positional on the wire
export interface PackChoice { ti: number; ii: number; n: number; q: number }
export interface ItemMultitoSelPush { packItemList: Record<string, PackChoice>; packGetNum: number | 'all' } // + arg2 packItemSid
export type SelMultiItemByIdxReply = number; // -1 refused, 0 done, >0 picks left
```
Wire: `useMultiItem(targetType, petId, slotId, n)`, `itemToTarget(slotId)`, `selMultiItemByIdx(packItemSid, idx)`.
Owner: server `modules/inventory/` (use-item split into a registry), client `game/bagActions.ts` + a new `ui/giftPickPanel.ts`.

## 11. Open questions

- Bag double-click exact code (BagPanel stub): inferred from Slot/UserBar; is Ctrl+double-click use-on-pet or sell? (`ctrlToPet` is passed by `Core.useItem` from UserBar `ctrlKey`; for the bag unknown.)
- `itemToTarget`: what the server pushes to open the target-item UI and what consumes the response is invisible (CallBack stub); Go `ItemToTarget` (use.go:278) just returns `{success,result}`.
- Push ordering after `useItem` (slot row vs. onUPP vs. gain notice) cannot be proven statically.
- Whether pet-func (507) rows all have `use_type` 2/3 (data question for seeds).
- Reply type of `useMultiItem` (Go returns `{success,count,result}`), no Responder in client so unused.
