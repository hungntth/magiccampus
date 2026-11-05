# Túi Tiện Dụng, Túi tạm thời, bank extras (M11 phase C)

Plan: `docs/plans/2026-11-04_14_MAIL_AUCTION_BAGS.md` (phase C, implementation notes at the end). Built 2026-11-05.
Legacy: `E:\mcgame\docs\memory\temp-bag.md`, `bag-bank-tabs.md`, research `2026-10-22_06_TUI_TIEN_DUNG_RESEARCH.md` (wire contract).

## Contract (shared `tempBag.ts`)
- `TEMP_BAG` constants, `TempSlotData {t, n, b, c, item?}`, `TempHolder {tid, t, ot, name?, iconCode?, slots?}`, `TempSubBag`, `TBag` (`+ dire`, `mx`),
  `TemporaryEntry`, `TempDirectEffect`, `TEMP_BAG_TEXT`, `BankQuickMove`, `BAG_DELETE_MAX`.
- Slot layout (`tempIndex(mx, pos)` / `tempPos(index)`, unit-tested over 1..500 for both bags): normal posId 1..99 -> slotIndex `pos-1`, Ma Tâm
  1..99 -> `99+pos`, posId >= 100 -> `100+pos` (normal) / `1000+pos` (Ma Tâm). Rows are `character_items` slot type 3 (`SlotType.TEMP_BAG`).
- Accept rules: `acceptsNormalTemp` (kind 6 / 14 or type 503 / 552, never Ma Tâm), `isMaTam` (template 5375-5697 / 5770-5841 or type 506).
- H5 extensions (the plan's decision 8): `TempSlotData.item` is the resolved `BagItem` (id = real item id, name, icon, tooltip), `TempHolder.name /
  iconCode / slots` for the holder box.
- `PlayerData.tBag` is sent at login through `CharacterService.addLoginExtra`.

## State (`Character.tempBag`)
`{ n: {opened, holders: {"1": {tid, num, exp}}}, mx: {...}, dire }`, defaults on read (no migration). Written only under `withCharLock`.
Capacity (`tempbag-rules.ts capacityOf`): sum of `num` of holders in OPENED holder slots that have not expired (+ 12 for Ma Tâm, + VIP right 5 on the normal bag:
`PmStateService.levelOf` + `rights()` id 5 value), capped at 500. Items above the capacity stay listed and can be taken out (Go).

## RPCs (all registered WITHOUT quiet; none is quiet yet)
- `modules/tempbag/`: `tempbag.rpc.ts` (21 RPCs), `tempbag-state.service.ts` (payload, capacity, template cache), `tempbag-moves.service.ts` (put / between /
  take / remove / sort), `tempbag-holders.service.ts` (openSlot, place, dire), `temporary-bag.service.ts` (Túi tạm thời), `tempbag-loot.service.ts` (loot routing),
  `tempbag-rules.ts` (+test, pure planners).
- Temp bag: `getTBag`, `addtItemFromBag` / `addmxFromBag(bagSid, posId)`, `moveItemBtwTemp` / `movemxBtwTemp(from, to)`, `tempToBag` / `mxtempToBag(posId)`,
  `addItemFromTemp` / `addMXFromTemp(posId, bagSid[, num])`, `delTempSlot` / `delmxTempSlot(posId[, md5])`, `setTempBag` / `setmxTempBag(bagSid, holderSid)`,
  `setTbagDire(bool)`, `openTempSlot` / `openmxTempSlot`, `tempBagSort` / `mxBagSort` (reply = `tBag`, also pushed as `updateTempBags`),
  `oneKeyOpenAllMXTemp` (refuses with "Chức năng Mở nhanh chưa hỗ trợ.", replies `tBag`; behaviour needs M13.5 Monster Heart).
- Pushes: `onMoveToTBag` / `onMoveMXToTBag(bagSid, posId, slot, curNum)` (no `onDelCharactorSlot`: the client removes the bag row by sid),
  `onMoveTempBtw` / `onMoveMXBtw(pos1, data1, pos2, data2, curNum)`, `onAddItemDelTemp` / `onAddItemDelmx(slot|null, posId, curNum)` + `onAddCharactorSlot`,
  `onAddTempDirect` / `onAddMXTempDirect(effect, posId, slot, curNum)`, `updateTempBags`.
- Túi tạm thời: `addSingleItemToBag(index)`, `addAllToBag()`; pushes `warnTemporaryBag(list)`, `updateTemporaryBag(list)`, `closeWarnTemporaryBag()`,
  `onAddTemporaryItem(effect)`. Per-session list `Session.temporaryBag` (max 30), reset on `chooseCharactor` / `backToCharSelect`, gone with the socket.
- Bank / bag: `bankSort()`, `bagToBank(sid, dir)` (1 bag tab -> bank, 2 bank -> bag; needs `session.bankOpen`), `delBagItems(ids[, md5])` (reply `{success, num}`).
- Refusals are `RpcException.forbidden(note)`; the RPC layer shows the note through `onSystemMidMsgOrNote` and the call rejects (the client ignores the rejection).
  Trade-locked callers are refused for `addItemFromTemp` / `addMXFromTemp` / `setTempBag` / `setmxTempBag` (Go list).

## Rules
- Moves never copy: a whole stack changes `slotType` / `slotIndex` with a conditional `updateOne`; a merge deletes the source before raising the target
  (`mergeInto`, restored on failure); a split lowers the source before creating the new row (refunded on failure); a swap goes through slotIndex -1.
  All under `withCharLock`. Smoke test: 120 racing calls (put / take / between / bag moves) kept every template total unchanged.
- Holders: `openTempSlot` spends `HOLDER_COST[opened]` gold (10 / 50 / 100 / 200 / 500, unbound `gold`) BEFORE writing `opened`; `setTempBag` consumes one bag
  item BEFORE recording the holder (restored when the write fails). Replacement needs more slots, or the same count over a timed holder. Expiry = now + `t`
  minutes (`t <= 0` forever); `data_tbl_item_template.t` was added to the template projection.
- Loot (`combat/battle-loot.service.ts credit()`): per drop under the character lock, `TempBagLootService.route` first (Ma Tâm -> Ma Tâm bag always; other
  eligible materials -> normal temp bag only with `dire` on; whole count must fit one stack, else the bag), then the bag, then the Túi tạm thời. Pushes ride
  `BattleLoot.pushes` and are sent at `battlePlayEnd` after the bag pushes. When even the Túi tạm thời is full (30) the drop is lost with
  "Túi tạm thời đã đầy, vật phẩm rơi ra đã mất." (what Go does). Eligible = client rule + dust types 523 / 524 (Go `IsRewardTempTemplate`).
- Other grants (shop, quest, mail, gathering) still go to the bag (plan decision 11; Go's global rewriter is not ported).
- Bank: `bankSort` reuses `planSort` over bank rows; `bagToBank` merges into a matching stack with room, else the first free slot of the opened pages of the
  destination; a stale (empty) source is ignored; a full destination answers "Kho đã đầy." / "Túi đã đầy.".

## Client
- `game/TempBagController.ts`, `ui/tempBagPanel.ts` + `tempBag.css`, `ui/temporaryBagPanel.ts`, `ui/hud/temporaryNotice.ts`.
- Entry point: bag toolbar button "Túi tiện dụng" (`BagController.onOpenTempBag`). Two tabs, 5 holder slots (Mở + confirm "Xác nhận trả {cost} vàng để mở ô túi mới?";
  drop a type-517 bag item on an opened slot), 24-slot pages, capacity line, Sắp xếp (30 s client throttle), Mở nhanh (Ma Tâm tab), "Trực tiếp" checkbox.
  Drag bag -> slot, slot -> slot, slot -> bag window (`BagController.onDropTemp`, Shift asks the amount), double-click slot -> bag, right-click -> destroy (confirm).
- Túi tạm thời: HUD icon (blinking, hidden under `.in-battle`) under the mail notice, window with "Nhận toàn bộ", double-click an entry.
- Bank panel: Sắp xếp button (confirm, disabled 30 s), double-click `bagToBank(sid, 2)`; `BagController.deposit` uses `bagToBank(sid, 1)`; `onBankSort` shares `sorted()`.
- Bag Vứt bỏ: picks across pages (red outline), second click on the tool confirms "Xác nhận xóa N vật phẩm đã chọn?" -> `delBagItems`.
- `DragPayload.from` also 'temp' | 'mx' (with `pos`); `ChatBox.noticeItem` takes a prefix ("(Túi Tiện Dụng)Nhận:", "(Túi tạm thời)nhận được:").

## Deferred
- Re-pushing `updateTempBags` when the PM level changes (Go does after `buyPm`); the panel re-reads `getTBag` on open, so the new VIP slots appear after reopening.
- `oneKeyOpenAllMXTemp` behaviour (M13.5), gathering routing (M15), crafting / quest counting of temp-bag materials, `changeBagGroup`.
- Art: CSS only (no swfui render of TempBagSlot / TemporaryBagPanel / the warn icon).
- Trade-lock gate for `delBagItems` (Go refuses it while a trade offer is locked): InventoryModule cannot import TradeModule; a locked trade whose item vanished fails
  cleanly in the swap saga instead.
